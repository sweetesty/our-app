import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Loading, Modal } from '../components/ui'
import { signedUrls } from '../lib/media'
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
type AlbumItem = { album_id: string; memory_id: string }

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
  const { coupleId } = useSession()
  const [memories, setMemories] = useState<Memory[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [items, setItems] = useState<AlbumItem[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<string>('all')
  const [album, setAlbum] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState<Memory | null>(null)

  const load = useCallback(async () => {
    const [{ data: mem, error: memErr }, { data: alb }, { data: it }] = await Promise.all([
      supabase.rpc('memories', { kinds: null, limit_count: 300 }),
      supabase.from('albums').select('id, name, icon').order('created_at'),
      supabase.from('album_items').select('album_id, memory_id'),
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
    return memories.filter((m) => {
      if (filter !== 'all' && m.kind !== filter) return false
      if (album !== 'all') {
        return items.some((i) => i.album_id === album && i.memory_id === m.id)
      }
      return true
    })
  }, [memories, items, filter, album])

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

  if (loading) return <Loading label="Gathering everything…" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">🖼️ Memories</h3>
        <button
          onClick={() => void newAlbum()}
          className="rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold shadow transition hover:bg-rose-600"
        >
          + Album
        </button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

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
            You have {memories.length} memor{memories.length === 1 ? 'y' : 'ies'} —
            {album !== 'all' && ' that album is empty'}
            {album !== 'all' && filter !== 'all' && ', and'}
            {filter !== 'all' && ` no ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} yet`}.
          </p>
          <button
            onClick={() => {
              setFilter('all')
              setAlbum('all')
            }}
            className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold transition hover:bg-rose-600"
          >
            Show everything
          </button>
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visible.map((m) => (
            <button
              key={`${m.source}-${m.id}`}
              onClick={() => setViewing(m)}
              className="group relative aspect-square overflow-hidden rounded-2xl border border-rose-700/40 bg-rose-900/40 text-left"
            >
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
          ))}
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
