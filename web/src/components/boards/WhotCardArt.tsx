import { cx } from '../ui'
import type { WhotCard as Card } from '../../lib/types'

/**
 * Authentic Nigerian Whot Card Art.
 *
 * Matching the exact aesthetic from lagoslife.app:
 * - Solid rich burgundy-red shapes (#781822) with smooth geometry
 * - Corner indices in matching burgundy ink (#781822) with miniature suit glyphs
 * - Off-white / warm ivory cardstock paper (#FFFDF8 -> #F6EFE2)
 * - Fine inset border
 * - Iconic Whot 20 card with dashed center box, party popper, and all 5 symbols (● ▲ ✚ ■ ★)
 * - Signature deep red Whot card back with diagonal gold/cream WHOT typography
 */

export const BURGUNDY_INK = '#781822'
export const GOLD = '#F6D89E'

/** The five iconic Whot shapes as solid filled SVG paths */
export function Shape({
  kind,
  size,
  fill = BURGUNDY_INK,
}: {
  kind: string
  size: number
  fill?: string
}) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {kind === 'circle' && (
        <circle cx="50" cy="50" r="38" fill={fill} />
      )}
      {kind === 'triangle' && (
        <path d="M50 14 L88 78 H12 Z" fill={fill} />
      )}
      {kind === 'square' && (
        <rect x="16" y="16" width="68" height="68" rx="6" fill={fill} />
      )}
      {kind === 'cross' && (
        <path
          d="M38 12h24v26h26v24H62v26H38V62H12V38h26Z"
          fill={fill}
        />
      )}
      {kind === 'star' && (
        <path
          d="M50 8 61 38 93 38 67 57 77 88 50 69 23 88 33 57 7 38 39 38Z"
          fill={fill}
        />
      )}
    </svg>
  )
}

/** Micro shape glyph for card indices */
export function MiniShape({ kind, color = BURGUNDY_INK }: { kind: string; color?: string }) {
  if (kind === 'circle') return <span style={{ color }}>●</span>
  if (kind === 'triangle') return <span style={{ color }}>▲</span>
  if (kind === 'cross') return <span style={{ color }}>✚</span>
  if (kind === 'square') return <span style={{ color }}>■</span>
  if (kind === 'star') return <span style={{ color }}>★</span>
  return null
}

export function WhotFace({
  card,
  onClick,
  disabled,
  small,
  flat,
  isPlayable,
  className,
}: {
  card: Card
  onClick?: () => void
  disabled?: boolean
  small?: boolean
  /** No lift or shadow changes — for the card resting on the discard pile */
  flat?: boolean
  /** Highlights the card as legal to play */
  isPlayable?: boolean
  className?: string
}) {
  const isWhot = card.s === 'whot' || card.n === 20
  const ink = BURGUNDY_INK

  // Dimensions
  const w = small ? 56 : 82
  const h = small ? 82 : 120

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: w,
        height: h,
        background: 'linear-gradient(165deg, #FFFDF8 0%, #F7F1E5 60%, #EFE7D6 100%)',
        boxShadow: flat
          ? '0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 #fff'
          : isPlayable
            ? '0 12px 28px rgba(0,0,0,0.6), 0 0 20px rgba(250, 204, 21, 0.7), inset 0 1px 0 #fff'
            : '0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 #fff',
      }}
      className={cx(
        'group relative shrink-0 select-none rounded-xl border border-stone-800/20 p-1 text-left transition-all duration-200',
        flat ? 'cursor-default' : '',
        !flat && onClick && !disabled && (
          isPlayable
            ? 'cursor-pointer hover:-translate-y-4 hover:scale-105 active:scale-95 ring-2 ring-amber-400 border-amber-400'
            : 'cursor-pointer hover:-translate-y-1 active:scale-95'
        ),
        disabled && 'opacity-40 grayscale-[40%] cursor-not-allowed',
        className,
      )}
    >
      {/* Top-left corner index */}
      <div
        className="absolute top-1.5 left-2 flex flex-col items-center leading-none"
        style={{ color: ink }}
      >
        <span className={cx('font-black tracking-tight', small ? 'text-[0.72rem]' : 'text-xs')}>
          {isWhot ? 20 : card.n}
        </span>
        {!isWhot && (
          <span className={cx('font-bold leading-none mt-0.5', small ? 'text-[0.52rem]' : 'text-[0.62rem]')}>
            <MiniShape kind={card.s} color={ink} />
          </span>
        )}
      </div>

      {/* Bottom-right corner index (rotated 180deg) */}
      <div
        className="absolute bottom-1.5 right-2 flex rotate-180 flex-col items-center leading-none"
        style={{ color: ink }}
      >
        <span className={cx('font-black tracking-tight', small ? 'text-[0.72rem]' : 'text-xs')}>
          {isWhot ? 20 : card.n}
        </span>
        {!isWhot && (
          <span className={cx('font-bold leading-none mt-0.5', small ? 'text-[0.52rem]' : 'text-[0.62rem]')}>
            <MiniShape kind={card.s} color={ink} />
          </span>
        )}
      </div>

      {/* Card Center */}
      {isWhot ? (
        /* Clean bold WHOT text fitting comfortably without leaving the card */
        <div className="flex h-full w-full items-center justify-center px-1">
          <span
            className={cx(
              'font-black tracking-wider uppercase text-center select-none',
              small ? 'text-xs' : 'text-base font-extrabold',
            )}
            style={{ color: BURGUNDY_INK, letterSpacing: '0.06em' }}
          >
            WHOT
          </span>
        </div>
      ) : (
        /* Solid filled shapes in authentic burgundy matching user screenshot */
        <div className="relative grid h-full place-items-center">
          <Shape
            kind={card.s}
            size={small ? 36 : 54}
            fill={BURGUNDY_INK}
          />
        </div>
      )}
    </button>
  )
}

/**
 * Authentic Whot card back.
 * Features the signature deep red finish, fine cream/gold inner border frame,
 * and diagonal WHOT branding tilted at -24deg matching the screenshot.
 */
export function WhotBack({
  small,
  stacked = false,
  onClick,
  disabled,
}: {
  small?: boolean
  stacked?: boolean
  onClick?: () => void
  disabled?: boolean
}) {
  const w = small ? 56 : 82
  const h = small ? 82 : 120

  const stackShadow = stacked
    ? '0 1px 0 #3a080f, 0 2px 0 #4a0a14, 0 3px 0 #5c0d19, 0 4px 0 #6e101f, 0 5px 0 #7f1425, 0 12px 28px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.2)'
    : '0 4px 14px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      style={{
        width: w,
        height: h,
        background: 'linear-gradient(145deg, #8B1A28 0%, #6E0F1B 60%, #520913 100%)',
        boxShadow: stackShadow,
      }}
      className={cx(
        'group relative grid shrink-0 select-none place-items-center rounded-xl border border-black/40 p-1.5 transition-all duration-200',
        onClick && !disabled
          ? 'cursor-pointer hover:-translate-y-2 hover:brightness-110 active:scale-95'
          : 'cursor-default',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      {/* Inner fine gold/cream border frame */}
      <div
        className="absolute inset-1.5 rounded-lg border border-[#F6D89E]/40 pointer-events-none"
        style={{
          boxShadow: 'inset 0 0 4px rgba(0,0,0,0.3)',
        }}
      />

      {/* The iconic diagonal WHOT text */}
      <div
        className="flex flex-col items-center justify-center -rotate-[24deg] select-none pointer-events-none"
        style={{ color: GOLD }}
      >
        <span
          className={cx(
            'font-black tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] uppercase',
            small ? 'text-xs' : 'text-base',
          )}
          style={{ letterSpacing: '0.1em' }}
        >
          WHOT
        </span>
      </div>
    </button>
  )
}
