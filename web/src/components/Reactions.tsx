import { useState } from 'react'
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
}: {
  targetKind: 'moment' | 'note' | 'card_play' | 'milestone' | 'answer' | 'compliment' | 'message'
  targetId: string
  reactions: ReactionRow[]
  onChanged: () => void | Promise<void>
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
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

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="React"
          className={cx(
            'rounded-full bg-rose-900/50 text-rose-300 transition hover:bg-rose-800/60',
            compact ? 'px-2 py-1 text-xs' : 'px-2.5 py-1 text-sm',
          )}
        >
          {Object.keys(tally).length === 0 ? '＋ React' : '＋'}
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
            {/* Right-aligned and width-capped: the trigger sits at the end of a
                row, so a left-anchored popup ran off the screen edge and half
                the emoji were unreachable. */}
            <div className="absolute right-0 bottom-full z-50 mb-2 grid w-max max-w-[min(19rem,calc(100vw-2.5rem))] grid-cols-6 gap-0.5 rounded-2xl border border-rose-700/50 bg-rose-950/95 p-2 shadow-2xl backdrop-blur">
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
    </div>
  )
}
