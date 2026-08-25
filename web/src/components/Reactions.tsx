import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { cx } from './ui'

export type ReactionRow = { emoji: string; mine: boolean }

export const REACTION_SET = ['❤️', '😂', '🥺', '😘', '🔥', '👏'] as const

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
  targetKind: 'moment' | 'note' | 'card_play' | 'milestone' | 'answer' | 'compliment'
  targetId: string
  reactions: ReactionRow[]
  onChanged: () => void | Promise<void>
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

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
            <div className="absolute bottom-full left-0 z-50 mb-2 flex gap-1 rounded-2xl border border-rose-700/50 bg-rose-950/95 p-2 shadow-2xl backdrop-blur">
              {REACTION_SET.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => void toggle(emoji)}
                  className="rounded-lg px-1.5 py-1 text-xl transition hover:scale-125"
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
