import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Field, Input, Loading, Modal, PageHeader, Textarea } from '../components/ui'
import Emoji from '../components/Emoji'
import type { BucketItem } from '../lib/types'

/**
 * The list of things you haven't done yet.
 *
 * Split six ways rather than kept as one pile, because "Japan" and "try the
 * place on the corner" in the same list means the corner one never gets picked
 * — it looks trivial next to Japan.
 *
 * Ticking one off writes it onto the timeline. That happens in
 * `complete_bucket_item()`, not here: a thing you'd wanted to do for years and
 * finally did is a milestone by definition, and it should not depend on
 * somebody remembering to also add it.
 */

const CATEGORIES = [
  { key: 'places', emoji: '🌍', title: 'Places', placeholder: 'Somewhere neither of us has been' },
  { key: 'experiences', emoji: '🎢', title: 'Experiences', placeholder: 'Watch a sunrise, properly awake' },
  { key: 'food', emoji: '🍽️', title: 'Food', placeholder: 'The place we keep saying we’ll try' },
  { key: 'goals', emoji: '🎯', title: 'Goals', placeholder: 'A month with no week of silence' },
  { key: 'save_for', emoji: '💰', title: 'Things to save for', placeholder: 'The trip' },
  { key: 'always', emoji: '🥹', title: 'Things we’ve always wanted to do', placeholder: 'The one from before we met' },
] as const

export default function Bucket() {
  const { coupleId, userId } = useSession()
  const [items, setItems] = useState<BucketItem[]>([])
  const [adding, setAdding] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('bucket_items')
      .select('*')
      .order('created_at')
    if (qErr) setError(errorMessage(qErr))
    else setItems((data as BucketItem[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(item: BucketItem) {
    const done = !item.completed_at
    // Optimistic — the tick is the celebration, it shouldn't wait on a round
    // trip that also writes a timeline entry.
    setItems((current) =>
      current.map((i) =>
        i.id === item.id
          ? { ...i, completed_at: done ? new Date().toISOString() : null }
          : i,
      ),
    )
    const { error: rpcError } = await supabase.rpc('complete_bucket_item', {
      item: item.id,
      done,
    })
    if (rpcError) setError(errorMessage(rpcError))
    await load()
  }

  async function remove(id: string) {
    setItems((current) => current.filter((i) => i.id !== id))
    await supabase.from('bucket_items').delete().eq('id', id)
    await load()
  }

  async function seed() {
    await supabase.rpc('seed_bucket_list')
    await load()
  }

  if (loading) return <Loading label="…" />

  const done = items.filter((i) => i.completed_at).length

  return (
    <>
      <PageHeader eyebrow="Someday" title="Our bucket list">
        Tick one off and it writes itself onto the timeline.
      </PageHeader>

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/20 p-6 text-center">
          <p className="text-sm text-rose-200">Nothing on it yet.</p>
          <p className="mt-1 text-xs text-rose-400">
            Six headings and nothing under them is a hard place to start from.
          </p>
          <button
            onClick={() => void seed()}
            className="mt-3 rounded-2xl bg-pink-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-pink-500"
          >
            Start us off with a few
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-rose-700/40 bg-rose-900/25 p-4">
            <div>
              <p className="text-sm font-bold text-white">
                {done} of {items.length} done
              </p>
              <p className="mt-0.5 text-xs text-rose-300">
                {done === 0
                  ? 'Pick the easiest one. It counts the same.'
                  : `${items.length - done} still waiting.`}
              </p>
            </div>
            <button
              onClick={() => setShowDone((v) => !v)}
              className="shrink-0 rounded-xl bg-rose-800/60 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-700"
            >
              {showDone ? 'Hide done' : 'Show done'}
            </button>
          </div>

          <div className="space-y-6">
            {CATEGORIES.map((cat) => {
              const rows = items
                .filter((i) => i.category === cat.key)
                .filter((i) => showDone || !i.completed_at)
              const catDone = items.filter(
                (i) => i.category === cat.key && i.completed_at,
              ).length
              const catTotal = items.filter((i) => i.category === cat.key).length

              return (
                <section key={cat.key}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-base font-bold text-white">
                      <Emoji size={19}>{cat.emoji}</Emoji>
                      {cat.title}
                      {catTotal > 0 && (
                        <span className="text-xs font-normal text-rose-400">
                          {catDone}/{catTotal}
                        </span>
                      )}
                    </h2>
                    <button
                      onClick={() => setAdding(cat.key)}
                      className="shrink-0 rounded-xl bg-rose-800/60 px-3 py-1.5 text-xs font-semibold text-rose-100 transition hover:bg-rose-700"
                    >
                      + Add
                    </button>
                  </div>

                  {rows.length === 0 ? (
                    <button
                      onClick={() => setAdding(cat.key)}
                      className="w-full rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/15 p-4 text-left text-xs text-rose-400"
                    >
                      e.g. “{cat.placeholder}”
                    </button>
                  ) : (
                    <ul className="space-y-2">
                      {rows.map((i) => {
                        const isDone = !!i.completed_at
                        return (
                          <li
                            key={i.id}
                            className={cx(
                              'flex items-start gap-3 rounded-2xl border p-4 transition',
                              isDone
                                ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
                                : 'border-rose-700/30 bg-rose-900/25',
                            )}
                          >
                            <button
                              onClick={() => void toggle(i)}
                              aria-label={isDone ? 'Not done after all' : 'Mark done'}
                              className={cx(
                                'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs transition',
                                isDone
                                  ? 'border-emerald-400 bg-emerald-500 text-white'
                                  : 'border-rose-600 hover:border-pink-400',
                              )}
                            >
                              {isDone && '✓'}
                            </button>

                            <div className="min-w-0 flex-1">
                              <p
                                className={cx(
                                  'text-sm leading-relaxed',
                                  isDone ? 'text-emerald-100/80 line-through' : 'text-rose-50',
                                )}
                              >
                                {i.title}
                              </p>
                              {i.note && (
                                <p className="mt-0.5 text-xs text-rose-400">{i.note}</p>
                              )}
                              {isDone && (
                                <p className="mt-1.5 flex items-center gap-1 text-[0.65rem] font-semibold tracking-wider text-emerald-300 uppercase">
                                  <Emoji size={12}>✨</Emoji> Completed · on the timeline
                                </p>
                              )}
                            </div>

                            <button
                              onClick={() => void remove(i.id)}
                              aria-label={`Remove ${i.title}`}
                              className="shrink-0 text-rose-600 transition-colors hover:text-rose-300"
                            >
                              ✕
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}

      <AddItem
        category={adding}
        onClose={() => setAdding(null)}
        coupleId={coupleId}
        userId={userId}
        onSaved={async () => {
          setAdding(null)
          await load()
        }}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */

function AddItem({
  category,
  onClose,
  coupleId,
  userId,
  onSaved,
}: {
  category: string | null
  onClose: () => void
  coupleId: string | null
  userId: string | null
  onSaved: () => void | Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const cat = CATEGORIES.find((c) => c.key === category)

  useEffect(() => {
    if (category) {
      setTitle('')
      setNote('')
      setError('')
    }
  }, [category])

  async function save() {
    if (!title.trim() || !coupleId || !category) return
    setBusy(true)
    setError('')

    const { error: insertError } = await supabase.from('bucket_items').insert({
      couple_id: coupleId,
      category,
      title: title.trim(),
      note: note.trim() || null,
      created_by: userId,
    })

    setBusy(false)
    if (insertError) return setError(errorMessage(insertError))
    await onSaved()
  }

  return (
    <Modal open={category !== null} onClose={onClose} title={cat?.title ?? 'Add'}>
      <div className="space-y-4">
        <Field label="What is it?">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={cat?.placeholder}
            maxLength={120}
          />
        </Field>

        <Field label="Anything else?" hint="This becomes the memory’s description when you tick it off.">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
            className="min-h-20"
            maxLength={300}
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          disabled={busy || !title.trim()}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-pink-600 py-3 text-sm font-semibold text-white shadow transition hover:bg-pink-500 disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add it'}
        </button>
      </div>
    </Modal>
  )
}
