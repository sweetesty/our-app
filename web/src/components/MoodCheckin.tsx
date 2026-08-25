import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx } from './ui'

/** Mirrors the check constraint in migration 0012. */
const MOODS = [
  { key: 'great', emoji: '🔥', label: 'Great' },
  { key: 'good', emoji: '😊', label: 'Good' },
  { key: 'loved', emoji: '🥰', label: 'Loved' },
  { key: 'calm', emoji: '😌', label: 'Calm' },
  { key: 'meh', emoji: '😐', label: 'Meh' },
  { key: 'tired', emoji: '😩', label: 'Tired' },
  { key: 'anxious', emoji: '😰', label: 'Anxious' },
  { key: 'low', emoji: '🥺', label: 'Low' },
  { key: 'frustrated', emoji: '😤', label: 'Frustrated' },
  { key: 'unwell', emoji: '🤒', label: 'Unwell' },
  { key: 'missing', emoji: '💭', label: 'Missing you' },
] as const

type MoodRow = { logged_on: string; author_id: string; mood: string; note: string | null }

function moodFor(key: string) {
  return MOODS.find((m) => m.key === key)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * The daily check-in.
 *
 * Not gated the way the daily question is — your partner sees it the moment you
 * tap it. The value isn't in the trade, it's in them knowing.
 *
 * The seven-day strip is the part that actually earns its place: one bad day is
 * noise, three in a row is something you'd want to notice.
 */
export default function MoodCheckin() {
  const { userId, refresh } = useSession()
  const [rows, setRows] = useState<MoodRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('mood_history', { days: 7 })
    if (rpcError) setError(errorMessage(rpcError))
    else setRows((data as MoodRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const todayStr = today()
  const mine = rows.find((r) => r.logged_on === todayStr && r.author_id === userId)
  const theirs = rows.find((r) => r.logged_on === todayStr && r.author_id !== userId)

  async function log(mood: string) {
    setSaving(mood)
    setError('')
    const { error: rpcError } = await supabase.rpc('log_mood', {
      mood_key: mood,
      mood_note: note.trim() || null,
    })
    setSaving(null)
    if (rpcError) return setError(errorMessage(rpcError))
    setNote('')
    setExpanded(false)
    await load()
    await refresh()
  }

  if (loading) return null

  // Their last seven days, oldest first, so it reads left to right.
  const theirWeek = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().slice(0, 10)
    return { key, row: rows.find((r) => r.logged_on === key && r.author_id !== userId) }
  })

  const anyHistory = theirWeek.some((d) => d.row)

  return (
    <div className="rounded-3xl border border-rose-700/30 bg-rose-900/30 p-5 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wider text-rose-300 uppercase">
          💗 How are you today?
        </h3>
        {mine && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-rose-400 transition-colors hover:text-rose-200"
          >
            {expanded ? 'Close' : 'Change'}
          </button>
        )}
      </div>

      {/* Their mood first — the reason this exists is knowing how they are. */}
      {theirs ? (
        <div className="mb-3 flex items-start gap-3 rounded-2xl bg-rose-950/50 p-3">
          <span className="text-2xl">{moodFor(theirs.mood)?.emoji}</span>
          <div className="min-w-0">
            <p className="text-sm text-white">
              They're feeling{' '}
              <span className="font-semibold text-pink-300">
                {moodFor(theirs.mood)?.label.toLowerCase()}
              </span>
            </p>
            {theirs.note && (
              <p className="mt-0.5 text-xs text-rose-200 italic">"{theirs.note}"</p>
            )}
          </div>
        </div>
      ) : (
        <p className="mb-3 text-xs text-rose-400">
          They haven't said how they are today.
        </p>
      )}

      {/* Yours */}
      {mine && !expanded ? (
        <div className="flex items-center gap-2 text-xs text-rose-300">
          <span className="text-lg">{moodFor(mine.mood)?.emoji}</span>
          <span>
            You said <span className="text-white">{moodFor(mine.mood)?.label.toLowerCase()}</span>
            {mine.note && ` — "${mine.note}"`}
          </span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.key}
                onClick={() => void log(m.key)}
                disabled={saving !== null}
                title={m.label}
                className={cx(
                  'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition disabled:opacity-50',
                  mine?.mood === m.key
                    ? 'border-pink-500/50 bg-pink-500/20 text-pink-200'
                    : 'border-rose-700/40 bg-rose-800/30 text-rose-200 hover:bg-rose-700/40',
                )}
              >
                <span className="text-base">{m.emoji}</span>
                {m.label}
              </button>
            ))}
          </div>

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
            placeholder="Want to say why? (optional)"
            className="mt-2.5 w-full rounded-xl border border-rose-700/40 bg-rose-950/50 px-3 py-2 text-xs text-rose-100 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
          />
        </>
      )}

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

      {/* The pattern. One quiet day is nothing; three is worth noticing. */}
      {anyHistory && (
        <div className="mt-4 border-t border-rose-800/40 pt-3">
          <p className="mb-2 text-[11px] tracking-wide text-rose-400 uppercase">
            Their week
          </p>
          <div className="flex gap-1.5">
            {theirWeek.map((d) => (
              <div
                key={d.key}
                title={
                  d.row
                    ? `${moodFor(d.row.mood)?.label} — ${d.key}`
                    : `Nothing logged — ${d.key}`
                }
                className={cx(
                  'grid h-9 flex-1 place-items-center rounded-lg text-base',
                  d.row ? 'bg-rose-800/40' : 'bg-rose-950/40',
                )}
              >
                {d.row ? moodFor(d.row.mood)?.emoji : <span className="text-rose-700">·</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
