import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Field, Input, Modal } from './ui'

type UpcomingDate = {
  id: string
  title: string
  kind: string
  icon: string
  note: string | null
  date_on: string
  recurs_annually: boolean
  remind_days_before: number
  next_on: string
  days_away: number
  years_count: number | null
}

const KINDS = [
  { key: 'birthday', icon: '🎂', label: 'Birthday', recurs: true },
  { key: 'anniversary', icon: '🥂', label: 'Anniversary', recurs: true },
  { key: 'first_date', icon: '💫', label: 'First date', recurs: true },
  { key: 'occasion', icon: '✨', label: 'Occasion', recurs: false },
  { key: 'trip', icon: '✈️', label: 'Trip', recurs: false },
  { key: 'milestone', icon: '🏁', label: 'Milestone', recurs: false },
] as const

function countdown(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `In ${days} days`
  if (days < 14) return 'Next week'
  if (days < 60) return `In ${Math.round(days / 7)} weeks`
  return `In ${Math.round(days / 30)} months`
}

/**
 * The couple calendar — what's coming, not what happened.
 *
 * Sorted by how soon rather than by date, because "what's next" is the only
 * question anyone actually asks it. Reminders are handled server-side by the
 * same hourly job that announces vault unlocks.
 */
export default function ImportantDates() {
  const { coupleId, userId } = useSession()
  const [dates, setDates] = useState<UpcomingDate[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('upcoming_dates', {
      within_days: 400,
    })
    if (rpcError) setError(errorMessage(rpcError))
    else setDates((data as UpcomingDate[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(id: string) {
    await supabase.from('important_dates').delete().eq('id', id)
    await load()
  }

  if (loading) return null

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">🎂 Important Dates</h3>
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold shadow transition hover:bg-rose-600"
        >
          + Add date
        </button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {dates.length === 0 ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/20 p-5 text-center"
        >
          <p className="text-sm text-rose-200">Nothing on the calendar yet</p>
          <p className="mt-1 text-xs text-rose-400">
            His birthday, your anniversary, the trip you're counting down to.
          </p>
        </button>
      ) : (
        <div className="space-y-2">
          {dates.map((d) => {
            const soon = d.days_away <= 7
            return (
              <div
                key={d.id}
                className={cx(
                  'flex items-center justify-between gap-3 rounded-2xl border p-4',
                  d.days_away === 0
                    ? 'border-pink-500/50 bg-pink-500/15'
                    : soon
                      ? 'border-rose-600/50 bg-rose-900/40'
                      : 'border-rose-700/30 bg-rose-900/25',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-2xl">{d.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">
                      {d.title}
                      {d.days_away === 0 && d.years_count ? (
                        <span className="ml-2 text-pink-300">{d.years_count} years</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-rose-300">
                      {new Date(d.next_on).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'long',
                      })}
                      {d.note && ` · ${d.note}`}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cx(
                      'rounded-xl px-2.5 py-1 text-xs font-semibold',
                      d.days_away === 0
                        ? 'bg-pink-600 text-white'
                        : 'bg-rose-950/60 text-rose-200',
                    )}
                  >
                    {countdown(d.days_away)}
                  </span>
                  <button
                    onClick={() => void remove(d.id)}
                    aria-label={`Remove ${d.title}`}
                    className="text-rose-500 transition-colors hover:text-rose-300"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AddDate
        open={open}
        onClose={() => setOpen(false)}
        coupleId={coupleId}
        userId={userId}
        onSaved={async () => {
          setOpen(false)
          await load()
        }}
      />
    </section>
  )
}

function AddDate({
  open,
  onClose,
  coupleId,
  userId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  coupleId: string | null
  userId: string | null
  onSaved: () => void
}) {
  const [kind, setKind] = useState<string>('birthday')
  const [title, setTitle] = useState('')
  const [dateOn, setDateOn] = useState('')
  const [note, setNote] = useState('')
  const [remind, setRemind] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setKind('birthday')
    setTitle('')
    setNote('')
    setDateOn(new Date().toISOString().slice(0, 10))
    setRemind(3)
    setError('')
  }, [open])

  const selected = KINDS.find((k) => k.key === kind)!

  async function save() {
    if (!title.trim() || !dateOn || !coupleId) return
    setBusy(true)
    setError('')

    const { error: insertError } = await supabase.from('important_dates').insert({
      couple_id: coupleId,
      title: title.trim(),
      kind,
      date_on: dateOn,
      // Birthdays repeat; a trip does not. Sensible per kind, still editable.
      recurs_annually: selected.recurs,
      icon: selected.icon,
      note: note.trim() || null,
      remind_days_before: remind,
      created_by: userId,
    })

    setBusy(false)
    if (insertError) return setError(errorMessage(insertError))
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a date 🎂">
      <div className="space-y-4">
        <Field label="What kind?">
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k.key}
                onClick={() => setKind(k.key)}
                className={cx(
                  'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                  kind === k.key
                    ? 'bg-rose-600 text-white'
                    : 'border border-rose-700/40 bg-rose-900/50 text-rose-300',
                )}
              >
                {k.icon} {k.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="What is it?">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === 'birthday'
                ? 'His birthday'
                : kind === 'trip'
                  ? 'Lagos trip'
                  : 'The day we met'
            }
            maxLength={60}
          />
        </Field>

        <Field
          label="When?"
          hint={
            selected.recurs
              ? 'Repeats every year — put the original date and it counts the years for you.'
              : 'A one-off. It disappears from the list once it passes.'
          }
        >
          <Input type="date" value={dateOn} onChange={(e) => setDateOn(e.target.value)} />
        </Field>

        <Field label="Remind us both">
          <div className="flex flex-wrap gap-2">
            {[0, 1, 3, 7, 14].map((d) => (
              <button
                key={d}
                onClick={() => setRemind(d)}
                className={cx(
                  'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                  remind === d
                    ? 'bg-rose-600 text-white'
                    : 'border border-rose-700/40 bg-rose-900/50 text-rose-300',
                )}
              >
                {d === 0 ? 'On the day only' : `${d} day${d > 1 ? 's' : ''} before`}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Anything to remember?">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="He wants the blue one"
            maxLength={120}
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          disabled={busy || !title.trim()}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-pink-600 py-3 text-sm font-semibold text-white shadow transition hover:bg-pink-500 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add to our calendar'}
        </button>
      </div>
    </Modal>
  )
}
