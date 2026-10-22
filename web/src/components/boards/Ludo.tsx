import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errorMessage } from '../../lib/supabase'
import { useSession } from '../../context/SessionProvider'
import { cx, ErrorNote, Loading } from '../ui'
import BoardHeader, { useTurnClock } from './BoardHeader'
import { useBoardRefresh } from './useBoardRefresh'
// The same drawer Whot uses. It only needs a match id and two names, so there
// was never anything card-specific about it — the other two were simply going
// without a way to say "your go" without leaving the board.
import WhotChatDrawer from './WhotChatDrawer'
import Die from './Die'
import type { BoardMatch, LudoState } from '../../lib/types'

/**
 * Ludo.
 *
 * A token's whole life is one number: how far it has come. 0 is the yard, 1–51
 * is the ring, 52–57 is the run home. The square it is standing on is
 * (start + progress − 1) mod 52, so both players share one ring and still each
 * have their own road.
 *
 * That encoding is why this file is mostly drawing. Everything that decides
 * anything — the roll, whether a move is legal, whether you just sent one of
 * theirs back to the yard — happens in Postgres. A dice roll computed in the
 * browser is not a dice roll.
 *
 * Rolling and moving are two taps because that is how the game feels: you roll,
 * you see it, then you decide which token wears it.
 */

/** Where each ring square sits on a 15×15 grid, going clockwise from red. */
const RING: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
]

const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47])

/** All four, because a Ludo board has four corners whoever is playing.
 * Board layout (matching real Ludo photo):
 *   Top-Left = Blue, Top-Right = Yellow, Bottom-Right = Green, Bottom-Left = Red
 */
const COLOURS: Record<string, { solid: string; light: string; name: string; entry: number }> = {
  // These MUST match ludo_entry() in 0062_ludo_colours.sql. The server works
  // out which square a token is standing on; if this table disagrees, the
  // client draws it somewhere else and captures land on squares that look
  // empty. They had drifted apart in a rewrite, which is what broke the game.
  blue:   { solid: '#1565C0', light: '#42A5F5', name: 'Blue',   entry: 0 },
  yellow: { solid: '#F9A825', light: '#FFE082', name: 'Yellow', entry: 13 },
  green:  { solid: '#2E7D32', light: '#66BB6A', name: 'Green',  entry: 26 },
  red:    { solid: '#C62828', light: '#EF9A9A', name: 'Red',    entry: 39 },
}

/**
 * The run home, per colour.
 *
 * Derived rather than chosen: a token travels 51 ring squares from its entry
 * and then turns into the middle lane of the arm it has just come back to.
 * Blue enters at 0 and arrives at [6,0], so blue runs in along the left arm;
 * yellow enters at 13 and arrives at [0,7], so yellow runs down the top. These
 * were a quarter-turn out, which put the blue lane where yellow's belongs and
 * made yellow's entry arrow look like it was capping it.
 */
const HOME_RUNS: Record<string, [number, number][]> = {
  blue:   [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  yellow: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green:  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  red:    [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
}

function square(colour: string, progress: number): [number, number] | null {
  if (progress === 0) return null
  // 57 is home — the middle of the board, not the last square of the lane.
  // Math.min capped it at the lane's end, so a finished token sat one square
  // short of the place it had spent the whole game trying to reach.
  if (progress >= 57) return [8, 8]
  if (progress >= 52) return HOME_RUNS[colour][progress - 52]
  return RING[(COLOURS[colour].entry + progress - 1) % 52]
}

export default function Ludo({ onBack }: { onBack: () => void }) {
  const { userId, coupleId, summary } = useSession()
  const [match, setMatch] = useState<BoardMatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [error, setError] = useState('')
  /** Which corner you want. They get the one opposite. */
  const [colour, setColour] = useState('red')

  const partnerName = summary?.partner?.display_name ?? 'They'
  const myName = summary?.me?.display_name ?? 'You'
  const [showChat, setShowChat] = useState(false)

  // Above every early return, and taking match?.turn rather than match.turn.
  // It sat below the "no game yet" return, so the first render with a board on
  // the table called one more hook than the render before it — which React
  // refuses outright. That was the blank screen.
  const clock = useTurnClock(match?.turn)


  /**
   * Walking a token round the board rather than teleporting it.
   *
   * Unlike Ayo, this needs nothing from the server: a Ludo move is just
   * progress + 1, over and over, so the client can reconstruct every square
   * in between from the position before and the position after. It compares
   * the two and steps through the difference.
   *
   * A token sent back to the yard is not walked — being captured is sudden,
   * and dragging it backwards round the board would read as a move.
   */
  const prevTokens = useRef<LudoState["tokens"] | null>(null)
  const [walking, setWalking] = useState<{ seat: "a" | "b"; i: number; p: number } | null>(null)
  const walkTimers = useRef<number[]>([])

  useEffect(() => {
    const now = (match?.state as LudoState | undefined)?.tokens
    if (!now) return

    const before = prevTokens.current
    prevTokens.current = now
    if (!before) return

    for (const seat of ["a", "b"] as const) {
      for (let i = 0; i < 4; i++) {
        const from = before[seat]?.[i]
        const to = now[seat][i]
        if (from === undefined || to === from || to < from) continue

        walkTimers.current.forEach(clearTimeout)
        walkTimers.current = []

        // Pin it to where it started, straight away and synchronously. The
        // new state has already landed, so without this the token is drawn at
        // its destination for the 150ms before the first step fires — then
        // snaps backwards to begin walking. That backward jump was the glitch.
        setWalking({ seat, i, p: from })

        for (let p = from + 1; p <= to; p++) {
          const at = p
          walkTimers.current.push(
            window.setTimeout(
              () => setWalking(at === to ? null : { seat, i, p: at }),
              (p - from) * 150,
            ),
          )
        }
        return
      }
    }
  }, [match?.state])

  useEffect(() => () => walkTimers.current.forEach(clearTimeout), [])
  const load = useCallback(async (id?: string) => {
    const table = () => supabase.from('board_matches').select('*').eq('game', 'ludo')

    // The open game if there is one; otherwise the last finished one, so a
    // result stays on screen until somebody starts the next. Looking only
    // for an unfinished match meant that the moment a game ended, a reload
    // found nothing and dropped you on the new-game screen — so whoever
    // was not watching at that second never learned they had lost.
    let { data, error: qErr } = id
      ? await table().eq("id", id).maybeSingle()
      : await table().is("finished_at", null).maybeSingle()

    if (!id && !data && !qErr) {
      const last = await table()
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      data = last.data
      qErr = last.error
    }
    if (qErr) setError(errorMessage(qErr))
    else setMatch((data as BoardMatch) ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useBoardRefresh(load)

  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel(`ludo-${coupleId}`)
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
          if (row?.game === 'ludo') setMatch(row)
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
    const { data, error: rpcError } = await supabase.rpc('start_board', {
      game_name: 'ludo',
      opts: { colour },
    })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await load(data as string)
  }

  async function roll() {
    if (!match || busy) return
    setBusy(true)
    setRolling(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('ludo_roll', { match: match.id })
    // A beat, so the die looks thrown rather than looked up.
    await new Promise((r) => setTimeout(r, 420))
    setRolling(false)
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await load(match.id)
  }

  async function move(token: number) {
    if (!match || busy) return
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('ludo_move', {
      match: match.id,
      token,
    })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await load(match.id)
  }

  function clear() {
    if (!match) return
    // Reset local match state without deleting row so history and streaks are preserved
    setMatch(null)
  }

  async function resign() {
    if (!match || busy) return
    const confirmed = window.confirm(
      `Concede this Ludo game to @${partnerName}? They will be awarded the win and this game will end.`
    )
    if (!confirmed) return

    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('resign_board', { match: match.id })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await load(match.id)
  }


  /**
   * A home circle, with the token that is sitting in it drawn inside.
   *
   * The token used to be placed on the 15x15 board grid while the circle was
   * laid out in a nested grid inside the quadrant — two coordinate systems
   * that had no reason to agree, so a token hung up and to the left of the
   * circle it was supposed to be resting in. Making the token a child of the
   * circle means it is centred on it by construction rather than by
   * arithmetic, whatever either of them is sized at.
   */
  function renderDisc(k: string, i: number) {
    const own = k === myColour ? seat : k === theirColour ? other : null
    const here = own !== null && state.tokens[own][i] === 0
    const canMove = here && own === seat && myTurn && dice === 6 && !busy

    return (
      <div
        key={i}
        style={{
          background: COLOURS[k].solid,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.9)",
          width: "82%",
          aspectRatio: "1",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.25)",
          display: "grid",
          placeItems: "center",
        }}
      >
        {here && (
          <button
            disabled={!canMove}
            onClick={() => canMove && void move(i)}
            aria-label={COLOURS[k].name + " token " + (i + 1)}
            style={{
              width: "66%",
              aspectRatio: "1",
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 35% 30%, " + COLOURS[k].light + ", " + COLOURS[k].solid + ")",
              border: canMove ? "2px solid #FFC107" : "2px solid rgba(255,255,255,0.85)",
              boxShadow: canMove
                ? "0 0 0 2px #FFC107, 0 2px 6px rgba(0,0,0,0.55)"
                : "0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.45)",
              cursor: canMove ? "pointer" : "default",
              animation: canMove ? "pulse 1s infinite" : undefined,
            }}
          />
        )}
      </div>
    )
  }
  if (loading) return <Loading label="Setting up…" />

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
        <div className="rounded-3xl border border-rose-700/40 bg-gradient-to-br from-rose-900/60 to-rose-950 p-8 text-center shadow-2xl">
          <p className="text-4xl">🎲</p>
          <p className="mt-3 text-xl font-bold text-white">Ludo</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-rose-300">
            Six to come out, four tokens home to win.
          </p>

          <p className="mt-5 text-[0.6rem] font-semibold tracking-wider text-rose-500 uppercase">
            Your colour
          </p>
          <div className="mt-2 flex justify-center gap-2">
            {Object.entries(COLOURS).map(([k, c]) => (
              <button
                key={k}
                onClick={() => setColour(k)}
                aria-label={c.name}
                className={cx(
                  'size-10 rounded-full border-2 transition',
                  colour === k
                    ? 'scale-110 border-white'
                    : 'border-white/20 opacity-60 hover:opacity-100',
                )}
                style={{ background: c.solid }}
              />
            ))}
          </div>
          <p className="mt-2 text-[0.65rem] text-rose-500">
            {partnerName} takes the corner opposite
          </p>
          <button
            disabled={busy}
            onClick={() => void start()}
            className="mt-5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 disabled:opacity-50"
          >
            {busy ? 'Setting up…' : 'Start'}
          </button>
        </div>
      </div>
    )
  }

  const state = match.state as LudoState
  const seat: 'a' | 'b' = match.player_a === userId ? 'a' : 'b'
  const other: 'a' | 'b' = seat === 'a' ? 'b' : 'a'
  const over = !!match.finished_at
  const myTurn = match.turn === seat && !over
  const myColour = state.colours?.[seat] ?? 'red'
  const theirColour = state.colours?.[other] ?? 'yellow'
  const dice = state.dice
  const home = (s: 'a' | 'b') => state.tokens[s].filter((p) => p === 57).length

  // Which of your tokens this roll could actually move. Advisory — the database
  // decides — but tapping a dead token and being told no is a bad feel.
  const movable = (p: number) =>
    myTurn && dice !== null && (p === 0 ? dice === 6 : p < 57 && p + dice <= 57)

  return (
    <div className="space-y-3">
      {/* The same bar as the other two. Who is playing, whose go it is, and
          what just happened — none of which is card-specific, so none of which
          should have been Whot's alone. */}
      <BoardHeader
        emoji="🎲"
        title="Ludo"
        subtitle={`Table for Two • ${COLOURS[myColour].name} vs ${COLOURS[theirColour].name}`}
        me={{
          name: 'You',
          tally: `🏠 ${home(seat)}/4`,
          colour: COLOURS[myColour].solid,
        }}
        them={{
          name: partnerName,
          tally: `🏠 ${home(other)}/4`,
          colour: COLOURS[theirColour].solid,
        }}
        myTurn={myTurn}
        over={over}
        seconds={clock}
        onResign={() => void resign()}
        onBack={onBack}
        onChat={() => setShowChat(true)}
        error={error || null}
        announcement={
          over
            ? match.winner === seat
              ? 'All four home — you won 🏆'
              : `${partnerName} won`
            : state.note
              ? state.note
              : myTurn
                ? dice === null
                  ? 'Your roll'
                  : `Rolled ${dice} — pick a token`
                : `Waiting on ${partnerName}…`
        }
      />

      {/* The rolls so far, newest on the right — the strip from a real table. */}
      {state.log && state.log.length > 0 && (
        <div className="scrollbar-none flex items-center gap-1 overflow-x-auto">
          {state.log.map((l, i) => (
            <span
              key={i}
              className={cx(
                'grid size-6 shrink-0 place-items-center rounded-md text-[0.65rem] font-bold',
                l.seat === seat ? 'text-white' : 'text-white/80',
              )}
              style={{ background: COLOURS[l.seat === seat ? myColour : theirColour].solid }}
            >
              {l.d}
            </span>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
           THE CLASSIC LUDO BOARD — 15×15 grid matching real boards:
           Blue=Top-Left, Yellow=Top-Right, Green=Bottom-Right, Red=Bottom-Left
          ═══════════════════════════════════════════════════════════ */}
      <div
        className="relative aspect-square w-full rounded-2xl overflow-hidden"
        style={{
          boxShadow: '0 16px 40px rgba(0,0,0,0.7), 0 0 0 3px #5D4037, 0 0 0 5px #3E2723',
        }}
      >
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: 'repeat(15, 1fr)',
            gridTemplateRows: 'repeat(15, 1fr)',
            background: '#FFFFFF',
            gap: 0,
          }}
        >
          {/* ── BLUE YARD (top-left, cols 1-6, rows 1-6) ── */}
          <div style={{ gridColumn: '1 / span 6', gridRow: '1 / span 6', background: '#1565C0', padding: '4px' }}>
            <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: '4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14%', padding: '17%', placeItems: 'center' }}>
              {[0, 1, 2, 3].map((i) => renderDisc('blue', i))}
            </div>
          </div>

          {/* ── YELLOW YARD (top-right, cols 10-15, rows 1-6) ── */}
          <div style={{ gridColumn: '10 / span 6', gridRow: '1 / span 6', background: '#F9A825', padding: '4px' }}>
            <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: '4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14%', padding: '17%', placeItems: 'center' }}>
              {[0, 1, 2, 3].map((i) => renderDisc('yellow', i))}
            </div>
          </div>

          {/* ── GREEN YARD (bottom-right, cols 10-15, rows 10-15) ── */}
          <div style={{ gridColumn: '10 / span 6', gridRow: '10 / span 6', background: '#2E7D32', padding: '4px' }}>
            <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: '4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14%', padding: '17%', placeItems: 'center' }}>
              {[0, 1, 2, 3].map((i) => renderDisc('green', i))}
            </div>
          </div>

          {/* ── RED YARD (bottom-left, cols 1-6, rows 10-15) ── */}
          <div style={{ gridColumn: '1 / span 6', gridRow: '10 / span 6', background: '#C62828', padding: '4px' }}>
            <div style={{ width: '100%', height: '100%', background: 'white', borderRadius: '4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14%', padding: '17%', placeItems: 'center' }}>
              {[0, 1, 2, 3].map((i) => renderDisc('red', i))}
            </div>
          </div>

          {/* ── CENTRE HOME (rows 7-9, cols 7-9) — 4 triangles meeting at star ── */}
          <div
            style={{
              gridColumn: '7 / span 3',
              gridRow: '7 / span 3',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Each point faces the run home it belongs to: blue comes down
                the top arm, yellow in from the right, green up the bottom,
                red in from the left. They were a quarter-turn out, so blue's
                lane arrived at red's point. */}
            {/* Blue (left) — blue's run is row 7, cols 1-6 */}
            <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 0, 50% 50%, 0 100%)', background: '#1565C0' }} />
            {/* Yellow (top) — yellow's run is col 7, rows 1-6 */}
            <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 0, 100% 0, 50% 50%)', background: '#F9A825' }} />
            {/* Green (right) — green's run is row 7, cols 9-14 */}
            <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(100% 0, 100% 100%, 50% 50%)', background: '#2E7D32' }} />
            {/* Red (bottom) — red's run is col 7, rows 9-14 */}
            <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 100%, 100% 100%, 50% 50%)', background: '#C62828' }} />
            {/* The die lives here, in the middle of the board, the way it does
                on a table. It was a flat square down in the status bar, where
                a changing digit reads as a result rather than a throw. Tap it
                to roll when it is your go. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {myTurn && dice === null && !over ? (
                <Die
                  value={state.last ?? null}
                  rolling={rolling}
                  size={46}
                  onClick={() => void roll()}
                  disabled={busy}
                />
              ) : dice !== null || state.last ? (
                <Die value={dice ?? state.last ?? 1} rolling={rolling} size={46} />
              ) : (
                <span style={{ fontSize: '1.1rem' }}>⭐</span>
              )}
            </div>
          </div>

          {/* ── RING SQUARES ── */}
          {RING.map(([r, c], i) => {
            // Which colour owns this entry square?
            const entryColour = Object.entries(COLOURS).find(([, v]) => v.entry === i)?.[0]
            const isSafe = SAFE.has(i)
            return (
              <div
                key={`ring-${i}`}
                style={{
                  gridRow: r + 1,
                  gridColumn: c + 1,
                  background: entryColour
                    ? COLOURS[entryColour].solid
                    : isSafe ? '#FFFFFF' : '#FFFFFF',
                  border: '0.5px solid #E0E0E0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.5rem',
                }}
              >
                {isSafe && !entryColour && (
                  <span style={{ color: '#9E9E9E', fontSize: '0.55rem' }}>✦</span>
                )}
                {entryColour && (
                  // Entry arrow indicator
                  <span style={{ color: 'white', fontSize: '0.55rem', fontWeight: 'bold' }}>→</span>
                )}
              </div>
            )
          })}

          {/* ── HOME RUNS (coloured lanes to centre) ── */}
          {Object.entries(HOME_RUNS).map(([k, cells]) =>
            cells.map(([r, c], i) => (
              <div
                key={`home-${k}-${i}`}
                style={{
                  gridRow: r + 1,
                  gridColumn: c + 1,
                  background: COLOURS[k].light,
                  border: '0.5px solid rgba(0,0,0,0.1)',
                }}
              />
            ))
          )}


          {/* ── TOKENS ── */}
          {(['a', 'b'] as const).map((s) =>
            state.tokens[s].map((raw, i) => {
              const col = s === seat ? myColour : theirColour
              // Mid-walk, draw it where it has got to rather than where it
              // ended up. Everything else about the board is already correct;
              // only this token is behind.
              const p = walking && walking.seat === s && walking.i === i ? walking.p : raw
              let gridRow: number, gridCol: number

              // A token in the yard is drawn by renderDisc(), inside the circle
              // it is resting in. This pass is only for tokens out on the board.
              if (p === 0) return null

              {
                const pos = square(col, p)
                if (!pos) return null
                ;[gridRow, gridCol] = pos
                gridRow += 1
                gridCol += 1
              }

              const canMove = s === seat && movable(p)
              const isHome = p === 57

              return (
                <button
                  key={`t-${s}-${i}`}
                  disabled={!canMove || busy}
                  onClick={() => void move(i)}
                  aria-label={`${COLOURS[col].name} token ${i + 1}`}
                  style={{
                    gridRow,
                    gridColumn: gridCol,
                    zIndex: 20,
                    background: `radial-gradient(circle at 35% 30%, ${COLOURS[col].light}, ${COLOURS[col].solid})`,
                    borderRadius: '50%',
                    border: canMove ? '2px solid #FFC107' : '2px solid rgba(255,255,255,0.8)',
                    boxShadow: canMove
                      ? '0 0 0 2px #FFC107, 0 3px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.5)'
                      : '0 3px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.5)',
                    cursor: canMove ? 'pointer' : 'default',
                    opacity: isHome ? 0.5 : 1,
                    margin: '1px',
                    animation: canMove ? 'pulse 1s infinite' : undefined,
                  }}
                />
              )
            })
          )}
        </div>
      </div>

      {/* Whose turn, the die, and the one thing to do next. */}
      <div
        className={cx(
          'flex items-center gap-3 rounded-2xl border p-3',
          over
            ? 'border-rose-700/40 bg-rose-900/30'
            : myTurn
              ? 'border-amber-500/50 bg-amber-500/10'
              : 'border-rose-700/30 bg-rose-900/20',
        )}
      >
        {/* No die here any more — it lives in the middle of the board, where a
            die goes. Two of them meant the flat one was the one you looked at,
            which rather defeated building a real one. */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            {over
              ? match.winner === seat
                ? 'You won 🏆'
                : `${partnerName} won ${match.outcome ? `(${match.outcome})` : ''}`
              : myTurn
                ? dice === null
                  ? 'Your roll'
                  : 'Pick a token'
                : `Waiting on ${partnerName}…`}
          </p>
          {state.note && !over && (
            <p className="text-xs text-rose-400">{state.note}</p>
          )}
          {over && match.outcome && (
            <p className="text-xs text-rose-400">{match.outcome}</p>
          )}
        </div>

        {!over && myTurn && dice === null && (
          <button
            disabled={busy}
            onClick={() => void roll()}
            className="shrink-0 rounded-xl bg-gradient-to-b from-amber-500 to-amber-700 px-4 py-2.5 text-sm font-bold text-amber-950 shadow transition hover:from-amber-400 disabled:opacity-50"
          >
            Roll
          </button>
        )}
      </div>

      {over && (
        <button
          onClick={() => void clear()}
          className="w-full rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500"
        >
          Play again
        </button>
      )}

      {match && (
        <WhotChatDrawer
          open={showChat}
          onClose={() => setShowChat(false)}
          matchId={match.id}
          myName={myName}
          partnerName={partnerName}
        />
      )}
    </div>
  )
}
