import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Field, Input, Modal, PageHeader } from '../components/ui'
import Emoji from '../components/Emoji'
import EmojiPicker from '../components/EmojiPicker'
import type { DateIdea } from '../lib/types'

/**
 * 🎲 PICK OUR DATE
 *
 * The problem isn't a shortage of ideas. It's the twenty minutes of "I don't
 * mind, what do you want to do" on a Friday with four hours free and no money,
 * which reliably ends in neither of you doing anything.
 *
 * So the filters are the real constraints rather than categories: what it
 * costs, whether you're going out, how long you've actually got, and what mood
 * you're in. An idea that doesn't fit all four isn't an idea, it's a reminder
 * that you can't afford it.
 *
 * Three things make it worth pressing twice. You can say "not that one", and
 * it deals around everything you've rejected this sitting. Some of what it
 * deals comes off your own bucket list, because the best suggestion the app can
 * make is a thing you already said you wanted to do. And anything you like can
 * go straight in the calendar, where the app already knows how to remind you.
 */

const BUDGETS = [
  { key: 'free', label: 'Free' },
  { key: 'cheap', label: 'Cheap' },
  { key: 'mid', label: 'Mid' },
  { key: 'splash', label: 'Splash out' },
] as const

const PLACES = [
  { key: null, label: 'Either' },
  { key: true, label: 'Stay in' },
  { key: false, label: 'Go out' },
] as const

const TIMES = [
  { key: 60, label: 'An hour' },
  { key: 120, label: '2 hours' },
  { key: 240, label: 'An evening' },
  { key: 600, label: 'All day' },
] as const

const VIBES = [
  { key: null, label: 'Anything' },
  { key: 'romantic', label: 'Romantic' },
  { key: 'fun', label: 'Fun' },
  { key: 'chill', label: 'Chill' },
] as const

type Recent = {
  id: string
  done_at: string | null
  picked_at: string
  date_ideas: { title: string; emoji: string } | null
}

export default function DateNight() {
  const { coupleId, userId } = useSession()

  const [budget, setBudget] = useState<string>('cheap')
  const [indoor, setIndoor] = useState<boolean | null>(null)
  const [minutes, setMinutes] = useState<number>(240)
  const [vibe, setVibe] = useState<string | null>(null)
  const [useBucket, setUseBucket] = useState(true)

  const [idea, setIdea] = useState<DateIdea | null>(null)
  /** Turned down this sitting. Not persisted — "not tonight" is about tonight. */
  const [rejected, setRejected] = useState<string[]>([])
  const [nothing, setNothing] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [done, setDone] = useState(false)
  const [planned, setPlanned] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [writing, setWriting] = useState(false)
  const [recent, setRecent] = useState<Recent[]>([])
  const [error, setError] = useState('')

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from('date_picks')
      .select('id, done_at, picked_at, date_ideas(title, emoji)')
      .order('picked_at', { ascending: false })
      .limit(6)
    setRecent((data as unknown as Recent[]) ?? [])
  }, [])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  async function pick(alsoReject?: DateIdea | null) {
    // Rejecting and re-rolling are the same action, which is why "not tonight"
    // is on the same button path rather than a separate request.
    const skip = alsoReject
      ? [...rejected, alsoReject.bucket_id ?? alsoReject.id]
      : rejected

    setRejected(skip)
    setRolling(true)
    setError('')
    setNothing(false)
    setDone(false)
    setPlanned(false)

    const { data, error: rpcError } = await supabase.rpc('pick_date', {
      max_budget: budget,
      want_indoor: indoor,
      max_minutes: minutes,
      want_vibe: vibe,
      skip_ids: skip,
      use_bucket: useBucket,
    })

    // A beat of suspense. The roll is most of the fun; an instant answer reads
    // like a database lookup, which is what it is and shouldn't feel like.
    await new Promise((r) => setTimeout(r, 480))
    setRolling(false)

    if (rpcError) return setError(errorMessage(rpcError))

    const next = ((data as DateIdea[]) ?? [])[0] ?? null
    if (!next) {
      setIdea(null)
      setNothing(true)
      return
    }
    setIdea(next)
    void loadRecent()
  }

  async function weDidIt() {
    if (!idea) return

    // A bucket-list date ticks the bucket list, which writes the timeline entry
    // itself. Anything else writes its own.
    const { error: rpcError } = idea.bucket_id
      ? await supabase.rpc('complete_bucket_item', { item: idea.bucket_id, done: true })
      : await supabase.rpc('date_done', { pick: idea.pick_id })

    if (rpcError) return setError(errorMessage(rpcError))
    setDone(true)
    void loadRecent()
  }

  async function plan(on: string) {
    if (!idea) return
    const { error: rpcError } = await supabase.rpc('plan_date', {
      idea_title: idea.title,
      idea_emoji: idea.emoji,
      on_date: on,
    })
    if (rpcError) return setError(errorMessage(rpcError))
    setPlanning(false)
    setPlanned(true)
  }

  return (
    <>
      <PageHeader
        eyebrow="Friday problem"
        title="Pick our date"
        action={
          <button
            onClick={() => setWriting(true)}
            className="rounded-xl bg-rose-800/60 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-700"
          >
            + Our own
          </button>
        }
      >
        Tell it what’s actually true tonight, then press the button.
      </PageHeader>

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="mb-5 space-y-4 rounded-2xl border border-rose-700/40 bg-rose-900/25 p-4">
        <Row label="Budget">
          {BUDGETS.map((b) => (
            <Pill key={b.key} on={budget === b.key} onClick={() => setBudget(b.key)}>
              {b.label}
            </Pill>
          ))}
        </Row>

        <Row label="In or out">
          {PLACES.map((p) => (
            <Pill key={String(p.key)} on={indoor === p.key} onClick={() => setIndoor(p.key)}>
              {p.label}
            </Pill>
          ))}
        </Row>

        <Row label="How long have we got">
          {TIMES.map((t) => (
            <Pill key={t.key} on={minutes === t.key} onClick={() => setMinutes(t.key)}>
              {t.label}
            </Pill>
          ))}
        </Row>

        <Row label="Mood">
          {VIBES.map((v) => (
            <Pill key={String(v.key)} on={vibe === v.key} onClick={() => setVibe(v.key)}>
              {v.label}
            </Pill>
          ))}
        </Row>

        <button
          onClick={() => setUseBucket((v) => !v)}
          className="flex w-full items-center gap-3 rounded-xl border border-rose-700/40 bg-rose-900/30 p-3 text-left transition hover:bg-rose-900/50"
        >
          <span
            className={cx(
              'grid size-5 shrink-0 place-items-center rounded-md border text-[0.6rem]',
              useBucket ? 'border-pink-400 bg-pink-500 text-white' : 'border-rose-600',
            )}
          >
            {useBucket && '✓'}
          </span>
          <span className="text-xs text-rose-200">
            Include things off our bucket list
          </span>
        </button>
      </div>

      <button
        onClick={() => void pick()}
        disabled={rolling}
        className="mb-4 grid w-full place-items-center gap-2 rounded-3xl border border-pink-500/40 bg-gradient-to-br from-rose-900/70 to-rose-950 py-10 shadow-2xl transition-transform active:scale-[0.985] disabled:opacity-70"
      >
        <span className={cx('block', rolling && 'animate-spin')}>
          <Emoji size={52}>🎲</Emoji>
        </span>
        <span className="text-2xl font-bold tracking-wide text-white">
          {rolling ? 'Rolling…' : idea ? 'ROLL AGAIN' : 'PICK OUR DATE'}
        </span>
        {rejected.length > 0 && !rolling && (
          <span className="text-[0.65rem] text-rose-400">
            skipping {rejected.length} you’ve turned down
          </span>
        )}
      </button>

      {nothing && (
        <div className="rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/20 p-5 text-center">
          <p className="text-sm text-rose-200">
            {rejected.length > 0 ? 'Nothing left that fits.' : 'Nothing fits all of that.'}
          </p>
          <p className="mt-1 text-xs text-rose-400">
            Loosen one — usually the time, occasionally the money.
          </p>
          {rejected.length > 0 && (
            <button
              onClick={() => {
                setRejected([])
                setNothing(false)
              }}
              className="mt-3 rounded-xl bg-rose-800/60 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-700"
            >
              Put the rejected ones back
            </button>
          )}
        </div>
      )}

      {idea && !rolling && (
        <div className="animate-rise rounded-3xl border border-pink-500/30 bg-gradient-to-br from-rose-900/60 to-rose-950 p-7 text-center shadow-xl">
          <p className="text-[0.65rem] font-semibold tracking-wider text-pink-300 uppercase">
            {idea.bucket_id ? 'Off your bucket list' : 'Tonight’s date'}
          </p>

          <div className="my-4">
            <Emoji size={44}>{idea.emoji}</Emoji>
          </div>
          <p className="text-xl font-bold text-white">{idea.title}</p>

          {!idea.bucket_id && (
            <p className="mt-3 text-xs text-rose-400">
              {BUDGETS.find((b) => b.key === idea.budget)?.label}
              {' · '}
              {idea.indoor === null ? 'either' : idea.indoor ? 'in' : 'out'}
              {' · '}
              {idea.minutes >= 300 ? 'all day' : `~${Math.round(idea.minutes / 60)}h`}
              {idea.vibe && ` · ${idea.vibe}`}
            </p>
          )}

          {done ? (
            <p className="mt-5 flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-300">
              <Emoji size={16}>✨</Emoji>
              {idea.bucket_id ? 'Ticked off — and on the timeline' : 'On the timeline'}
            </p>
          ) : planned ? (
            <p className="mt-5 flex items-center justify-center gap-1.5 text-sm font-semibold text-pink-300">
              <Emoji size={16}>🗓️</Emoji> In the calendar — you’ll both get a reminder
            </p>
          ) : (
            <div className="mt-5 space-y-2">
              <button
                onClick={() => void weDidIt()}
                className="w-full rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500"
              >
                We did it — save it
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setPlanning(true)}
                  className="flex-1 rounded-2xl bg-rose-900/60 py-2.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-900"
                >
                  Plan it for a day
                </button>
                <button
                  onClick={() => void pick(idea)}
                  className="flex-1 rounded-2xl border border-rose-700/40 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-900/40"
                >
                  Not tonight
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="label mb-2">Lately</h2>
          <ul className="space-y-1.5">
            {recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-rose-900/30"
              >
                <Emoji size={16}>{r.date_ideas?.emoji ?? '🎲'}</Emoji>
                <span
                  className={cx(
                    'min-w-0 flex-1 truncate',
                    r.done_at ? 'text-rose-200' : 'text-rose-400',
                  )}
                >
                  {r.date_ideas?.title ?? 'A date'}
                </span>
                <span className="shrink-0 text-[0.65rem] text-rose-500">
                  {r.done_at ? 'done ✓' : 'rolled'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PlanIt open={planning} onClose={() => setPlanning(false)} onPick={plan} />
      <WriteIdea
        open={writing}
        onClose={() => setWriting(false)}
        coupleId={coupleId}
        userId={userId}
        onSaved={() => setWriting(false)}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */

function PlanIt({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (on: string) => void | Promise<void>
}) {
  const [when, setWhen] = useState('')

  useEffect(() => {
    if (open) setWhen(new Date().toISOString().slice(0, 10))
  }, [open])

  // Friday is the answer often enough to be worth a button.
  function nextFriday(): string {
    const d = new Date()
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7))
    return d.toISOString().slice(0, 10)
  }

  return (
    <Modal open={open} onClose={onClose} title="Plan it" icon="cake">
      <div className="space-y-4">
        <p className="text-xs text-rose-300">
          It goes on the calendar you both look at, and you’ll both get a nudge the day
          before.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setWhen(new Date().toISOString().slice(0, 10))}
            className="rounded-xl bg-rose-900/50 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-900"
          >
            Tonight
          </button>
          <button
            onClick={() => setWhen(nextFriday())}
            className="rounded-xl bg-rose-900/50 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-900"
          >
            Friday
          </button>
        </div>

        <Field label="When?">
          <Input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>

        <button
          disabled={!when}
          onClick={() => void onPick(when)}
          className="w-full rounded-2xl bg-pink-600 py-3 text-sm font-semibold text-white shadow transition hover:bg-pink-500 disabled:opacity-50"
        >
          Put it in the calendar
        </button>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */

function WriteIdea({
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
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('✨')
  const [budget, setBudget] = useState<string>('cheap')
  const [indoor, setIndoor] = useState<boolean | null>(null)
  const [minutes, setMinutes] = useState(120)
  const [vibe, setVibe] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setEmoji('✨')
    setError('')
  }, [open])

  async function save() {
    if (!title.trim() || !coupleId) return
    setBusy(true)
    setError('')

    const { error: insertError } = await supabase.from('date_ideas').insert({
      couple_id: coupleId,
      title: title.trim(),
      emoji: emoji || '✨',
      budget,
      indoor,
      minutes,
      vibe,
      created_by: userId,
    })

    setBusy(false)
    if (insertError) return setError(errorMessage(insertError))
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="One of ours" icon="dice">
      <div className="space-y-4">
        <p className="text-xs text-rose-300">
          It goes into the same draw as the built-in ones — tag it honestly and it’ll turn
          up on the right kind of night.
        </p>

        <Field label="What is it?">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Chips on the wall by the station"
            maxLength={120}
          />
        </Field>

        <Row label="Budget">
          {BUDGETS.map((b) => (
            <Pill key={b.key} on={budget === b.key} onClick={() => setBudget(b.key)}>
              {b.label}
            </Pill>
          ))}
        </Row>

        <Row label="In or out">
          {PLACES.map((p) => (
            <Pill key={String(p.key)} on={indoor === p.key} onClick={() => setIndoor(p.key)}>
              {p.label}
            </Pill>
          ))}
        </Row>

        <Row label="How long">
          {TIMES.map((t) => (
            <Pill key={t.key} on={minutes === t.key} onClick={() => setMinutes(t.key)}>
              {t.label}
            </Pill>
          ))}
        </Row>

        <Row label="Mood">
          {VIBES.map((v) => (
            <Pill key={String(v.key)} on={vibe === v.key} onClick={() => setVibe(v.key)}>
              {v.label}
            </Pill>
          ))}
        </Row>

        <Field label="Emoji">
          <EmojiPicker value={emoji} onPick={setEmoji} />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          disabled={busy || !title.trim()}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-pink-600 py-3 text-sm font-semibold text-white shadow transition hover:bg-pink-500 disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add to the pile'}
        </button>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[0.65rem] font-semibold tracking-wider text-rose-400 uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
        on
          ? 'bg-rose-600 text-white shadow'
          : 'border border-rose-700/40 bg-rose-900/40 text-rose-300 hover:bg-rose-900',
      )}
    >
      {children}
    </button>
  )
}
