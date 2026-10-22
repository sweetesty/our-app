import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../context/SessionProvider'
import { cx } from '../ui'
import Emoji from '../Emoji'
import type { BoardRecord, BoardHistoryRow } from '../../lib/types'

/**
 * The record.
 *
 * No stakes and nothing at risk — the only thing worth keeping is who won, and
 * the only thing worth saying about it is "that's four in a row". Which is also
 * the reason this is current-streak only and not a lifetime table: a running
 * all-time ranking between two people who love each other ages badly.
 *
 * Nothing extra is stored for any of it. Every finished match already carries a
 * winner and a finish time, so this is a read over rows that exist.
 */

const NAMES: Record<string, { name: string; emoji: string }> = {
  ayo: { name: 'Ayo', emoji: '🪵' },
  whot: { name: 'Whot', emoji: '🃏' },
  ludo: { name: 'Ludo', emoji: '🎲' },
}

export default function Record({ game }: { game?: string }) {
  const { summary } = useSession()
  const [rows, setRows] = useState<BoardRecord[]>([])
  const [history, setHistory] = useState<BoardHistoryRow[]>([])
  const [open, setOpen] = useState(false)

  const partnerName = summary?.partner?.display_name ?? 'They'

  useEffect(() => {
    void Promise.all([
      supabase.rpc('board_record', { for_game: game ?? null }),
      supabase.rpc('board_history', { for_game: game ?? null, limit_count: 20 }),
    ]).then(([r, h]) => {
      setRows((r.data as BoardRecord[]) ?? [])
      setHistory((h.data as BoardHistoryRow[]) ?? [])
    })
  }, [game])

  if (rows.length === 0) return null

  // Only worth shouting about from two up. One win is not a run.
  const run = rows.find((r) => r.streak >= 2)

  return (
    <div className="space-y-2">
      {run && (
        <div
          className={cx(
            'rounded-2xl border p-4 text-center',
            run.streak_mine
              ? 'border-amber-500/40 bg-amber-500/10'
              : 'border-rose-700/40 bg-rose-900/30',
          )}
        >
          <p className="text-lg font-bold text-white">
            {run.streak_mine ? 'You' : partnerName} · {run.streak} in a row
          </p>
          <p className="mt-0.5 text-xs text-rose-300">
            at {NAMES[run.game]?.name ?? run.game}
            {run.streak >= 5 && (run.streak_mine ? ' — merciless' : ' — say something')}
          </p>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-2xl border border-rose-700/30 bg-rose-900/20 p-3 text-left transition hover:bg-rose-900/35"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-rose-300">How we stand</span>
          <span className="text-rose-500">{open ? '−' : '+'}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {rows.map((r) => (
            <span
              key={r.game}
              className="flex items-center gap-1.5 rounded-xl bg-rose-950/60 px-2.5 py-1 text-[0.7rem] text-rose-200"
            >
              <Emoji size={13}>{NAMES[r.game]?.emoji ?? '🎮'}</Emoji>
              <strong className="text-white">{r.i_won}</strong>–
              <strong className="text-rose-300">{r.they_won}</strong>
              {r.drawn > 0 && <span className="text-rose-500">·{r.drawn}d</span>}
            </span>
          ))}
        </div>
      </button>

      {open && history.length > 0 && (
        <ul className="space-y-1">
          {history.map((h) => (
            <li
              key={h.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-xs hover:bg-rose-900/25"
            >
              <Emoji size={14}>{NAMES[h.game]?.emoji ?? '🎮'}</Emoji>
              <span
                className={cx(
                  'min-w-0 flex-1 truncate',
                  h.drawn
                    ? 'text-rose-400'
                    : h.won_by_me
                      ? 'text-amber-200'
                      : 'text-rose-300',
                )}
              >
                {h.drawn ? 'Draw' : h.won_by_me ? 'You won' : `${partnerName} won`}
                {h.outcome && <span className="text-rose-500"> · {h.outcome}</span>}
              </span>
              <span className="shrink-0 text-[0.65rem] text-rose-600">
                {new Date(h.finished_at).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
