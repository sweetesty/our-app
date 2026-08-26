import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx } from './ui'

export type ReactionRow = { emoji: string; mine: boolean }

/**
 * The set this couple actually uses — theirs if they picked some in Settings,
 * otherwise the built-in list. A hook so the picker and the one-tap buttons on
 * a photo can never drift apart.
 */
export function useReactionSet(): string[] {
  const { summary } = useSession()
  const custom = summary?.couple?.reactions
  return custom && custom.length > 0 ? custom : [...REACTION_SET]
}

/**
 * The first three double as the one-tap buttons on a moment card, so the ones
 * you reach for most come first.
 */
export const REACTION_SET = [
  '❤️', '😂', '🥺', '😘', '🔥', '👏',
  '🥰', '😍', '🤣', '😭', '🙌', '💯',
  '🫶', '💗', '✨', '😳', '🤤', '😮',
] as const

/**
 * Reactions on any piece of content.
 *
 * Deliberately generic: one component and one table serve moments, notes,
 * cards, milestones and answers. Building this for photos alone would have
 * meant rebuilding it four more times.
 */
export default function Reactions({
  targetKind,
  targetId,
  reactions,
  onChanged,
  compact = false,
  sided = false,
  partnerName = 'They',
}: {
  targetKind: 'moment' | 'note' | 'card_play' | 'milestone' | 'answer' | 'compliment' | 'message'
  targetId: string
  reactions: ReactionRow[]
  onChanged: () => void | Promise<void>
  compact?: boolean
  /**
   * Two rows — theirs, then yours — instead of one merged tally.
   *
   * A tally is right where reactions sit under a photo in a stream: you mostly
   * want the count. It is wrong where the whole content is one thing one of you
   * wrote to the other, because "❤️ 2" flattens the two of you into a number
   * and the row reads as coming from nobody.
   */
  sided?: boolean
  partnerName?: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [growsLeft, setGrowsLeft] = useState(true)
  const trigger = useRef<HTMLButtonElement>(null)
  const picker = useReactionSet()

  // Group into "❤️ 2" tallies, remembering whether one of them is yours.
  const tally = reactions.reduce<Record<string, { count: number; mine: boolean }>>(
    (acc, r) => {
      acc[r.emoji] ??= { count: 0, mine: false }
      acc[r.emoji].count += 1
      acc[r.emoji].mine ||= r.mine
      return acc
    },
    {},
  )

  async function toggle(emoji: string) {
    setBusy(emoji)
    await supabase.rpc('toggle_reaction', {
      kind: targetKind,
      target: targetId,
      emoji_char: emoji,
    })
    setBusy(null)
    setOpen(false)
    await onChanged()
  }

  const picker_ = (
    <div className="relative">
      <button
        ref={trigger}
        onClick={() => {
          // Which way the panel opens is decided here, from where the button
          // actually is. It was always anchored right, which is correct at the
          // end of a chat bubble and wrong on the notes wall — there the ＋
          // sits near the left margin, so the panel grew off the side of the
          // screen and four of the six columns were unreachable.
          const box = trigger.current?.getBoundingClientRect()
          if (box) setGrowsLeft(box.left > window.innerWidth / 2)
          setOpen((v) => !v)
        }}
        aria-label="React"
        className={cx(
          'rounded-full bg-rose-900/50 text-rose-300 transition hover:bg-rose-800/60',
          compact ? 'px-2 py-1 text-xs' : 'px-2.5 py-1 text-sm',
        )}
      >
        {reactions.length === 0 ? '＋ React' : '＋'}
      </button>

      {open && (
        <>
          {/* click-away */}
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            className={cx(
              'absolute bottom-full z-50 mb-2 grid w-max max-w-[min(19rem,calc(100vw-2.5rem))] grid-cols-6 gap-0.5 rounded-2xl border border-rose-700/50 bg-rose-950/95 p-2 shadow-2xl backdrop-blur',
              growsLeft ? 'right-0' : 'left-0',
            )}
          >
            {picker.map((emoji) => (
              <button
                key={emoji}
                onClick={() => void toggle(emoji)}
                className="rounded-lg p-1.5 text-xl transition hover:scale-125 active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  if (sided) {
    const theirs = reactions.filter((r) => !r.mine).map((r) => r.emoji)
    const yours = reactions.filter((r) => r.mine).map((r) => r.emoji)

    return (
      <div className="space-y-1.5">
        {theirs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.65rem] text-rose-400">{partnerName}</span>
            {theirs.map((emoji) => (
              <button
                key={`t-${emoji}`}
                onClick={() => void toggle(emoji)}
                disabled={busy === emoji}
                title="React the same"
                className="rounded-full bg-rose-900/50 px-2.5 py-1 text-xs text-rose-200 transition hover:bg-rose-800/60"
              >
                <span className={cx(busy === emoji && 'animate-pulse')}>{emoji}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {yours.map((emoji) => (
            <button
              key={`m-${emoji}`}
              onClick={() => void toggle(emoji)}
              disabled={busy === emoji}
              title="Take it back"
              className="rounded-full bg-pink-500/25 px-2.5 py-1 text-xs text-pink-200 ring-1 ring-pink-500/40 transition"
            >
              <span className={cx(busy === emoji && 'animate-pulse')}>{emoji}</span>
            </button>
          ))}
          {picker_}
          <span className="text-[0.65rem] text-rose-400">You</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {Object.entries(tally).map(([emoji, t]) => (
        <button
          key={emoji}
          onClick={() => void toggle(emoji)}
          disabled={busy === emoji}
          className={cx(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition',
            t.mine
              ? 'bg-pink-500/25 text-pink-200 ring-1 ring-pink-500/40'
              : 'bg-rose-900/50 text-rose-300 hover:bg-rose-800/60',
          )}
        >
          <span className={cx(busy === emoji && 'animate-pulse')}>{emoji}</span>
          {t.count > 1 && <span>{t.count}</span>}
        </button>
      ))}

      {picker_}
    </div>
  )
}
