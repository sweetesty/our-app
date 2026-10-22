import { cx } from '../ui'

/**
 * A die that is actually a cube.
 *
 * The flat white square with a number printed on it never read as a throw —
 * you saw a digit change, which is a result rather than an event. This is six
 * real faces in 3D: it tumbles while the server is deciding, then rotates to
 * land with the rolled face towards you.
 *
 * Which face points at the viewer is pure geometry, so the resting transform
 * per value is a lookup rather than anything clever. The tumble is a single
 * keyframe loop defined here rather than in the global stylesheet, since
 * nothing else in the app spins in three dimensions.
 */

/** Pip positions on a 3×3 grid, per face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
}

/** The rotation that brings each face to the front. */
const RESTING: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateY(-90deg)',
  3: 'rotateY(180deg)',
  4: 'rotateY(90deg)',
  5: 'rotateX(-90deg)',
  6: 'rotateX(90deg)',
}

/** Where each face sits on the cube, before the whole thing is turned. */
const FACES: { v: number; t: string }[] = [
  { v: 1, t: 'rotateY(0deg)' },
  { v: 4, t: 'rotateY(-90deg)' },
  { v: 3, t: 'rotateY(180deg)' },
  { v: 2, t: 'rotateY(90deg)' },
  { v: 6, t: 'rotateX(-90deg)' },
  { v: 5, t: 'rotateX(90deg)' },
]

export default function Die({
  value,
  rolling,
  size = 56,
  onClick,
  disabled,
}: {
  value: number | null
  rolling?: boolean
  size?: number
  onClick?: () => void
  disabled?: boolean
}) {
  const half = size / 2
  const shown = value ?? 1

  return (
    <>
      <style>{`
        @keyframes die-tumble {
          0%   { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
          25%  { transform: rotateX(180deg) rotateY(90deg) rotateZ(45deg); }
          50%  { transform: rotateX(360deg) rotateY(225deg) rotateZ(180deg); }
          75%  { transform: rotateX(540deg) rotateY(315deg) rotateZ(270deg); }
          100% { transform: rotateX(720deg) rotateY(450deg) rotateZ(360deg); }
        }
      `}</style>

      <button
        type="button"
        onClick={onClick}
        disabled={disabled || !onClick}
        aria-label={value ? `Rolled ${value}` : 'Roll the die'}
        className={cx(
          'grid place-items-center',
          onClick && !disabled ? 'cursor-pointer active:scale-95' : 'cursor-default',
        )}
        style={{ width: size, height: size, perspective: size * 4 }}
      >
        <div
          style={{
            width: size,
            height: size,
            position: 'relative',
            transformStyle: 'preserve-3d',
            transform: RESTING[shown],
            transition: rolling ? 'none' : 'transform 600ms cubic-bezier(0.2, 1.2, 0.3, 1)',
            animation: rolling ? 'die-tumble 700ms linear infinite' : undefined,
          }}
        >
          {FACES.map((f) => (
            <span
              key={f.v}
              className="absolute inset-0 grid rounded-[18%] border border-black/15 bg-gradient-to-br from-white to-stone-200"
              style={{
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridTemplateRows: 'repeat(3, 1fr)',
                padding: size * 0.12,
                transform: `${f.t} translateZ(${half}px)`,
                backfaceVisibility: 'hidden',
                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.9), inset 0 -3px 6px rgba(0,0,0,0.18)',
              }}
            >
              {PIPS[f.v].map(([r, c], i) => (
                <span
                  key={i}
                  className="rounded-full bg-stone-900"
                  style={{
                    gridRow: r,
                    gridColumn: c,
                    placeSelf: 'center',
                    width: size * 0.17,
                    height: size * 0.17,
                    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.35)',
                  }}
                />
              ))}
            </span>
          ))}
        </div>
      </button>
    </>
  )
}
