import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { celebrateReveal } from '../lib/celebrate'
import { cx } from './ui'

/**
 * Breaking a vault seal.
 *
 * The one place in the app where making someone wait is the point. A letter
 * sealed in March and opened in September earned more than a cross-fade, so
 * the wax strains, cracks, and comes apart before a single word is shown.
 *
 * It also refuses to finish early. `ready` is the letter having actually
 * arrived from the server — the ceremony holds on its last beat until then, so
 * a slow connection never reveals an empty envelope.
 */

type Stage = 'strain' | 'crack' | 'burst' | 'done'

/** Fixed rather than random, so both phones play the same break. */
const SHARDS = [
  { dx: -120, dy: -96, spin: -140, size: 15 },
  { dx: -64, dy: -134, spin: 95, size: 10 },
  { dx: 18, dy: -150, spin: -60, size: 13 },
  { dx: 96, dy: -118, spin: 165, size: 9 },
  { dx: 142, dy: -52, spin: -110, size: 14 },
  { dx: 155, dy: 34, spin: 70, size: 11 },
  { dx: 112, dy: 108, spin: -175, size: 16 },
  { dx: 34, dy: 148, spin: 120, size: 10 },
  { dx: -52, dy: 138, spin: -85, size: 13 },
  { dx: -128, dy: 92, spin: 150, size: 9 },
  { dx: -158, dy: 12, spin: -45, size: 12 },
  { dx: -96, dy: -34, spin: 200, size: 8 },
]

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A short pattern in the hand, if the phone offers one. */
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Desktop, or a browser that refuses without a gesture. Never worth an error.
  }
}

export default function SealBreak({
  open,
  label,
  ready,
  onDone,
}: {
  open: boolean
  /** What was written on the outside — the last thing they see before it goes. */
  label: string
  /** The contents are loaded. Until this is true the ceremony holds. */
  ready: boolean
  onDone: () => void
}) {
  const [stage, setStage] = useState<Stage>('strain')
  // onDone is an inline arrow in the parent, so it is a new function on every
  // render. Without this the "finished" effect would fire it repeatedly.
  const fired = useRef(false)

  useEffect(() => {
    if (!open) {
      setStage('strain')
      fired.current = false
      return
    }

    if (reducedMotion()) {
      setStage('done')
      return
    }

    buzz(18)
    const timers = [
      window.setTimeout(() => {
        setStage('crack')
        buzz([0, 14, 40, 14])
      }, 1150),
      window.setTimeout(() => {
        setStage('burst')
        buzz([0, 40, 30, 90])
        celebrateReveal(null)
      }, 1560),
      window.setTimeout(() => setStage('done'), 2400),
    ]

    return () => timers.forEach(window.clearTimeout)
  }, [open])

  useEffect(() => {
    if (!open || stage !== 'done' || !ready || fired.current) return
    fired.current = true
    onDone()
  }, [open, stage, ready, onDone])

  if (!open) return null

  const broken = stage === 'burst' || stage === 'done'

  return (
    <div
      // Tapping through skips the wait without skipping the letter — the hold
      // on `ready` still applies.
      onClick={() => setStage('done')}
      className="fixed inset-0 z-[70] grid place-items-center overflow-hidden bg-black/85 px-8 backdrop-blur-md"
    >
      {/* the flash at the moment it gives */}
      {stage === 'burst' && (
        <div className="animate-flash-out pointer-events-none absolute inset-0 bg-white" />
      )}

      <div className="flex flex-col items-center gap-8 text-center">
        <div className="relative grid size-40 place-items-center">
          {/* shockwave */}
          {broken && (
            <span className="animate-ring-burst absolute size-32 rounded-full border-pink-400/70" />
          )}

          {/* the wax */}
          {!broken && (
            <div
              className={cx(
                'relative grid size-28 place-items-center rounded-full',
                'bg-[radial-gradient(circle_at_35%_28%,#f472b6,#be123c_58%,#7f1d1d)]',
                'ring-2 ring-pink-300/40',
                stage === 'strain' || stage === 'crack'
                  ? 'animate-seal-strain'
                  : 'animate-seal-waiting',
              )}
            >
              <span className="animate-seal-heat absolute inset-0 rounded-full" />
              <span className="text-4xl drop-shadow">💗</span>

              {/* fractures */}
              {stage === 'crack' && (
                <svg
                  viewBox="0 0 100 100"
                  className="pointer-events-none absolute inset-0 size-full"
                  aria-hidden
                >
                  {['M50 8 L46 34 L58 47 L44 62 L52 92', 'M12 40 L38 50 L20 74', 'M92 44 L62 52 L82 78'].map(
                    (d, i) => (
                      <path
                        key={d}
                        d={d}
                        fill="none"
                        stroke="#fff1f2"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        className="animate-crack-draw"
                        style={{
                          strokeDasharray: 100,
                          strokeDashoffset: 100,
                          animationDelay: `${i * 70}ms`,
                        }}
                      />
                    ),
                  )}
                </svg>
              )}
            </div>
          )}

          {/* the wax leaving */}
          {broken &&
            SHARDS.map((s) => (
              <span
                key={`${s.dx}-${s.dy}`}
                className="animate-shard-fly absolute rounded-[30%] bg-gradient-to-br from-pink-300 to-rose-700"
                style={
                  {
                    width: s.size,
                    height: s.size,
                    '--dx': `${s.dx}px`,
                    '--dy': `${s.dy}px`,
                    '--spin': `${s.spin}deg`,
                  } as CSSProperties
                }
              />
            ))}

          {/* what was under it */}
          {broken && (
            <span className="animate-letter-unfurl text-6xl" aria-hidden>
              💌
            </span>
          )}
        </div>

        <div className="space-y-2">
          <p className="label">{broken ? 'Open' : 'Breaking the seal'}</p>
          <p className="max-w-xs text-lg font-bold text-white">{label}</p>
          {stage === 'done' && !ready && (
            <p className="animate-pulse-soft text-xs text-rose-300">Unfolding it…</p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The unbroken seal, sitting in the reader waiting to be pressed.
 *
 * Separate from the ceremony so the build-up and the break share one look —
 * the thing that shudders apart is visibly the thing that was sitting there.
 */
export function WaxSeal({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'animate-seal-waiting mx-auto grid size-24 place-items-center rounded-full',
        'bg-[radial-gradient(circle_at_35%_28%,#f472b6,#be123c_58%,#7f1d1d)]',
        'ring-2 ring-pink-300/40',
        className,
      )}
    >
      <span className="text-3xl drop-shadow">💗</span>
    </span>
  )
}
