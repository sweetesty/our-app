import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errorMessage } from '../../lib/supabase'
import { useSession } from '../../context/SessionProvider'
import { cx, ErrorNote, Loading } from '../ui'
import BoardHeader, { useTurnClock } from './BoardHeader'
// The same drawer Whot uses. It only needs a match id and two names, so there
// was never anything card-specific about it — the other two were simply going
// without a way to say "your go" without leaving the board.
import WhotChatDrawer from './WhotChatDrawer'
import type { BoardMatch, AyoState } from '../../lib/types'

/**
 * Ayo.
 *
 * Twelve houses in a ring, six a side, four seeds each. The client draws the
 * board and sends "I want to play house 3"; every rule lives in `ayo_move()`.
 * That is not tidiness — a board game whose legal-move check runs in the
 * browser is one where anyone with devtools wins, and "he cheats at Ayo"
 * should stay a joke.
 *
 * Two things make it feel like a board rather than a form.
 *
 * The houses are carved, not drawn: an inset shadow on a wood gradient reads
 * as a hollow, and seeds get a highlight and a cast shadow so they sit *in* it.
 * Flat circles on a flat panel looked like radio buttons.
 *
 * And the sowing is animated from frames the engine recorded as it sowed —
 * every seed drop and every relay pickup, in order. The client cannot work the
 * journey out for itself, because a relay pickup is indistinguishable from
 * ordinary sowing once it is over; so the server says, and this replays it.
 */

const RULES = [
  'Start from any house on your side that has seeds.',
  'Seeds drop one per house, anticlockwise, skipping the house you emptied.',
  'If your last seed lands in a house that already had seeds, pick them all up and keep going.',
  'If it lands in an empty house on your side, you take the seeds facing it.',
  'When one of you has nothing left to play, the other takes the rest. Most seeds wins.',
]

/**
 * How long each kind of frame is held.
 *
 * One flat speed was too fast to follow, and worse, it made the relay
 * invisible: the moment where you land on a house, scoop up everything already
 * in it and carry on is the whole character of the game, and at a uniform
 * 130ms it went by as one more dot appearing. A relay now gets most of a second
 * and a visible flash, so you can see the handful being picked up.
 */
const HOLD: Record<string, number> = {
  lift: 420,
  drop: 230,
  relay: 780,
  take: 900,
  sweep: 700,
}

/**
 * Seeds, scattered rather than gridded.
 *
 * A neat grid of dots is the thing that made this look like a form. Real seeds
 * fall where they fall, so each one gets an offset derived from its index — a
 * fixed pseudo-random scatter, so a house with four seeds always looks the
 * same rather than reshuffling on every render.
 */
function Seeds({ n, lifting }: { n: number; lifting?: boolean }) {
  if (n === 0) return null

  if (n > 8) {
    return (
      <span className="relative z-10 text-base font-bold text-amber-50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        {n}
      </span>
    )
  }

  return (
    <span className="absolute inset-0">
      {Array.from({ length: n }, (_, i) => {
        // Golden-angle scatter: spreads points evenly without ever lining up.
        const a = i * 2.39996
        const r = 10 + (i % 3) * 7
        const x = 50 + Math.cos(a) * r
        const y = 50 + Math.sin(a) * r
        return (
          <span
            key={i}
            className={cx(
              'absolute size-[22%] rounded-full transition-all duration-200',
              lifting && 'scale-0 opacity-0',
            )}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              background:
                'radial-gradient(circle at 32% 28%, #FDE9B8 0%, #E8B96A 45%, #9C6B2F 100%)',
              boxShadow:
                '0 1px 2px rgba(0,0,0,0.55), inset 0 -1px 1px rgba(0,0,0,0.25)',
            }}
          />
        )
      })}
    </span>
  )
}

export default function Ayo({ onBack }: { onBack: () => void }) {
  const { userId, coupleId, summary } = useSession()
  const [match, setMatch] = useState<BoardMatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [error, setError] = useState('')

  /** What the board is showing right now — lags the truth while sowing. */
  const [shown, setShown] = useState<number[] | null>(null)
  /** The house the animation is currently dropping into. */
  const [lit, setLit] = useState<number | null>(null)
  const [sowing, setSowing] = useState(false)
  /** What the current frame is doing, so the screen can say it out loud. */
  const [kind, setKind] = useState<string | null>(null)
  const timers = useRef<number[]>([])

  const partnerName = summary?.partner?.display_name ?? 'They'
  const myName = summary?.me?.display_name ?? 'You'
  const [showChat, setShowChat] = useState(false)

  // Above every early return, and taking match?.turn rather than match.turn.
  // It sat below the "no game yet" return, so the first render with a board on
  // the table called one more hook than the render before it — which React
  // refuses outright. That was the blank screen.
  const clock = useTurnClock(match?.turn)

  const load = useCallback(async (id?: string) => {
    const q = supabase.from('board_matches').select('*').eq('game', 'ayo')
    const { data, error: qErr } = id
      ? await q.eq('id', id).maybeSingle()
      : await q.is('finished_at', null).maybeSingle()

    if (qErr) setError(errorMessage(qErr))
    else setMatch((data as BoardMatch) ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Replay the engine's frames.
   *
   * Runs for whoever is looking, including the player who didn't move — which
   * is the half that matters. Watching their seeds go round is how you see
   * what they did to you.
   */
  useEffect(() => {
    const state = match?.state as AyoState | undefined
    const frames = state?.frames
    if (!state) return

    timers.current.forEach(clearTimeout)
    timers.current = []

    if (!frames || frames.length === 0) {
      setShown(state.pits)
      setLit(null)
      setSowing(false)
      return
    }

    setSowing(true)

    // Cumulative, because the frames are no longer the same length as each
    // other — a relay has to breathe where a plain drop does not.
    let at = 0
    frames.forEach((f) => {
      const wait = at
      timers.current.push(
        window.setTimeout(() => {
          setShown(f.pits)
          setLit(f.at >= 0 ? f.at : null)
          setKind(f.kind)
        }, wait),
      )
      at += HOLD[f.kind] ?? 230
    })

    timers.current.push(
      window.setTimeout(() => {
        setShown(state.pits)
        setLit(null)
        setKind(null)
        setSowing(false)
      }, at + 320),
    )

    return () => timers.current.forEach(clearTimeout)
  }, [match?.state])

  // Their move should land on your board, not wait for a refresh.
  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel(`ayo-${coupleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'board_matches',
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload) => {
          const row = payload.new as BoardMatch
          if (row?.game === 'ayo') setMatch(row)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId])

  async function start() {
    if (match && !match.finished_at) {
      return setError('A game is already in progress! You must finish or resign before starting a new game.')
    }
    setBusy(true)
    setError('')
    // opts passed explicitly so the call can only ever match the
    // two-argument signature — see 0060_one_start_board.sql.
    const { data, error: rpcError } = await supabase.rpc('start_board', {
      game_name: 'ayo',
      opts: {},
    })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await load(data as string)
  }

  async function play(house: number) {
    if (!match || busy || sowing) return
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('ayo_move', {
      match: match.id,
      house,
    })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await load(match.id)
  }

  async function resign() {
    if (!match || busy) return
    if (!window.confirm(`Concede this Ayo game to @${partnerName}? They will be awarded the win and this game will end.`)) return
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('resign_board', { match: match.id })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await load(match.id)
  }

  function clear() {
    if (!match) return
    // Reset local state without deleting row so match history and stats are preserved
    setMatch(null)
    setShown(null)
  }

  if (loading) return <Loading label="Setting the board…" />

  /* ---- no game on the table --------------------------------------------- */

  if (!match) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="text-xs font-semibold text-rose-400 transition hover:text-rose-200"
        >
          ← Games
        </button>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div
          className="rounded-3xl p-8 text-center shadow-2xl"
          style={{
            background:
              'linear-gradient(160deg, #6B4423 0%, #4A2C14 45%, #2E1A0C 100%)',
            boxShadow:
              'inset 0 1px 0 rgba(255,220,160,0.18), 0 20px 40px rgba(0,0,0,0.5)',
          }}
        >
          <p className="text-4xl">🪵</p>
          <p className="mt-3 text-xl font-bold text-amber-50">Ayo</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-amber-200/70">
            Forty-eight seeds, twelve houses, and whoever ends up holding more of
            them. Take your turns whenever — it waits.
          </p>
          <button
            disabled={busy}
            onClick={() => void start()}
            className="mt-5 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-700 px-6 py-3 text-sm font-bold text-amber-950 shadow-lg transition hover:from-amber-400 disabled:opacity-50"
          >
            {busy ? 'Setting up…' : 'Set the board'}
          </button>
        </div>

        <Rules open={showRules} onToggle={() => setShowRules((v) => !v)} />
      </div>
    )
  }

  /* ---- playing ----------------------------------------------------------- */

  const state = match.state as AyoState
  const pits = shown ?? state.pits
  const seat: 'a' | 'b' = match.player_a === userId ? 'a' : 'b'
  const theirs = seat === 'a' ? 'b' : 'a'
  const myTurn = match.turn === seat && !match.finished_at && !sowing
  const over = !!match.finished_at

  // Your six are always the row nearest you. Seat B therefore sees the ring the
  // other way up, which is what sitting opposite someone means.
  const mineLow = seat === 'a' ? 0 : 6
  const myHouses = Array.from({ length: 6 }, (_, i) => mineLow + i)
  const theirHouses = Array.from({ length: 6 }, (_, i) => (seat === 'a' ? 11 - i : 5 - i))

  return (
    <div className="space-y-4">
      <BoardHeader
        emoji="🌰"
        title="Ayo"
        subtitle="Table for Two • Ayoayo"
        mode="📖 Rules"
        onMode={() => setShowRules((v) => !v)}
        me={{ name: 'You', tally: `🌰 ${state.store[seat]}`, colour: '#D97706' }}
        them={{ name: partnerName, tally: `🌰 ${state.store[theirs]}` }}
        myTurn={myTurn}
        over={over}
        seconds={clock}
        onResign={() => void resign()}
        onBack={onBack}
        onChat={() => setShowChat(true)}
        error={error || null}
        announcement={
          over
            ? match.winner === 'draw'
              ? 'A draw — 24 each 🤝'
              : match.winner === seat
                ? 'You won 🏆'
                : `${partnerName} won`
            : sowing
              ? kind === 'relay'
                ? 'Picked them up — going again'
                : kind === 'take'
                  ? 'Captured'
                  : 'Sowing…'
              : myTurn
                ? 'Your move — tap one of your houses'
                : `Waiting on ${partnerName}…`
        }
      />
      {/* The board itself: one piece of wood with twelve hollows cut into it. */}
      <div
        className="rounded-[2rem] p-4 sm:p-5"
        style={{
          background:
            'linear-gradient(165deg, #7A5130 0%, #5A3A1E 38%, #3A2211 100%)',
          boxShadow:
            'inset 0 2px 0 rgba(255,225,175,0.22), inset 0 -3px 8px rgba(0,0,0,0.5), 0 24px 48px -12px rgba(0,0,0,0.65)',
        }}
      >
        <Store
          name={partnerName}
          seeds={state.store[theirs]}
          align="start"
        />

        <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
          {theirHouses.map((h) => (
            <House key={h} n={pits[h]} active={lit === h}
              scoop={lit === h && (kind === 'relay' || kind === 'lift')} took={state.took?.includes(h)} />
          ))}
        </div>

        {/* The grain running down the middle of the board. */}
        <div
          className="my-3 h-1 rounded-full sm:my-4"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(0,0,0,0.45) 20%, rgba(0,0,0,0.45) 80%, transparent)',
            boxShadow: 'inset 0 1px 0 rgba(255,220,170,0.12)',
          }}
        />

        <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
          {myHouses.map((h) => (
            <House
              key={h}
              n={pits[h]}
              active={lit === h}
              scoop={lit === h && (kind === 'relay' || kind === 'lift')}
              took={state.took?.includes(h)}
              playable={myTurn && pits[h] > 0 && !busy}
              onClick={() => void play(h)}
            />
          ))}
        </div>

        <Store name="You" seeds={state.store[seat]} align="end" mine />
      </div>

      {over ? (
        <button
          onClick={() => void clear()}
          className="w-full rounded-2xl bg-gradient-to-b from-amber-500 to-amber-700 py-3 text-sm font-bold text-amber-950 shadow-lg transition hover:from-amber-400"
        >
          Play again
        </button>
      ) : (
        <button
          onClick={() => void resign()}
          disabled={busy}
          className="w-full rounded-2xl border border-rose-700/40 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-900/40 hover:text-white"
        >
          🏳️ Resign (Concede game)
        </button>
      )}

      <Rules open={showRules} onToggle={() => setShowRules((v) => !v)} />

      <WhotChatDrawer
        open={showChat}
        onClose={() => setShowChat(false)}
        matchId={match.id}
        myName={myName}
        partnerName={partnerName}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Store({
  name,
  seeds,
  align,
  mine = false,
}: {
  name: string
  seeds: number
  align: 'start' | 'end'
  mine?: boolean
}) {
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-2 px-1',
        align === 'start' ? 'mb-2' : 'mt-2',
      )}
    >
      <span className="truncate text-[0.7rem] text-amber-200/60">{name}</span>
      <span
        className={cx(
          'rounded-full px-3 py-1 text-xs font-bold tabular-nums',
          mine ? 'bg-amber-500/25 text-amber-100' : 'bg-black/25 text-amber-200/80',
        )}
        style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)' }}
      >
        {seeds}
      </span>
    </div>
  )
}

function House({
  n,
  playable = false,
  active = false,
  took = false,
  scoop = false,
  onClick,
}: {
  n: number
  playable?: boolean
  active?: boolean
  took?: boolean
  /** This house was just emptied into the hand — the relay moment. */
  scoop?: boolean
  onClick?: () => void
}) {
  return (
    <button
      disabled={!playable}
      onClick={onClick}
      className={cx(
        'relative aspect-square rounded-full transition-transform duration-150',
        playable && 'cursor-pointer hover:scale-[1.06] active:scale-95',
        active && 'scale-[1.1]',
      )}
      style={{
        // A hollow, not a disc: dark at the top where the rim overhangs, lit at
        // the bottom where the light reaches in.
        background:
          'radial-gradient(circle at 50% 42%, #22130A 0%, #35200F 58%, #4A2C16 100%)',
        transform: scoop ? 'scale(1.16)' : undefined,
        boxShadow: active
          ? 'inset 0 6px 12px rgba(0,0,0,0.75), inset 0 -2px 4px rgba(255,200,140,0.18), 0 0 0 2px rgba(251,191,36,0.75), 0 0 18px rgba(251,191,36,0.4)'
          : took
            ? 'inset 0 6px 12px rgba(0,0,0,0.75), 0 0 0 2px rgba(251,191,36,0.4)'
            : 'inset 0 6px 12px rgba(0,0,0,0.75), inset 0 -2px 4px rgba(255,200,140,0.14)',
      }}
    >
      <span className="absolute inset-0 grid place-items-center">
        <Seeds n={n} />
      </span>
    </button>
  )
}

function Rules({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-700/30 bg-rose-900/20 p-4">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left text-xs font-semibold text-rose-300"
      >
        How we're playing it
        <span className="text-rose-500">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <>
          <ul className="mt-3 space-y-1.5">
            {RULES.map((r) => (
              <li key={r} className="flex gap-2 text-xs text-rose-300">
                <span className="text-amber-500">·</span>
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-rose-800/40 pt-2 text-[0.65rem] text-rose-500">
            These are the common Ayoayo rules. If yours differ, say so and I'll
            change them.
          </p>
        </>
      )}

    </div>
  )
}
