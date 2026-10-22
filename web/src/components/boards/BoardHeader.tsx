import { useEffect, useState, type ReactNode } from 'react'
import { cx } from '../ui'

/**
 * The bar that sits over every board.
 *
 * It started life inside Whot and it was the right shape, so the other two
 * were simply going without: who is playing, whose turn it is, what just
 * happened, and the handful of controls you reach for mid-game. None of that
 * is card-specific, and a couple should not have to learn a different chrome
 * per game.
 *
 * What is game-specific is the one number next to each name — cards in hand,
 * seeds captured, tokens home — so that comes in as a string rather than being
 * assumed to be a card count.
 */

export type Player = {
  name: string
  /** "🃏 5", "🌰 12", "🏠 2/4" — whatever counts in this game. */
  tally: string
  /** First letter goes in the disc. */
  initial?: string
  colour?: string
}

export default function BoardHeader({
  emoji,
  title,
  subtitle,
  mode,
  onMode,
  me,
  them,
  myTurn,
  over,
  announcement,
  error,
  onResign,
  onBack,
  onChat,
  soundOn,
  onSound,
  /** Seconds left on the turn, if the game shows one. */
  seconds,
  extra,
}: {
  emoji: string
  title: string
  subtitle?: string
  mode?: string
  onMode?: () => void
  me: Player
  them: Player
  myTurn: boolean
  over: boolean
  announcement?: string
  error?: string | null
  onResign?: () => void
  onBack: () => void
  onChat?: () => void
  soundOn?: boolean
  onSound?: () => void
  seconds?: number
  extra?: ReactNode
}) {
  return (
    <>
      <div className="flex items-center justify-between pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-base">{emoji}</span>
            <span className="truncate text-sm font-black tracking-tight text-white">
              {title} • 2 players
            </span>
          </div>
          {subtitle && (
            <p className="truncate text-[0.65rem] font-medium tracking-tight text-emerald-300/80">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {mode && (
            <button
              type="button"
              onClick={onMode}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-stone-800/80 px-2.5 py-1 text-[0.65rem] font-bold text-amber-300 transition hover:bg-stone-700"
              title="Table rules"
            >
              {mode}
            </button>
          )}

          {onChat && (
            <button
              type="button"
              onClick={onChat}
              className="grid size-8 place-items-center rounded-full bg-white/10 text-xs text-white/80 transition hover:bg-white/20"
              aria-label="Table chat"
            >
              💬
            </button>
          )}

          {onSound && (
            <button
              type="button"
              onClick={onSound}
              className="grid size-8 place-items-center rounded-full bg-white/10 text-xs text-white/80 transition hover:bg-white/20"
              aria-label="Toggle sound"
            >
              {soundOn ? '🔊' : '🔇'}
            </button>
          )}

          {onResign && !over && (
            <button
              type="button"
              onClick={onResign}
              className="flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-950/80 px-2.5 py-1 text-[0.65rem] font-bold text-rose-200 shadow-sm transition hover:bg-rose-900 hover:text-white active:scale-95"
            >
              🏳️ <span>Resign</span>
            </button>
          )}

          <button
            type="button"
            onClick={onBack}
            className="grid size-8 place-items-center rounded-full bg-white/10 text-xs font-bold text-white/80 transition hover:bg-white/20"
            aria-label="Back to Games"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Whose go, and what each of you is holding. The ring pulses on the one
          being waited for — the single most useful thing on the screen when
          you open the app hours later. */}
      <div className="grid grid-cols-2 gap-2 pb-2">
        <Pill
          player={me}
          you
          active={myTurn && !over}
          seconds={seconds}
        />
        <Pill player={them} active={!myTurn && !over} seconds={seconds} />
      </div>

      {(announcement || error) && (
        <div className="pb-2">
          <div
            className={cx(
              'flex items-center justify-between rounded-full border px-4 py-1.5 text-xs font-bold transition-all',
              error
                ? 'border-red-500/50 bg-red-950/80 text-red-200'
                : over
                  ? 'animate-pulse border-amber-400/60 bg-amber-950/70 text-amber-300'
                  : 'border-white/10 bg-black/40 text-emerald-200',
            )}
          >
            <span className="truncate">{error || announcement}</span>
            {onChat && (
              <button
                type="button"
                onClick={onChat}
                className="ml-2 shrink-0 text-sm transition hover:scale-110 active:scale-95"
                aria-label="React"
              >
                😄
              </button>
            )}
          </div>
        </div>
      )}

      {extra}
    </>
  )
}

function Pill({
  player,
  you = false,
  active,
  seconds,
}: {
  player: Player
  you?: boolean
  active: boolean
  seconds?: number
}) {
  return (
    <div
      className={cx(
        'relative flex items-center gap-2.5 rounded-full border px-3 py-1.5 transition-all duration-300',
        active
          ? 'border-amber-400 bg-amber-500/20 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
          : 'border-white/15 bg-black/40',
      )}
    >
      <div
        className="relative grid size-7 shrink-0 place-items-center rounded-full text-[0.65rem] font-black"
        style={{
          background: player.colour ?? (you ? '#FBBF24' : '#F43F5E'),
          color: you ? '#000' : '#fff',
        }}
      >
        {(player.initial ?? player.name).slice(0, 1).toUpperCase()}
        {active && (
          <span className="pointer-events-none absolute -inset-1 animate-pulse rounded-full border-2 border-amber-300" />
        )}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-xs font-bold text-white">
          {you ? 'You' : player.name}
        </p>
        <div className="flex items-center gap-1.5 text-[0.65rem] font-semibold text-white/90">
          <span className="truncate">{player.tally}</span>
          {active && seconds !== undefined && (
            <span className="font-extrabold text-amber-300">{seconds}s</span>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The countdown the pills show.
 *
 * Deliberately cosmetic: nothing on the server enforces it, because a game you
 * play across a working day should not punish you for being in a meeting. It
 * is there to say "it's been a while", not to take your turn away.
 */
export function useTurnClock(resetKey: unknown, from = 35) {
  const [seconds, setSeconds] = useState(from)

  useEffect(() => {
    setSeconds(from)
    const t = window.setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(t)
  }, [resetKey, from])

  return seconds
}
