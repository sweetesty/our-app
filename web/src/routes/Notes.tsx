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
import Reactions, { type ReactionRow } from '../components/Reactions'
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
  const [noteReactions, setNoteReactions] = useState<Record<string, ReactionRow[]>>({})

  async function toggleFavourite(note: LoveNote) {
    const { data } = await supabase.rpc('toggle_note_favourite', { note: note.id })
    if (data) setReading(data as LoveNote)
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

    // Reactions live in one generic table; pull this screen's in a single go.
    const { data: reacts } = await supabase
      .from('reactions')
      .select('target_id, emoji, user_id')
      .eq('target_kind', 'note')

    const grouped: Record<string, ReactionRow[]> = {}
    for (const r of (reacts as { target_id: string; emoji: string; user_id: string }[]) ?? []) {
      ;(grouped[r.target_id] ??= []).push({ emoji: r.emoji, mine: r.user_id === userId })
    }
    setNoteReactions(grouped)

    setLoading(false)
  }, [userId])

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
    const { data, error: rpcError } = await supabase.rpc('toggle_note_pin', { note: note.id })
    if (rpcError) return setError(errorMessage(rpcError))

    // Update the open note too. Without this the button kept saying "Pin to
    // top" after pinning, so there was no sign it had worked.
    if (data) setReading(data as LoveNote)
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

      {/* Search, not a composer. It sat directly under "Leave a note" as a big
          empty box and people typed their note into it — so it now carries a
          magnifier, a clear button, and no resemblance to a writing field. */}
      <div className="relative mb-3">
        <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-rose-400">
          🔍
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes you've already written"
          className="w-full rounded-full border border-rose-700/40 bg-rose-950/60 py-2 pr-9 pl-9 text-sm text-rose-100 placeholder-rose-400/60 focus:border-pink-500 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute inset-y-0 right-2 grid w-7 place-items-center rounded-full text-rose-400 hover:text-rose-200"
          >
            ✕
          </button>
        )}
      </div>

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

      {visible.length === 0 && notes.length > 0 ? (
        /* Notes exist, they are just filtered out. Saying "blank wall" here
           told people their notes were gone. */
        <div className="rounded-3xl border border-rose-700/40 bg-rose-900/25 p-8 text-center">
          <p className="text-3xl">🔍</p>
          <p className="mt-2 text-sm text-white">
            No notes match {query ? `"${query.trim()}"` : 'those filters'}
          </p>
          <p className="mt-1 text-xs text-rose-400">
            You have {notes.length} note{notes.length === 1 ? '' : 's'} — they're just
            hidden right now.
          </p>
          <button
            onClick={() => {
              setQuery('')
              setFilter('all')
              setMoodFilter('all')
            }}
            className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold transition hover:bg-rose-600"
          >
            Show everything
          </button>
        </div>
      ) : visible.length === 0 ? (
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
            <p className="text-xs text-rose-400">
              {reading.author_id === userId ? 'You wrote this' : 'They wrote this'} ·{' '}
              {when(reading.created_at)}
            </p>

            <Reactions
              targetKind="note"
              targetId={reading.id}
              reactions={noteReactions[reading.id] ?? []}
              onChanged={load}
            />

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
      <p className="mt-2 flex items-center gap-2 text-xs text-rose-400/70">
        <span>{when(note.created_at)}</span>
        {/* An unpinned note has a clock on it, so say so before it goes. */}
        {note.expires_at && (
          <span className="rounded-full bg-rose-950/60 px-2 py-0.5 text-[10px] text-rose-300">
            ⏳ {hoursLeft(note.expires_at)}
          </span>
        )}
      </p>
    </button>
  )
}

/** "gone in 6h" — the wait, phrased plainly. */
function hoursLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'gone'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `gone in ${hours}h`
  return `gone in ${Math.max(1, Math.floor(ms / 60_000))}m`
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
  const [showKinds, setShowKinds] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Start clean every time it opens. Fields were only cleared after a
  // successful save, so closing and reopening showed the last thing typed —
  // which read as the form being stuck.
  useEffect(() => {
    if (!open) return
    setTitle('')
    setBody('')
    setMood(MOODS[0].value)
    setPin(false)
    setPhoto(null)
    setShowKinds(false)
    setError('')
  }, [open])

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

        {/* A title already says when to open the note, which is the category's
            only job — so once one is written, nine chips are just noise. It
            collapses to a single line you can reopen if you want one. */}
        {title.trim() && !showKinds ? (
          <button
            onClick={() => setShowKinds(true)}
            className="flex w-full items-center justify-between rounded-xl border border-rose-700/30 bg-rose-900/25 px-4 py-2.5 text-left"
          >
            <span className="text-xs text-rose-300">
              Category: <span className="text-rose-100">{MOODS.find((m) => m.value === mood)?.label}</span>
            </span>
            <span className="text-xs text-rose-400">Change</span>
          </button>
        ) : (
          <Field
            label="What kind of note?"
            hint={title.trim() ? undefined : 'So they know when to open it.'}
          >
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => {
                    setMood(m.value)
                    if (title.trim()) setShowKinds(false)
                  }}
                  className={
                    mood === m.value
                      ? 'rounded-full bg-pink-500/20 px-3 py-1.5 text-xs text-pink-200 ring-1 ring-pink-500/40'
                      : 'rounded-full bg-rose-900/50 px-3 py-1.5 text-xs text-rose-300 hover:text-rose-100'
                  }
                >
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
          </Field>
        )}

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
          Keep this one — pin it to the wall
        </label>

        <p className="text-xs leading-relaxed text-rose-400">
          {pin
            ? 'Pinned notes stay until you unpin them.'
            : 'Unpinned notes clear after 24 hours. Pin it any time before then to keep it.'}
        </p>

        {error && <ErrorNote>{error}</ErrorNote>}
        <Button className="w-full" loading={busy} disabled={!body.trim()} onClick={() => void save()}>
          Leave it
        </Button>
      </div>
    </Modal>
  )
}
