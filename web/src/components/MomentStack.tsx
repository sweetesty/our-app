import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { signedUrls } from '../lib/media'
import { ago } from '../lib/format'
import Reactions, { type ReactionRow, REACTION_SET } from './Reactions'
import { cx } from './ui'

type Moment = {
  id: string
  author_id: string
  storage_path: string
  caption: string | null
  expires_at: string | null
  created_at: string
}

/** "Disappears in 6h" — only worth saying while it's still true. */
function expiresIn(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return null
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `Disappears in ${hours}h`
  return `Disappears in ${Math.max(1, Math.floor(ms / 60_000))}m`
}

/**
 * A swipeable stack of recent moments — one card at a time, the next peeking
 * behind it.
 *
 * Written with pointer events rather than a gesture library: the whole
 * interaction is a drag, a threshold and a spring back, and pulling in a
 * dependency for that would cost more than it saves.
 */
export default function MomentStack() {
  const { userId, summary } = useSession()
  const [moments, setMoments] = useState<Moment[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [reactions, setReactions] = useState<Record<string, ReactionRow[]>>({})
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState<Moment | null>(null)

  // drag state
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)

  const load = useCallback(async () => {
    const [{ data: rows, error: qErr }, { data: reacts }] = await Promise.all([
      supabase.from('moments').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('reactions').select('target_id, emoji, user_id').eq('target_kind', 'moment'),
    ])

    // Table may not exist yet if 0017 has not run — stay silent rather than
    // breaking the whole home screen.
    if (qErr) {
      setLoading(false)
      return
    }

    const list = (rows as Moment[]) ?? []
    setMoments(list)
    setIndex((i) => Math.min(i, Math.max(0, list.length - 1)))

    const grouped: Record<string, ReactionRow[]> = {}
    for (const r of (reacts as { target_id: string; emoji: string; user_id: string }[]) ?? []) {
      ;(grouped[r.target_id] ??= []).push({ emoji: r.emoji, mine: r.user_id === userId })
    }
    setReactions(grouped)

    setUrls(await signedUrls(list.map((m) => m.storage_path)))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  function goto(next: number) {
    if (next < 0 || next >= moments.length) {
      setDx(0)
      return
    }
    setIndex(next)
    setDx(0)
  }

  function onPointerDown(e: React.PointerEvent) {
    setDragging(true)
    startX.current = e.clientX
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return
    setDx(e.clientX - startX.current)
  }

  function onPointerUp() {
    if (!dragging) return
    setDragging(false)

    // A quarter of the card is enough of a commitment to count as a swipe.
    const threshold = 90
    if (dx < -threshold) goto(index + 1)
    else if (dx > threshold) goto(index - 1)
    else setDx(0)
  }

  async function quickReact(momentId: string, emoji: string) {
    await supabase.rpc('toggle_reaction', {
      kind: 'moment',
      target: momentId,
      emoji_char: emoji,
    })
    await load()
  }

  if (loading || moments.length === 0) return null

  const current = moments[index]
  const next = moments[index + 1]
  const partnerName = summary?.partner?.display_name ?? 'They'
  const mine = current.author_id === userId
  const expiry = expiresIn(current.expires_at)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold tracking-wider text-rose-300 uppercase">
          📸 Moments
        </h3>
        <span className="text-xs text-rose-400">
          {index + 1} / {moments.length}
        </span>
      </div>

      <div className="relative" style={{ perspective: '1200px' }}>
        {/* the one behind, peeking */}
        {next && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 overflow-hidden rounded-3xl border border-rose-700/30 bg-rose-900/40"
            style={{
              transform: `scale(${0.94 + Math.min(Math.abs(dx), 120) / 2000}) translateY(${
                12 - Math.min(Math.abs(dx), 120) / 12
              }px)`,
            }}
          >
            {urls[next.storage_path] && (
              <img
                src={urls[next.storage_path]}
                alt=""
                className="aspect-square w-full object-cover opacity-50"
              />
            )}
          </div>
        )}

        {/* the live card */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cx(
            'relative touch-pan-y overflow-hidden rounded-3xl border border-pink-500/30 bg-rose-900/40 select-none',
            !dragging && 'transition-transform duration-300 ease-out',
          )}
          style={{
            transform: `translateX(${dx}px) rotate(${dx / 28}deg)`,
            cursor: dragging ? 'grabbing' : 'grab',
          }}
        >
          {urls[current.storage_path] ? (
            <img
              src={urls[current.storage_path]}
              alt={current.caption ?? ''}
              draggable={false}
              onClick={() => !dx && setFullscreen(current)}
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div className="grid aspect-square w-full place-items-center text-4xl">📸</div>
          )}

          <div className="space-y-2 p-4">
            {current.caption && (
              <p className="text-sm text-rose-100">{current.caption}</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-rose-400">
                {mine ? 'You' : partnerName} · {ago(current.created_at)}
              </p>
              {expiry && (
                <span className="rounded-full bg-pink-500/20 px-2 py-0.5 text-[10px] text-pink-200">
                  ⏳ {expiry}
                </span>
              )}
            </div>

            {/* one-tap reactions, then the full picker */}
            <div className="flex items-center gap-1.5">
              {REACTION_SET.slice(0, 3).map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => void quickReact(current.id, emoji)}
                  className="rounded-full bg-rose-950/60 px-2.5 py-1 text-base transition hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
              <div className="ml-auto">
                <Reactions
                  targetKind="moment"
                  targetId={current.id}
                  reactions={reactions[current.id] ?? []}
                  onChanged={load}
                  compact
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* dots */}
      {moments.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {moments.slice(0, 10).map((m, i) => (
            <button
              key={m.id}
              onClick={() => goto(i)}
              aria-label={`Moment ${i + 1}`}
              className={cx(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-5 bg-pink-400' : 'w-1.5 bg-rose-700',
              )}
            />
          ))}
        </div>
      )}

      {/* fullscreen */}
      {fullscreen && (
        <div
          onClick={() => setFullscreen(null)}
          className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4 backdrop-blur"
        >
          {urls[fullscreen.storage_path] && (
            <img
              src={urls[fullscreen.storage_path]}
              alt={fullscreen.caption ?? ''}
              className="max-h-[85dvh] w-auto rounded-2xl"
            />
          )}
          {fullscreen.caption && (
            <p className="mt-3 text-center text-sm text-rose-100">{fullscreen.caption}</p>
          )}
        </div>
      )}
    </div>
  )
}
