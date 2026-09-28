import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { cx, ErrorNote, Field, Input, Modal, Textarea } from './ui'
import Emoji from './Emoji'
import type { Fight, FightStats } from '../lib/types'

/**
 * The argument log.
 *
 * The tone is the design. There is no "who started it" and no fault column,
 * because a shared table with a blame field is a weapon and would get used as
 * one. What it keeps is when it started, when you made up, what it was about,
 * and what helped — the four things you actually want in front of you the next
 * time.
 *
 * The big number is days since the last one, because that is the number that
 * is reassuring on a bad day. Next to it sits how many dates you went on in
 * the same stretch: one of those numbers alone says nothing true about a month,
 * and the pair of them together usually says "we're fine".
 *
 * Nothing here reaches the timeline. Memories are for looking back on; this is
 * a tool you come and find on purpose.
 */
export default function FightTracker() {
  const [stats, setStats] = useState<FightStats | null>(null)
  const [history, setHistory] = useState<Fight[]>([])
  const [open, setOpen] = useState(false)
  const [logging, setLogging] = useState(false)
  const [resolving, setResolving] = useState<Fight | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [{ data: s }, { data: rows, error: qErr }] = await Promise.all([
      supabase.rpc('fight_stats'),
      supabase.from('fights').select('*').order('started_on', { ascending: false }),
    ])
    if (qErr) setError(errorMessage(qErr))
    else setHistory((rows as Fight[]) ?? [])
    setStats(((s as FightStats[]) ?? [])[0] ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(id: string) {
    setHistory((h) => h.filter((f) => f.id !== id))
    await supabase.from('fights').delete().eq('id', id)
    await load()
  }

  if (loading || !stats) return null

  const ongoing = stats.open_id !== null
  const never = stats.total === 0

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <Emoji size={19}>🌧️</Emoji>
          When it’s hard
        </h3>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs font-semibold text-rose-400 transition hover:text-rose-200"
        >
          {open ? 'Hide' : never ? 'What’s this?' : 'Open'}
        </button>
      </div>

      {/* The headline. Always visible, because the whole value of the thing is
          glancing at it and seeing a big number. */}
      <button
        onClick={() => setOpen(true)}
        className={cx(
          'w-full rounded-2xl border p-5 text-left transition',
          ongoing
            ? 'border-amber-500/40 bg-amber-500/[0.08]'
            : 'border-rose-700/30 bg-rose-900/25 hover:bg-rose-900/40',
        )}
      >
        {never ? (
          <>
            <p className="text-sm font-bold text-white">Nothing logged</p>
            <p className="mt-1 text-xs text-rose-400">
              Not a scoreboard. Somewhere to write down what it was about and what
              helped, so next time you both start from what you learned.
            </p>
          </>
        ) : ongoing ? (
          <>
            <p className="text-2xl font-bold text-amber-200">
              {stats.open_days === 0
                ? 'Today'
                : `${stats.open_days} day${stats.open_days === 1 ? '' : 's'}`}
            </p>
            <p className="mt-0.5 text-sm text-amber-100/80">still not sorted</p>
            <p className="mt-2 text-xs text-rose-300">
              Tap to write down what helped and close it.
            </p>
          </>
        ) : (
          <>
            <p className="text-3xl font-bold text-white">
              {stats.days_since ?? 0}
              <span className="ml-2 text-base font-semibold text-rose-300">
                day{stats.days_since === 1 ? '' : 's'} since the last one
              </span>
            </p>
            {stats.longest_peace !== null && stats.days_since !== null && (
              <p className="mt-1 text-xs text-rose-400">
                {stats.days_since >= stats.longest_peace
                  ? 'Your longest stretch yet ✨'
                  : `Best so far is ${stats.longest_peace}`}
              </p>
            )}
          </>
        )}
      </button>

      {/* The comparison. One of these numbers on its own says nothing true
          about a month. */}
      {!never && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Tile
            emoji="💚"
            value={stats.dates_month}
            label={`date${stats.dates_month === 1 ? '' : 's'} this month`}
            good
          />
          <Tile
            emoji="🌧️"
            value={stats.fights_month}
            label={`argument${stats.fights_month === 1 ? '' : 's'} this month`}
          />
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-4">
          {error && <ErrorNote>{error}</ErrorNote>}

          {!never && (
            <div className="grid grid-cols-3 gap-2">
              <Stat value={stats.total} label="all time" />
              <Stat
                value={stats.avg_days === null ? '—' : `${stats.avg_days}d`}
                label="usually last"
              />
              <Stat
                value={
                  stats.fastest_makeup === null
                    ? '—'
                    : stats.fastest_makeup === 0
                      ? 'same day'
                      : `${stats.fastest_makeup}d`
                }
                label="fastest make-up"
              />
            </div>
          )}

          <div className="flex gap-2">
            {ongoing ? (
              <button
                onClick={() => {
                  const f = history.find((x) => x.id === stats.open_id)
                  if (f) setResolving(f)
                }}
                className="flex-1 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500"
              >
                We made up 💗
              </button>
            ) : (
              <button
                onClick={() => setLogging(true)}
                className="flex-1 rounded-2xl bg-rose-900/60 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-900"
              >
                Log one
              </button>
            )}
          </div>

          {history.length > 0 && (
            <ul className="space-y-2">
              {history.map((f) => {
                const days =
                  f.resolved_on === null
                    ? null
                    : Math.round(
                        (new Date(f.resolved_on).getTime() -
                          new Date(f.started_on).getTime()) /
                          86_400_000,
                      )
                return (
                  <li
                    key={f.id}
                    className={cx(
                      'rounded-2xl border p-4',
                      f.resolved_on === null
                        ? 'border-amber-500/40 bg-amber-500/[0.07]'
                        : 'border-rose-700/30 bg-rose-900/25',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-rose-50">
                          {f.what_about || 'No reason written down'}
                        </p>
                        <p className="mt-0.5 text-xs text-rose-400">
                          {new Date(f.started_on).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {f.resolved_on === null
                            ? ' · still going'
                            : days === 0
                              ? ' · made up the same day'
                              : ` · made up after ${days} day${days === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <button
                        onClick={() => void remove(f.id)}
                        aria-label="Delete"
                        className="shrink-0 text-rose-600 transition-colors hover:text-rose-300"
                      >
                        ✕
                      </button>
                    </div>

                    {f.what_helped && (
                      <p className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-2.5 text-xs text-emerald-100/90">
                        <span className="font-semibold">What helped: </span>
                        {f.what_helped}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <LogFight
        open={logging}
        onClose={() => setLogging(false)}
        onSaved={async () => {
          setLogging(false)
          setOpen(true)
          await load()
        }}
      />
      <ResolveFight
        fight={resolving}
        onClose={() => setResolving(null)}
        onSaved={async () => {
          setResolving(null)
          await load()
        }}
      />
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function Tile({
  emoji,
  value,
  label,
  good = false,
}: {
  emoji: string
  value: number
  label: string
  good?: boolean
}) {
  return (
    <div
      className={cx(
        'rounded-2xl border p-4 text-center',
        good && value > 0
          ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
          : 'border-rose-700/30 bg-rose-900/25',
      )}
    >
      <Emoji size={18}>{emoji}</Emoji>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      <p className="text-[0.65rem] text-rose-400">{label}</p>
    </div>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-xl border border-rose-700/30 bg-rose-900/25 p-3 text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[0.6rem] tracking-wide text-rose-400 uppercase">{label}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function LogFight({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [about, setAbout] = useState('')
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setAbout('')
    setWhen(new Date().toISOString().slice(0, 10))
    setError('')
  }, [open])

  async function save() {
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('log_fight', {
      about: about.trim() || null,
      on_date: when || null,
    })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Log one" icon="heart">
      <div className="space-y-4">
        <p className="text-xs text-rose-300">
          No fault, no sides — just what it was about, so you can look back at it when
          you’re both calm.
        </p>

        <Field label="What was it about?" hint="A few words. You can leave it blank.">
          <Textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="The same thing as last time, honestly"
            className="min-h-20"
            maxLength={300}
          />
        </Field>

        <Field label="When did it start?">
          <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          disabled={busy}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-rose-700 py-3 text-sm font-semibold text-white shadow transition hover:bg-rose-600 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Log it'}
        </button>
      </div>
    </Modal>
  )
}

function ResolveFight({
  fight,
  onClose,
  onSaved,
}: {
  fight: Fight | null
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [helped, setHelped] = useState('')
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!fight) return
    setHelped(fight.what_helped ?? '')
    setWhen(new Date().toISOString().slice(0, 10))
    setError('')
  }, [fight])

  async function save() {
    if (!fight) return
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('resolve_fight', {
      fight: fight.id,
      helped: helped.trim() || null,
      on_date: when || null,
    })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await onSaved()
  }

  return (
    <Modal open={fight !== null} onClose={onClose} title="We made up" icon="heart">
      <div className="space-y-4">
        <p className="text-xs text-rose-300">
          This is the part worth writing. Next time, it’s the first thing either of you
          will read.
        </p>

        <Field label="What helped?">
          <Textarea
            value={helped}
            onChange={(e) => setHelped(e.target.value)}
            placeholder="You came and sat down instead of leaving the room"
            className="min-h-24"
            maxLength={300}
          />
        </Field>

        <Field label="When?">
          <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          disabled={busy}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow transition hover:from-pink-500 hover:to-rose-500 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Close it 💗'}
        </button>
      </div>
    </Modal>
  )
}
