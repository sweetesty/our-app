import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../../lib/supabase'
import { useSession } from '../../context/SessionProvider'
import { cx, ErrorNote, Loading } from '../ui'
import type { BoardMatch, AyoState } from '../../lib/types'

/**
 * Ayo.
 *
 * Twelve houses in a ring, six a side, four seeds each. The client draws the
 * board and sends "I want to play house 3"; every rule lives in `ayo_move()`.
 * That is not tidiness — a board game whose legal-move check runs in the
 * browser is a board game where anyone with devtools wins, and "he cheats at
 * Ayo" should stay a joke.
 *
 * Seat A owns houses 0–5, seat B owns 6–11, and sowing runs anticlockwise. The
 * board is drawn from whoever is looking at it: your six are always the row
 * nearest you, which means seat B sees the ring reversed. Everything else
 * would mean learning the game twice.
 */

const RULES = [
  'Start from any house on your side that has seeds.',
  'Seeds drop one per house, anticlockwise, skipping the house you emptied.',
  'If your last seed lands in a house that already had seeds, pick them all up and keep going.',
  'If it lands in an empty house on your side, you take the seeds facing it.',
  'When one of you has nothing left to play, the other takes the rest. Most seeds wins.',
]

/** Four seeds in a house, drawn as four seeds. Beyond six it is a number. */
function Seeds({ n }: { n: number }) {
  if (n === 0) return null
  if (n > 6) {
    return <span className="text-lg font-bold text-amber-100">{n}</span>
  }
  return (
    <span className="flex max-w-9 flex-wrap justify-center gap-0.5">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="size-2 rounded-full bg-amber-200 shadow-sm" />
      ))}
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

  const partnerName = summary?.partner?.display_name ?? 'They'

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

  // Their move should land on your board, not wait for a refresh. A turn-based
  // game you have to reload is a turn-based game nobody finishes.
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
    setBusy(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('start_board', {
      game_name: 'ayo',
    })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await load(data as string)
  }

  async function play(house: number) {
    if (!match || busy) return
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
    if (!match) return
    if (!window.confirm('Give it to them?')) return
    await supabase.rpc('resign_board', { match: match.id })
    await load(match.id)
  }

  async function clear() {
    if (!match) return
    await supabase.from('board_matches').delete().eq('id', match.id)
    setMatch(null)
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

        <div className="rounded-3xl border border-amber-600/30 bg-gradient-to-br from-amber-950/40 to-rose-950 p-8 text-center">
          <p className="text-4xl">🪵</p>
          <p className="mt-3 text-xl font-bold text-white">Ayo</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-rose-300">
            Forty-eight seeds, twelve houses, and whoever ends up holding more of
            them. Take your turns whenever — it waits.
          </p>
          <button
            disabled={busy}
            onClick={() => void start()}
            className="mt-5 rounded-2xl bg-gradient-to-r from-amber-600 to-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-amber-500 hover:to-rose-500 disabled:opacity-50"
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
  const seat: 'a' | 'b' = match.player_a === userId ? 'a' : 'b'
  const theirs = seat === 'a' ? 'b' : 'a'
  const myTurn = match.turn === seat && !match.finished_at
  const over = !!match.finished_at

  // Your six are always the row nearest you. Seat B therefore sees the ring the
  // other way up, which is what sitting on the other side of a board means.
  const mineLow = seat === 'a' ? 0 : 6
  const myHouses = Array.from({ length: 6 }, (_, i) => mineLow + i)
  const theirHouses = Array.from({ length: 6 }, (_, i) => (seat === 'a' ? 11 - i : 5 - i))

  const myStore = state.store[seat]
  const theirStore = state.store[theirs]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="text-xs font-semibold text-rose-400 transition hover:text-rose-200"
        >
          ← Games
        </button>
        <button
          onClick={() => setShowRules((v) => !v)}
          className="text-xs font-semibold text-rose-400 transition hover:text-rose-200"
        >
          Rules
        </button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Whose move, stated plainly. The commonest confusion in a turn-based
          game played hours apart is not knowing whether you are waiting. */}
      <div
        className={cx(
          'rounded-2xl border p-3 text-center text-sm font-semibold',
          over
            ? 'border-rose-700/40 bg-rose-900/30 text-rose-200'
            : myTurn
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-100'
              : 'border-rose-700/30 bg-rose-900/20 text-rose-300',
        )}
      >
        {over
          ? match.winner === 'draw'
            ? 'A draw — 24 each 🤝'
            : match.winner === seat
              ? 'You won 🏆'
              : `${partnerName} won`
          : myTurn
            ? 'Your move'
            : `Waiting on ${partnerName}…`}
        {over && match.outcome && (
          <p className="mt-1 text-xs font-normal text-rose-400">{match.outcome}</p>
        )}
      </div>

      {/* The board. Their row on top, reversed, so the ring runs the way it
          would on a real one between you. */}
      <div className="rounded-3xl border border-amber-700/30 bg-gradient-to-b from-amber-950/50 to-rose-950/70 p-3 shadow-2xl sm:p-4">
        <div className="mb-2 flex items-center justify-between px-1 text-[0.65rem] text-rose-400">
          <span>{partnerName}</span>
          <span className="font-bold text-amber-200">{theirStore} seeds</span>
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {theirHouses.map((h) => (
            <House key={h} n={state.pits[h]} touched={state.took?.includes(h)} />
          ))}
        </div>

        <div className="my-3 h-px bg-amber-700/20" />

        <div className="grid grid-cols-6 gap-1.5">
          {myHouses.map((h) => (
            <House
              key={h}
              n={state.pits[h]}
              touched={state.took?.includes(h)}
              playable={myTurn && state.pits[h] > 0 && !busy}
              onClick={() => void play(h)}
            />
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-[0.65rem] text-rose-400">
          <span>You</span>
          <span className="font-bold text-amber-200">{myStore} seeds</span>
        </div>
      </div>

      {over ? (
        <button
          onClick={() => void clear()}
          className="w-full rounded-2xl bg-gradient-to-r from-amber-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-amber-500 hover:to-rose-500"
        >
          Play again
        </button>
      ) : (
        <button
          onClick={() => void resign()}
          className="w-full rounded-2xl border border-rose-700/40 py-2.5 text-xs font-semibold text-rose-400 transition hover:bg-rose-900/40 hover:text-rose-200"
        >
          Give it to them
        </button>
      )}

      <Rules open={showRules} onToggle={() => setShowRules((v) => !v)} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function House({
  n,
  playable = false,
  touched = false,
  onClick,
}: {
  n: number
  playable?: boolean
  touched?: boolean
  onClick?: () => void
}) {
  return (
    <button
      disabled={!playable}
      onClick={onClick}
      className={cx(
        'grid aspect-square place-items-center rounded-full border transition',
        touched
          ? 'border-amber-400 bg-amber-500/25'
          : 'border-amber-800/40 bg-amber-950/50',
        playable
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-900/60'
          : 'cursor-default',
      )}
    >
      <Seeds n={n} />
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
          {/* Said out loud because every household plays a variant, and a game
              that quietly uses different rules to the ones you grew up with is
              a game you think is broken. */}
          <p className="mt-3 border-t border-rose-800/40 pt-2 text-[0.65rem] text-rose-500">
            These are the common Ayoayo rules. If yours differ, say so and I'll
            change them.
          </p>
        </>
      )}
    </div>
  )
}
