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
import { signedUrls, uploadMedia } from '../lib/media'
import { MOODS, type LoveNote, type NoteMood } from '../lib/types'

export default function Notes() {
  const { userId, coupleId, refresh } = useSession()
  const [notes, setNotes] = useState<LoveNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [reading, setReading] = useState<LoveNote | null>(null)
  const [filter, setFilter] = useState<'all' | 'mine' | 'theirs' | 'favourites'>('all')
  const [moodFilter, setMoodFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  async function toggleFavourite(note: LoveNote) {
    await supabase.rpc('toggle_note_favourite', { note: note.id })
    await load()
  }

  const load = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('love_notes')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (qErr) {
      setError(errorMessage(qErr))
      setLoading(false)
      return
    }

    const rows = (data as LoveNote[]) ?? []
    setNotes(rows)

    // One batched signing call for every photo rather than one per note.
    const paths = rows.map((n) => n.photo_path).filter((p): p is string => Boolean(p))
    if (paths.length > 0) setPhotoUrls(await signedUrls(paths))

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

  const needle = query.trim().toLowerCase()

  const visible = notes.filter((n) => {
    // who wrote it
    if (filter === 'mine' && n.author_id !== userId) return false
    if (filter === 'theirs' && n.author_id === userId) return false
    if (filter === 'favourites' && !n.is_favourite) return false

    // category
    if (moodFilter !== 'all' && n.mood !== moodFilter) return false

    // free text — few enough notes that filtering here beats a round trip,
    // and it stays instant as you type
    if (needle) {
      const hay = `${n.title ?? ''} ${n.body} ${
        MOODS.find((m) => m.value === n.mood)?.label ?? ''
      }`.toLowerCase()
      if (!hay.includes(needle)) return false
    }

    return true
  })
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

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your notes…"
        className="mb-3 w-full rounded-2xl border border-rose-700/40 bg-rose-950/50 px-4 py-2.5 text-sm text-rose-100 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
      />

      <div className="scrollbar-none mb-2 flex gap-2 overflow-x-auto pb-1">
        {(['all', 'favourites', 'mine', 'theirs'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
              filter === f
                ? 'bg-rose-600 text-white'
                : 'border border-rose-700/40 bg-rose-900/40 text-rose-300 hover:bg-rose-900',
            )}
          >
            {f === 'all'
              ? 'Everything'
              : f === 'favourites'
                ? '⭐ Favourites'
                : f === 'mine'
                  ? 'From me'
                  : 'From them'}
          </button>
        ))}
      </div>

      {/* Category row — the point of the whole feature is finding "read when
          you're sad" at the moment you're sad. */}
      <div className="scrollbar-none mb-5 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setMoodFilter('all')}
          className={cx(
            'shrink-0 rounded-full px-3 py-1 text-xs transition',
            moodFilter === 'all'
              ? 'bg-pink-600 text-white'
              : 'border border-rose-700/30 bg-rose-900/30 text-rose-400',
          )}
        >
          All kinds
        </button>
        {MOODS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMoodFilter(m.value)}
            className={cx(
              'shrink-0 rounded-full px-3 py-1 text-xs whitespace-nowrap transition',
              moodFilter === m.value
                ? 'bg-pink-600 text-white'
                : 'border border-rose-700/30 bg-rose-900/30 text-rose-400 hover:text-rose-200',
            )}
          >
            {m.emoji} {m.label}
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
                    photoUrl={n.photo_path ? photoUrls[n.photo_path] : undefined}
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
                    photoUrl={n.photo_path ? photoUrls[n.photo_path] : undefined}
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
            {reading.photo_path && photoUrls[reading.photo_path] && (
              <img
                src={photoUrls[reading.photo_path]}
                alt=""
                className="w-full rounded-2xl border border-rose-800/50"
              />
            )}
            <p className="whitespace-pre-wrap text-rose-100 italic">{reading.body}</p>
            <p className="text-xs text-ink-faint">
              {reading.author_id === userId ? 'You wrote this' : 'They wrote this'} · {when(reading.created_at)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => void toggleFavourite(reading)}>
                {reading.is_favourite ? '⭐ Favourited' : '☆ Favourite'}
              </Button>
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
  photoUrl,
  onOpen,
}: {
  note: LoveNote
  mine: boolean
  index: number
  photoUrl?: string
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
        {note.is_favourite && <span className="text-xs">⭐</span>}
        {note.is_pinned && (
          <span className="rounded-md border border-pink-500/30 bg-pink-500/20 px-2 py-0.5 text-xs font-medium text-pink-300">
            Pinned 📌
          </span>
        )}
      </span>

      <p className="mb-1 pr-24 text-xs text-rose-300">
        {mood?.emoji} {note.title ?? mood?.label} · {mine ? 'from you' : 'for you'}
      </p>

      {photoUrl && (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          className="mb-2 max-h-40 w-full rounded-xl object-cover"
        />
      )}

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
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!body.trim() || !coupleId) return
    setBusy(true)
    setError('')

    try {
      let photoPath: string | null = null
      if (photo) {
        const uploaded = await uploadMedia(coupleId, 'notes', photo)
        photoPath = uploaded.path
      }

      const { error: insertError } = await supabase.from('love_notes').insert({
        couple_id: coupleId,
        author_id: (await supabase.auth.getUser()).data.user!.id,
        title: title.trim() || null,
        body: body.trim(),
        mood,
        is_pinned: pin,
        photo_path: photoPath,
      })
      if (insertError) throw insertError

      setTitle('')
      setBody('')
      setPin(false)
      setPhoto(null)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
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

        <Field label="Add a photo" hint="Optional — one picture, tucked inside the note.">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-rose-300 file:mr-3 file:rounded-full file:border-0 file:bg-rose-800 file:px-4 file:py-2 file:text-sm file:text-rose-100 hover:file:bg-rose-700"
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-3 text-sm text-rose-300">
          <input
            type="checkbox"
            checked={pin}
            onChange={(e) => setPin(e.target.checked)}
            className="size-4 accent-pink-500"
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
