import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Loading, Modal } from '../components/ui'
import { signedUrls, uploadMedia } from '../lib/media'
import ReorderableGrid from '../components/ReorderableGrid'
import MomentStack from '../components/MomentStack'
import { when } from '../lib/format'

type Memory = {
  id: string
  kind: 'photo' | 'video' | 'voice' | 'note' | 'card'
  title: string | null
  body: string | null
  media_path: string | null
  source: string
  source_id: string
  created_at: string
}

type Album = { id: string; name: string; icon: string }
type AlbumItem = { album_id: string; memory_id: string; sort_order?: number }

const FILTERS = [
  { key: 'all', label: 'Everything', icon: '🖼️' },
  { key: 'photo', label: 'Photos', icon: '📷' },
  { key: 'video', label: 'Videos', icon: '🎬' },
  { key: 'note', label: 'Love Notes', icon: '💌' },
  { key: 'voice', label: 'Voice Notes', icon: '🎙️' },
  { key: 'card', label: 'Cards', icon: '🃏' },
] as const

/**
 * Everything you've shared, read across four tables rather than copied into a
 * fifth — so nothing drifts out of sync, and deleting a timeline moment removes
 * its photos from here for free.
 */
export default function Memories() {
  const { coupleId, userId } = useSession()
  const [memories, setMemories] = useState<Memory[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [items, setItems] = useState<AlbumItem[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<string>('all')
  const [album, setAlbum] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<Memory | null>(null)
  const [uploading, setUploading] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [manualOrder, setManualOrder] = useState<string[]>([])
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /**
   * File everything selected into an album at once.
   *
   * Filing was possible one photo at a time, three taps deep in the detail
   * view — which nobody would do for twenty holiday photos, so everything
   * stayed in "All memories" and the albums sat empty.
   */
  async function fileSelected(albumId: string) {
    if (selected.size === 0) return
    setError('')

    const rows = [...selected].map((memoryId) => ({
      album_id: albumId,
      memory_id: memoryId,
      memory_kind: memories.find((m) => m.id === memoryId)?.kind ?? 'photo',
    }))

    // Re-filing something already in the album should be harmless, not an error.
    const { error: insertError } = await supabase
      .from('album_items')
      .upsert(rows, { onConflict: 'album_id,memory_id', ignoreDuplicates: true })

    if (insertError) {
      setError(errorMessage(insertError))
      return
    }

    setSelected(new Set())
    setSelecting(false)
    await load()
  }

  /**
   * Photos keep their album order; "Everything" stays newest-first.
   *
   * An album reads in the order it happened — a trip, a birthday — and the
   * picture you want first is rarely the last one uploaded. The full gallery
   * has no such story, so chronology is the right default there.
   */
  async function saveOrder(next: Memory[]) {
    setManualOrder(next.map((m) => m.id))

    if (album === 'all') return // nothing to persist; everything is by date

    const { error: rpcError } = await supabase.rpc('reorder_album_items', {
      album,
      memory_ids: next.map((m) => m.id),
    })

    if (rpcError) setError(errorMessage(rpcError))
    else await load()
  }

  const load = useCallback(async () => {
    const [{ data: mem, error: memErr }, { data: alb }, { data: it }] = await Promise.all([
      supabase.rpc('memories', { kinds: null, limit_count: 300 }),
      supabase.from('albums').select('id, name, icon').order('created_at'),
      supabase.from('album_items').select('album_id, memory_id, sort_order'),
    ])

    if (memErr) {
      setError(errorMessage(memErr))
      setLoading(false)
      return
    }

    const rows = (mem as Memory[]) ?? []
    setMemories(rows)
    setAlbums((alb as Album[]) ?? [])
    setItems((it as AlbumItem[]) ?? [])

    const paths = rows.map((m) => m.media_path).filter((p): p is string => Boolean(p))
    if (paths.length > 0) setUrls(await signedUrls(paths))

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const list = memories.filter((m) => {
      if (filter !== 'all' && m.kind !== filter) return false
      if (album !== 'all') {
        return items.some((i) => i.album_id === album && i.memory_id === m.id)
      }
      return true
    })

    // Inside an album, respect the saved order. Outside it, newest first.
    if (album === 'all') return list

    const rank = new Map(
      items
        .filter((i) => i.album_id === album)
        .map((i) => [i.memory_id, i.sort_order ?? 100]),
    )

    return [...list].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999))
  }, [memories, items, filter, album, manualOrder])

  async function toggleInAlbum(memory: Memory, albumId: string) {
    const already = items.some((i) => i.album_id === albumId && i.memory_id === memory.id)

    if (already) {
      await supabase
        .from('album_items')
        .delete()
        .eq('album_id', albumId)
        .eq('memory_id', memory.id)
    } else {
      await supabase
        .from('album_items')
        .insert({ album_id: albumId, memory_id: memory.id, memory_kind: memory.kind })
    }
    await load()
  }

  async function newAlbum() {
    const name = window.prompt('Album name')
    if (!name?.trim() || !coupleId) return
    await supabase.from('albums').insert({ couple_id: coupleId, name: name.trim(), icon: '📁' })
    await load()
  }

  /**
   * Add photos straight from the gallery.
   *
   * Memories was read-only — it only gathered what other screens made, so a
   * photo of a day out had nowhere to go and an album you created could never
   * be filled. Uploads become moments, which keeps the one-photo-one-flow rule
   * rather than adding a second photo store, and they drop into whichever
   * album is open.
   */
  async function addPhotos(files: FileList | null) {
    if (!files?.length || !coupleId || !userId) return

    setUploading(true)
    setError('')

    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadMedia(coupleId, 'moments', file)

        const { data: created, error: insertError } = await supabase
          .from('moments')
          .insert({
            couple_id: coupleId,
            author_id: userId,
            storage_path: uploaded.path,
            media_type: uploaded.mediaType === 'video' ? 'video' : 'photo',
          })
          .select('id')
          .single()

        if (insertError) throw insertError

        if (album !== 'all' && created) {
          await supabase.from('album_items').insert({
            album_id: album,
            memory_id: created.id,
            memory_kind: 'photo',
          })
        }
      }

      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  if (loading) return <Loading label="Gathering everything…" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-white">🖼️ Memories</h3>
        {/* Wraps rather than pushing buttons off a narrow screen — "+ Photos"
            was disappearing on a phone. */}
        <div className="flex flex-wrap gap-2">
          <label
            className={cx(
              'cursor-pointer rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:from-pink-500 hover:to-rose-500',
              uploading && 'pointer-events-none opacity-60',
            )}
          >
            {uploading ? 'Adding…' : '+ Photos'}
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addPhotos(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
          {visible.length > 0 && (
            <button
              onClick={() => {
                setSelecting((v) => !v)
                setSelected(new Set())
                setReordering(false)
              }}
              className={cx(
                'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                selecting
                  ? 'bg-pink-600 text-white'
                  : 'border border-rose-700/40 bg-rose-900/40 text-rose-200 hover:bg-rose-900',
              )}
            >
              {selecting ? 'Cancel' : '☑ Select'}
            </button>
          )}
          {album !== 'all' && visible.length > 1 && !selecting && (
            <button
              onClick={() => setReordering((v) => !v)}
              className={cx(
                'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                reordering
                  ? 'bg-pink-600 text-white'
                  : 'border border-rose-700/40 bg-rose-900/40 text-rose-200 hover:bg-rose-900',
              )}
            >
              {reordering ? 'Done' : '↕ Arrange'}
            </button>
          )}
          <button
            onClick={() => void newAlbum()}
            className="rounded-xl border border-rose-700/40 bg-rose-900/40 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-900"
          >
            + Album
          </button>
        </div>
      </div>

      {album !== 'all' && (
        <div className="rounded-2xl border border-pink-500/25 bg-pink-500/10 p-3">
          <p className="text-xs text-pink-200">
            You're in{' '}
            <span className="font-semibold">
              {albums.find((a) => a.id === album)?.name}
            </span>
            . Anything you add lands here.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow">
              {uploading ? 'Adding…' : '+ Add photos here'}
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addPhotos(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
            <button
              onClick={() => {
                setAlbum('all')
                setSelecting(true)
              }}
              className="rounded-xl border border-rose-700/40 bg-rose-900/40 px-3 py-1.5 text-xs font-semibold text-rose-200"
            >
              Pick from existing
            </button>
          </div>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* The swipe stack belongs here too — the grid is for finding something,
          the stack is for actually looking at them. */}
      <MomentStack />

      {/* type */}
      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              'shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              filter === f.key
                ? 'bg-rose-600 text-white'
                : 'border border-rose-700/40 bg-rose-900/50 text-rose-300 hover:bg-rose-900',
            )}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {/* album */}
      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setAlbum('all')}
          className={cx(
            'shrink-0 rounded-full px-3 py-1 text-xs transition',
            album === 'all'
              ? 'bg-pink-600 text-white'
              : 'border border-rose-700/30 bg-rose-900/30 text-rose-400',
          )}
        >
          All memories
        </button>
        {albums.map((a) => (
          <button
            key={a.id}
            onClick={() => setAlbum(a.id)}
            className={cx(
              'shrink-0 rounded-full px-3 py-1 text-xs whitespace-nowrap transition',
              album === a.id
                ? 'bg-pink-600 text-white'
                : 'border border-rose-700/30 bg-rose-900/30 text-rose-400 hover:text-rose-200',
            )}
          >
            {a.icon} {a.name}
          </button>
        ))}
      </div>

      {visible.length === 0 && memories.length > 0 ? (
        /* Things exist, the filters are just hiding them. Saying "nothing here"
           made an active album or type look like an empty gallery. */
        <div className="rounded-2xl border border-rose-700/40 bg-rose-900/25 p-8 text-center">
          <p className="text-3xl">🔍</p>
          <p className="mt-2 text-sm text-white">Nothing matches those filters</p>
          <p className="mt-1 text-xs text-rose-400">
            {album !== 'all'
              ? `This album is empty — you have ${memories.length} memor${
                  memories.length === 1 ? 'y' : 'ies'
                } to choose from.`
              : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} yet.`}
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {album !== 'all' && (
              <button
                onClick={() => {
                  setAlbum('all')
                  setSelecting(true)
                }}
                className="rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2 text-xs font-semibold text-white shadow"
              >
                Pick memories to add
              </button>
            )}
            <button
              onClick={() => {
                setFilter('all')
                setAlbum('all')
              }}
              className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold transition hover:bg-rose-600"
            >
              Show everything
            </button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/20 p-8 text-center">
          <p className="text-3xl">🖼️</p>
          <p className="mt-2 text-sm text-rose-200">Nothing here yet</p>
          <p className="mt-1 text-xs leading-relaxed text-rose-400">
            This fills itself. Write a note, add a timeline moment, answer a card
            or send a photo — it all lands here on its own.
          </p>
        </div>
      ) : (
        <ReorderableGrid
          items={visible}
          active={reordering}
          getKey={(m) => `${m.source}-${m.id}`}
          onReorder={(next) => void saveOrder(next)}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          renderItem={(m) => (
            <button
              onClick={() => {
                if (reordering) return
                if (selecting) toggleSelected(m.id)
                else setViewing(m)
              }}
              className={cx(
                'group relative aspect-square w-full overflow-hidden rounded-2xl border bg-rose-900/40 text-left transition',
                selected.has(m.id)
                  ? 'border-pink-400 ring-2 ring-pink-400'
                  : 'border-rose-700/40',
              )}
            >
              {selecting && (
                <span
                  className={cx(
                    'absolute top-2 right-2 z-10 grid size-6 place-items-center rounded-full border-2 text-xs font-bold',
                    selected.has(m.id)
                      ? 'border-pink-400 bg-pink-500 text-white'
                      : 'border-white/70 bg-black/40 text-transparent',
                  )}
                >
                  ✓
                </span>
              )}
              {m.media_path && urls[m.media_path] && m.kind === 'photo' ? (
                <img
                  src={urls[m.media_path]}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full flex-col justify-between p-3">
                  <span className="text-xl">
                    {m.kind === 'video' ? '🎬' : m.kind === 'voice' ? '🎙️' : m.kind === 'card' ? '🃏' : '💌'}
                  </span>
                  <span className="line-clamp-3 text-[11px] leading-snug text-rose-200">
                    {m.body ?? m.title}
                  </span>
                </div>
              )}

              <span className="absolute right-1.5 bottom-1.5 rounded-md bg-rose-950/80 px-1.5 py-0.5 text-[10px] text-rose-300">
                {m.source}
              </span>
            </button>
          )}
        />
      )}

      {/* Sticky picker while selecting — pick photos, then tap an album. */}
      {selecting && selected.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 border-t border-rose-700/50 bg-rose-950/95 p-4 backdrop-blur"
          style={{ paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
        >
          <p className="mb-2 text-xs font-semibold text-white">
            Put {selected.size} {selected.size === 1 ? 'memory' : 'memories'} into…
          </p>
          <div className="scrollbar-none flex gap-2 overflow-x-auto">
            {albums.map((a) => (
              <button
                key={a.id}
                onClick={() => void fileSelected(a.id)}
                className="shrink-0 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-white shadow"
              >
                {a.icon} {a.name}
              </button>
            ))}
            <button
              onClick={() => void newAlbum()}
              className="shrink-0 rounded-xl border border-rose-700/50 px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-rose-300"
            >
              + New album
            </button>
          </div>
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title ?? 'Memory'}>
        {viewing && (
          <div className="space-y-4">
            {viewing.media_path && urls[viewing.media_path] && (
              <>
                {viewing.kind === 'photo' && (
                  <img src={urls[viewing.media_path]} alt="" className="w-full rounded-2xl" />
                )}
                {viewing.kind === 'video' && (
                  <video src={urls[viewing.media_path]} controls className="w-full rounded-2xl" />
                )}
                {viewing.kind === 'voice' && (
                  <audio src={urls[viewing.media_path]} controls className="w-full" />
                )}
              </>
            )}

            {viewing.body && (
              <p className="text-sm whitespace-pre-wrap text-rose-100">{viewing.body}</p>
            )}

            <p className="text-xs text-rose-400">
              From {viewing.source} · {when(viewing.created_at)}
            </p>

            <div>
              <p className="mb-2 text-xs font-semibold text-rose-300">Add to an album</p>
              <div className="flex flex-wrap gap-2">
                {albums.map((a) => {
                  const inIt = items.some(
                    (i) => i.album_id === a.id && i.memory_id === viewing.id,
                  )
                  return (
                    <button
                      key={a.id}
                      onClick={() => void toggleInAlbum(viewing, a.id)}
                      className={cx(
                        'rounded-xl px-3 py-1.5 text-xs transition',
                        inIt
                          ? 'bg-pink-600 text-white'
                          : 'border border-rose-700/40 bg-rose-900/50 text-rose-300',
                      )}
                    >
                      {inIt ? '✓ ' : ''}
                      {a.icon} {a.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
