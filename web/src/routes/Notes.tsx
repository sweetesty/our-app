import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import {
  Button,
  cx,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Textarea,
} from '../components/ui'
import { when } from '../lib/format'
import { MOODS, type LoveNote, type NoteMood } from '../lib/types'

export default function Notes() {
  const { userId, coupleId, refresh } = useSession()
  const [notes, setNotes] = useState<LoveNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [reading, setReading] = useState<LoveNote | null>(null)
  const [filter, setFilter] = useState<'all' | 'mine' | 'theirs'>('all')

  const load = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('love_notes')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (qErr) setError(errorMessage(qErr))
    else setNotes((data as LoveNote[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function open(note: LoveNote) {
    setReading(note)
    // Only marks rows your partner wrote — the RPC filters on author <> you.
    if (!note.read_at && note.author_id !== userId) {
      await supabase.rpc('mark_note_read', { note: note.id })
      void load()
    }
  }

  async function togglePin(note: LoveNote) {
    const { error: rpcError } = await supabase.rpc('toggle_note_pin', { note: note.id })
    if (rpcError) setError(errorMessage(rpcError))
    await load()
  }

  async function remove(note: LoveNote) {
    const { error: delError } = await supabase.from('love_notes').delete().eq('id', note.id)
    if (delError) setError(errorMessage(delError))
    setReading(null)
    await load()
  }

  const visible = notes.filter((n) =>
    filter === 'all' ? true : filter === 'mine' ? n.author_id === userId : n.author_id !== userId,
  )
  const pinned = visible.filter((n) => n.is_pinned)
  const rest = visible.filter((n) => !n.is_pinned)

  if (loading) return <Loading label="Reading the wall…" />

  return (
    <>
      <PageHeader
        eyebrow="The wall"
        title="Love notes"
        action={<Button onClick={() => setComposerOpen(true)}>Leave a note</Button>}
      >
        Things worth writing down. Pin the ones that should stay at the top.
      </PageHeader>

      <div className="mb-5 flex gap-2">
        {(['all', 'mine', 'theirs'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              filter === f
                ? 'rounded-full bg-lav-400/15 px-3.5 py-1.5 text-xs text-lav-300 ring-1 ring-lav-400/30'
                : 'rounded-full bg-raised/50 px-3.5 py-1.5 text-xs text-ink-muted hover:text-ink-soft'
            }
          >
            {f === 'all' ? 'Everything' : f === 'mine' ? 'From me' : 'From them'}
          </button>
        ))}
      </div>

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      {visible.length === 0 ? (
        <EmptyState
          emoji="📌"
          title="A blank wall"
          example="Read this when you're having a bad day"
          action={<Button onClick={() => setComposerOpen(true)}>Write the first one</Button>}
        >
          Leave notes here for each other to find later. Pin the ones that should
          never scroll away.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <section className="space-y-3">
              <h2 className="label">Pinned</h2>
              <div className="space-y-3">
                {pinned.map((n, i) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    index={i}
                    mine={n.author_id === userId}
                    onOpen={() => void open(n)}
                  />
                ))}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section className="space-y-3">
              {pinned.length > 0 && <h2 className="label">Everything else</h2>}
              <div className="space-y-3">
                {rest.map((n, i) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    index={i + 2}
                    mine={n.author_id === userId}
                    onOpen={() => void open(n)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Composer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        coupleId={coupleId}
        onSaved={async () => {
          setComposerOpen(false)
          await load()
          await supabase.rpc('sync_achievements')
          await refresh()
        }}
      />

      <Modal
        open={!!reading}
        onClose={() => setReading(null)}
        title={reading?.title || MOODS.find((m) => m.value === reading?.mood)?.label || 'Note'}
      >
        {reading && (
          <div className="space-y-5">
            <p className="script whitespace-pre-wrap text-ink">{reading.body}</p>
            <p className="text-xs text-ink-faint">
              {reading.author_id === userId ? 'You wrote this' : 'They wrote this'} · {when(reading.created_at)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => void togglePin(reading)}>
                {reading.is_pinned ? 'Unpin' : 'Pin to top'}
              </Button>
              {reading.author_id === userId && (
                <Button variant="danger" size="sm" onClick={() => void remove(reading)}>
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function NoteCard({
  note,
  mine,
  index,
  onOpen,
}: {
  note: LoveNote
  mine: boolean
  index: number
  onOpen: () => void
}) {
  const mood = MOODS.find((m) => m.value === note.mood)
  const unread = !mine && !note.read_at

  return (
    <button
      onClick={onOpen}
      className={cx(
        'animate-rise relative block w-full rounded-2xl border border-rose-700/40 bg-rose-900/30 p-5 text-left shadow-lg transition hover:border-pink-500/40',
        index >= 0 && '',
      )}
    >
      <span className="absolute top-4 right-4 flex items-center gap-1.5">
        {unread && <span className="size-2 animate-pulse rounded-full bg-pink-400" />}
        {note.is_pinned && (
          <span className="rounded-md border border-pink-500/30 bg-pink-500/20 px-2 py-0.5 text-xs font-medium text-pink-300">
            Pinned 📌
          </span>
        )}
      </span>

      <p className="mb-1 pr-24 text-xs text-rose-300">
        {mood?.emoji} {note.title ?? mood?.label} · {mine ? 'from you' : 'for you'}
      </p>
      <p className="line-clamp-4 text-sm leading-relaxed text-rose-100">“{note.body}”</p>
      <p className="mt-2 text-xs text-rose-400/70">{when(note.created_at)}</p>
    </button>
  )
}

function Composer({
  open,
  onClose,
  coupleId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  coupleId: string | null
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [mood, setMood] = useState<NoteMood>('sweet')
  const [pin, setPin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!body.trim() || !coupleId) return
    setBusy(true)
    setError('')
    const { error: insertError } = await supabase.from('love_notes').insert({
      couple_id: coupleId,
      author_id: (await supabase.auth.getUser()).data.user!.id,
      title: title.trim() || null,
      body: body.trim(),
      mood,
      is_pinned: pin,
    })
    setBusy(false)
    if (insertError) return setError(errorMessage(insertError))
    setTitle('')
    setBody('')
    setPin(false)
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Leave a note">
      <div className="space-y-4">
        <Field label="Title" hint="Optional — but a good one gets opened at the right moment.">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Read this when you're having a bad day"
            maxLength={80}
          />
        </Field>

        <Field label="The note">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Whatever you'd want them to hear in your voice…"
          />
        </Field>

        <Field label="What kind of note?">
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMood(m.value)}
                className={
                  mood === m.value
                    ? 'rounded-full bg-lav-400/15 px-3 py-1.5 text-xs text-lav-300 ring-1 ring-lav-400/30'
                    : 'rounded-full bg-raised/50 px-3 py-1.5 text-xs text-ink-muted hover:text-ink-soft'
                }
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex cursor-pointer items-center gap-3 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={pin}
            onChange={(e) => setPin(e.target.checked)}
            className="size-4 accent-[var(--color-lav-400)]"
          />
          Pin this to the top of the wall
        </label>

        {error && <ErrorNote>{error}</ErrorNote>}
        <Button className="w-full" loading={busy} disabled={!body.trim()} onClick={() => void save()}>
          Leave it
        </Button>
      </div>
    </Modal>
  )
}
