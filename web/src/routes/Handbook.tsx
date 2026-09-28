import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Field, Input, Loading, Modal, PageHeader, Textarea } from '../components/ui'
import Emoji from '../components/Emoji'
import EmojiPicker from '../components/EmojiPicker'
import type { HandbookEntry, HandbookSection, HandbookSummary } from '../lib/types'

/**
 * The handbook the two of you write for each other.
 *
 * Everything else here is something you send. This is something you keep: what
 * you love, what you can't stand, what actually hurts, and what you need when
 * you're upset — written down calmly, once, so it isn't being explained for the
 * first time in the middle of an argument.
 *
 * Roughly ninety sections, which is why they're rows in a table rather than
 * anything hardcoded here, and why the screen opens on a contents page instead
 * of one enormous scroll. You come here to read one thing.
 *
 * A section is personal or shared, and it changes what the screen does. A
 * personal one has two separate lists and your partner can say "got it" to each
 * line of yours; a shared one is a single list either of you can add to, with
 * nothing to acknowledge because it was never a message to anyone.
 */

const GROUPS: { key: string; emoji: string; title: string; blurb: string }[] = [
  { key: 'know', emoji: '🧠', title: 'Get to Know Us', blurb: 'What lands, what doesn’t, and what I wish you knew.' },
  { key: 'understand', emoji: '🫂', title: 'Understanding Each Other', blurb: 'How to reach me when it’s hard. The most useful part.' },
  { key: 'relationship', emoji: '❤️', title: 'Relationship Stuff', blurb: 'The rules, boundaries and promises you both agreed to.' },
  { key: 'fun', emoji: '😂', title: 'Fun Ones', blurb: 'Habits, catchphrases and the arguments about nothing.' },
  { key: 'deeper', emoji: '🥺', title: 'Deeper Ones', blurb: 'Fears, the hard-to-say ones, and where this is going.' },
  { key: 'personal', emoji: '💌', title: 'Just For You', blurb: 'Reasons, favourite moments, and the list of somedays.' },
  { key: 'growing', emoji: '🌱', title: 'Growing Together', blurb: 'Goals, habits, and the monthly check-in.' },
]

export default function Handbook() {
  const { userId, coupleId, summary: session } = useSession()
  const [sections, setSections] = useState<HandbookSection[]>([])
  const [entries, setEntries] = useState<HandbookEntry[]>([])
  const [counts, setCounts] = useState<HandbookSummary | null>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<HandbookSection | null>(null)
  const [writing, setWriting] = useState<HandbookSection | null>(null)
  /** Which group a new section is being written into. */
  const [newSection, setNewSection] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const partnerName = session?.partner?.display_name ?? 'They'

  const load = useCallback(async () => {
    const [{ data: secs }, { data, error: qErr }, { data: sum }] = await Promise.all([
      supabase.from('handbook_sections').select('*').order('group_key').order('sort_order'),
      supabase.rpc('handbook'),
      supabase.rpc('handbook_summary'),
    ])

    if (qErr) setError(errorMessage(qErr))
    else setEntries((data as HandbookEntry[]) ?? [])
    setSections((secs as HandbookSection[]) ?? [])
    setCounts(((sum as HandbookSummary[]) ?? [])[0] ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** Per-section tallies, so the contents page can show what's in each one. */
  const bySection = useMemo(() => {
    const map = new Map<string, { total: number; unacked: number }>()
    for (const e of entries) {
      const row = map.get(e.section_id) ?? { total: 0, unacked: 0 }
      row.total += 1
      if (!e.acked) row.unacked += 1
      map.set(e.section_id, row)
    }
    return map
  }, [entries])

  async function ack(id: string) {
    // Optimistic: the tap should feel like the acknowledgement, not like a
    // request that might fail.
    setEntries((current) => current.map((e) => (e.id === id ? { ...e, acked: true } : e)))
    setCounts((c) => (c ? { ...c, theirs_unacked: Math.max(0, c.theirs_unacked - 1) } : c))
    const { error: rpcError } = await supabase.rpc('ack_handbook', { entry: id })
    if (rpcError) {
      setError(errorMessage(rpcError))
      await load()
    }
  }

  async function ackAll(sectionId: string | null) {
    setEntries((current) =>
      current.map((e) =>
        e.mine || (sectionId && e.section_id !== sectionId) ? e : { ...e, acked: true },
      ),
    )
    await supabase.rpc('ack_handbook_all', { target_section: sectionId })
    await load()
  }

  async function remove(id: string) {
    setEntries((current) => current.filter((e) => e.id !== id))
    await supabase.from('handbook_entries').delete().eq('id', id)
    await load()
  }

  async function removeSection(s: HandbookSection) {
    const count = bySection.get(s.id)?.total ?? 0
    if (
      count > 0 &&
      !window.confirm(
        `Delete “${s.title}”? The ${count} thing${count === 1 ? '' : 's'} written in it will go too.`,
      )
    ) {
      return
    }
    setSections((current) => current.filter((x) => x.id !== s.id))
    await supabase.from('handbook_sections').delete().eq('id', s.id)
    await load()
  }

  if (loading) return <Loading label="Opening the handbook…" />

  /* ---- one section, open ------------------------------------------------ */

  if (openSection) {
    const s = openSection
    const rows = entries.filter((e) => e.section_id === s.id)
    const theirs = rows.filter((e) => !e.mine)
    const mine = rows.filter((e) => e.mine)
    const unacked = theirs.filter((e) => !e.acked).length

    return (
      <>
        <button
          onClick={() => setOpenSection(null)}
          className="mb-3 text-xs font-semibold text-rose-400 transition hover:text-rose-200"
        >
          ← {GROUPS.find((g) => g.key === s.group_key)?.title}
        </button>

        <PageHeader
          eyebrow={s.scope === 'shared' ? 'Both of you' : 'One list each'}
          title={s.title}
          action={
            <button
              onClick={() => setWriting(s)}
              className="rounded-xl bg-pink-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-pink-500"
            >
              + Add
            </button>
          }
        >
          {s.prompt}
        </PageHeader>

        {error && (
          <div className="mb-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}

        {s.weight === 'heavy' && (
          <p className="mb-4 rounded-2xl border border-pink-500/30 bg-pink-500/10 p-3 text-xs text-pink-200">
            This is one of the parts that isn’t a joke. Read it when nothing is wrong.
          </p>
        )}

        {s.scope === 'shared' ? (
          <EntryList rows={rows} onRemove={remove} onAck={ack} showAuthor />
        ) : (
          <div className="space-y-7">
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-white">{partnerName}</h2>
                {unacked > 0 && (
                  <button
                    onClick={() => void ackAll(s.id)}
                    className="rounded-xl bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-pink-500"
                  >
                    I’ve read all {unacked}
                  </button>
                )}
              </div>
              <EntryList
                rows={theirs}
                onRemove={remove}
                onAck={ack}
                empty={`${partnerName} hasn’t written anything here yet.`}
              />
            </section>

            <section>
              <h2 className="mb-2 text-sm font-bold text-white">Mine</h2>
              <EntryList
                rows={mine}
                onRemove={remove}
                onAck={ack}
                empty={s.placeholder ? `e.g. “${s.placeholder}”` : 'Nothing here yet.'}
              />
            </section>
          </div>
        )}

        <WriteEntry
          section={writing}
          onClose={() => setWriting(null)}
          coupleId={coupleId}
          userId={userId}
          onSaved={async () => {
            setWriting(null)
            await load()
          }}
        />
      </>
    )
  }

  /* ---- one group's contents --------------------------------------------- */

  if (openGroup) {
    const group = GROUPS.find((g) => g.key === openGroup)!
    const list = sections.filter((s) => s.group_key === openGroup)

    return (
      <>
        <button
          onClick={() => setOpenGroup(null)}
          className="mb-3 text-xs font-semibold text-rose-400 transition hover:text-rose-200"
        >
          ← The handbook
        </button>

        <PageHeader eyebrow="The handbook" title={group.title}>
          {group.blurb}
        </PageHeader>

        <ul className="space-y-2">
          {list.map((s) => {
            const t = bySection.get(s.id)
            return (
              <li key={s.id} className="group/row relative">
                <button
                  onClick={() => setOpenSection(s)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5',
                    s.weight === 'heavy'
                      ? 'border-pink-500/30 bg-pink-500/[0.07]'
                      : 'border-rose-700/30 bg-rose-900/25',
                  )}
                >
                  <Emoji size={22}>{s.emoji}</Emoji>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-white">{s.title}</span>
                    <span className="block truncate text-xs text-rose-400">
                      {t?.total
                        ? `${t.total} thing${t.total === 1 ? '' : 's'}`
                        : s.scope === 'shared'
                          ? 'Empty — either of you can start it'
                          : 'Empty'}
                    </span>
                  </span>
                  {t && t.unacked > 0 && (
                    <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-pink-500 px-1.5 text-[0.65rem] font-bold text-white">
                      {t.unacked}
                    </span>
                  )}
                </button>

                {/* Only the ones you wrote. The built-in list is the same for
                    everyone and deleting one would take its entries with it. */}
                {s.couple_id && (
                  <button
                    onClick={() => void removeSection(s)}
                    aria-label={`Delete ${s.title}`}
                    className="absolute top-1.5 right-2 text-xs text-rose-600 opacity-0 transition group-hover/row:opacity-100 hover:text-rose-300"
                  >
                    ✕
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        {/* Ninety sections and you will still want one that isn't here. */}
        <button
          onClick={() => setNewSection(openGroup)}
          className="mt-3 w-full rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/15 p-4 text-sm font-semibold text-rose-400 transition hover:bg-rose-900/30 hover:text-rose-200"
        >
          + A section of our own
        </button>

        <NewSection
          group={newSection}
          onClose={() => setNewSection(null)}
          coupleId={coupleId}
          onSaved={async () => {
            setNewSection(null)
            await load()
          }}
        />
      </>
    )
  }

  /* ---- the contents page ------------------------------------------------- */

  return (
    <>
      <PageHeader eyebrow="The handbook" title="What we want each other to know">
        Written down once, calmly, so it never has to be explained in the middle of an
        argument.
      </PageHeader>

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {/* "17 things ❤️ · I've read them all ✓" */}
      {counts && (counts.theirs_total > 0 || counts.mine_total > 0) && (
        <div className="mb-5 rounded-2xl border border-rose-700/40 bg-rose-900/25 p-4">
          <p className="text-sm font-bold text-white">
            {counts.theirs_total} thing{counts.theirs_total === 1 ? '' : 's'} {partnerName} has
            told me
          </p>
          <p className="mt-0.5 text-xs text-rose-300">
            {counts.theirs_total === 0
              ? `${partnerName} hasn’t written anything yet — yours might be what starts it.`
              : counts.theirs_unacked === 0
                ? 'I’ve read them all ✓'
                : `${counts.theirs_unacked} I haven’t said “got it” to yet`}
          </p>
          <p className="mt-2 border-t border-rose-800/40 pt-2 text-xs text-rose-400">
            {counts.mine_total} of mine written
            {counts.mine_total > 0 &&
              (counts.mine_acked === counts.mine_total
                ? ` · ${partnerName} has read all of them ✓`
                : ` · ${partnerName} has said “got it” to ${counts.mine_acked}`)}
            {counts.shared_total > 0 && ` · ${counts.shared_total} between us`}
          </p>

          {counts.theirs_unacked > 0 && (
            <button
              onClick={() => void ackAll(null)}
              className="mt-3 w-full rounded-xl bg-pink-600 py-2 text-xs font-semibold text-white shadow transition hover:bg-pink-500"
            >
              I’ve read all of it
            </button>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {GROUPS.map((g) => {
          const list = sections.filter((s) => s.group_key === g.key)
          const filled = list.filter((s) => (bySection.get(s.id)?.total ?? 0) > 0).length
          const unacked = list.reduce((n, s) => n + (bySection.get(s.id)?.unacked ?? 0), 0)

          return (
            <li key={g.key}>
              <button
                onClick={() => setOpenGroup(g.key)}
                className="flex w-full items-center gap-3 rounded-2xl border border-rose-700/30 bg-rose-900/25 p-4 text-left transition hover:-translate-y-0.5 hover:bg-rose-900/40"
              >
                <Emoji size={26}>{g.emoji}</Emoji>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">{g.title}</span>
                  <span className="block truncate text-xs text-rose-400">{g.blurb}</span>
                  <span className="mt-0.5 block text-[0.65rem] text-rose-500">
                    {filled} of {list.length} started
                  </span>
                </span>
                {unacked > 0 && (
                  <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-pink-500 px-1.5 text-[0.65rem] font-bold text-white">
                    {unacked}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * A section the two of you wrote.
 *
 * The scope question is the only real one, and it is asked plainly because
 * getting it wrong is annoying to undo: one list each, or one list between you.
 */
function NewSection({
  group,
  onClose,
  coupleId,
  onSaved,
}: {
  group: string | null
  onClose: () => void
  coupleId: string | null
  onSaved: () => void | Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('📝')
  const [scope, setScope] = useState<'personal' | 'shared'>('personal')
  const [heavy, setHeavy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!group) return
    setTitle('')
    setEmoji('📝')
    setScope('personal')
    setHeavy(false)
    setError('')
  }, [group])

  async function save() {
    if (!title.trim() || !coupleId || !group) return
    setBusy(true)
    setError('')

    const { error: insertError } = await supabase.from('handbook_sections').insert({
      couple_id: coupleId,
      // Unique per couple, so two couples can both have a 'the_car_rule'.
      slug: title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'ours',
      group_key: group,
      title: title.trim(),
      emoji: emoji || '📝',
      scope,
      weight: heavy ? 'heavy' : 'light',
      // After the built-ins, in the order you wrote them.
      sort_order: 900,
    })

    setBusy(false)
    if (insertError) return setError(errorMessage(insertError))
    await onSaved()
  }

  return (
    <Modal open={group !== null} onClose={onClose} title="A section of our own" icon="handbook">
      <div className="space-y-4">
        <Field label="What's it called?">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Things we say to end an argument"
            maxLength={60}
          />
        </Field>

        <Field
          label="Who writes it?"
          hint={
            scope === 'personal'
              ? 'One list each. They can say “got it” to every line of yours.'
              : 'One list between you. Either of you adds to it, nothing to acknowledge.'
          }
        >
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['personal', 'One list each'],
                ['shared', 'One list between us'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setScope(key)}
                className={cx(
                  'rounded-xl px-3 py-2.5 text-xs font-semibold transition',
                  scope === key
                    ? 'bg-rose-600 text-white'
                    : 'border border-rose-700/40 bg-rose-900/40 text-rose-300',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        <button
          onClick={() => setHeavy((v) => !v)}
          className={cx(
            'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition',
            heavy
              ? 'border-pink-500/50 bg-pink-500/10'
              : 'border-rose-700/40 bg-rose-900/30',
          )}
        >
          <span
            className={cx(
              'grid size-5 shrink-0 place-items-center rounded-md border text-[0.6rem]',
              heavy ? 'border-pink-400 bg-pink-500 text-white' : 'border-rose-600',
            )}
          >
            {heavy && '✓'}
          </span>
          <span className="text-xs text-rose-200">
            This one isn't a joke — mark it so it reads differently
          </span>
        </button>

        <Field label="Emoji">
          <EmojiPicker value={emoji} onPick={setEmoji} />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          disabled={busy || !title.trim()}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-pink-600 py-3 text-sm font-semibold text-white shadow transition hover:bg-pink-500 disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add the section'}
        </button>
      </div>
    </Modal>
  )
}

function EntryList({
  rows,
  onAck,
  onRemove,
  empty,
  showAuthor = false,
}: {
  rows: HandbookEntry[]
  onAck: (id: string) => void | Promise<void>
  onRemove: (id: string) => void | Promise<void>
  empty?: string
  showAuthor?: boolean
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/15 p-4 text-xs text-rose-400">
        {empty ?? 'Nothing here yet.'}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {rows.map((e) => (
        <li
          key={e.id}
          className={cx(
            'rounded-2xl border border-rose-700/30 bg-rose-900/25 p-4',
            // Unread on their side gets the emphasis. Once you've said "got
            // it" it settles back down.
            !e.mine && !e.acked && 'border-pink-500/40 ring-1 ring-pink-500/30',
          )}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-rose-50">{e.body}</p>

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[0.65rem] text-rose-400">
              {showAuthor ? (e.mine ? 'You' : (e.author_name ?? 'Them')) : ''}
            </span>

            {e.mine ? (
              <button
                onClick={() => void onRemove(e.id)}
                className="text-[0.65rem] text-rose-500 underline-offset-2 transition-colors hover:text-rose-300 hover:underline"
              >
                Delete
              </button>
            ) : e.acked ? (
              <span className="flex items-center gap-1 text-[0.65rem] text-pink-300">
                <Emoji size={12}>❤️</Emoji> Got it
              </span>
            ) : (
              <button
                onClick={() => void onAck(e.id)}
                className="flex items-center gap-1.5 rounded-xl bg-pink-600/90 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-pink-500"
              >
                Got it <Emoji size={13}>❤️</Emoji>
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */

function WriteEntry({
  section,
  onClose,
  coupleId,
  userId,
  onSaved,
}: {
  section: HandbookSection | null
  onClose: () => void
  coupleId: string | null
  userId: string | null
  onSaved: () => void | Promise<void>
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (section) {
      setBody('')
      setError('')
    }
  }, [section])

  async function save() {
    if (!body.trim() || !coupleId || !section) return
    setBusy(true)
    setError('')

    const { error: insertError } = await supabase.from('handbook_entries').insert({
      couple_id: coupleId,
      section_id: section.id,
      author_id: userId,
      body: body.trim(),
    })

    setBusy(false)
    if (insertError) return setError(errorMessage(insertError))
    await onSaved()
  }

  return (
    <Modal open={section !== null} onClose={onClose} title={section?.title ?? 'Add'}>
      <div className="space-y-4">
        {section?.prompt && (
          <p className="flex items-start gap-2 text-xs text-rose-300">
            <Emoji size={16}>{section.emoji}</Emoji>
            {section.prompt}
          </p>
        )}

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={section?.placeholder ?? ''}
          className="min-h-28"
          maxLength={500}
        />

        {section?.weight === 'heavy' && (
          <p className="rounded-xl border border-pink-500/30 bg-pink-500/10 p-3 text-xs text-pink-200">
            This one goes in the part of the handbook that isn’t a joke. Say it plainly.
          </p>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          disabled={busy || !body.trim()}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-pink-600 py-3 text-sm font-semibold text-white shadow transition hover:bg-pink-500 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add it'}
        </button>
      </div>
    </Modal>
  )
}
