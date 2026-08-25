import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Loading, Modal } from '../components/ui'
import CameraCapture from '../components/CameraCapture'
import Reactions, { type ReactionRow } from '../components/Reactions'
import { signedUrls, uploadMedia } from '../lib/media'
import { ago } from '../lib/format'

type Moment = {
  id: string
  author_id: string
  storage_path: string
  media_type: string
  caption: string | null
  expires_at: string | null
  created_at: string
}

/**
 * Moments — a photo sent straight to your person.
 *
 * Not a separate photo store: every moment is read by memories() too, so one
 * photo flows moment → feed → memory → album without ever being copied.
 */
export default function Moments() {
  const { coupleId, userId, summary, refresh } = useSession()
  const [moments, setMoments] = useState<Moment[]>([])
  const [reactions, setReactions] = useState<Record<string, ReactionRow[]>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [composing, setComposing] = useState(false)
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null)
  const [caption, setCaption] = useState('')
  const [disappears, setDisappears] = useState(false)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const [{ data: rows, error: qErr }, { data: reacts }] = await Promise.all([
      supabase.from('moments').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('reactions').select('target_id, emoji, user_id').eq('target_kind', 'moment'),
    ])

    if (qErr) {
      setError(errorMessage(qErr))
      setLoading(false)
      return
    }

    const list = (rows as Moment[]) ?? []
    setMoments(list)

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

  // New moments arrive over the socket, so their phone lights up and yours
  // shows the photo without a refresh.
  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel(`moments:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moments', filter: `couple_id=eq.${coupleId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, load])

  async function send() {
    if (!pending || !coupleId || !userId) return
    setSending(true)
    setError('')

    try {
      const uploaded = await uploadMedia(coupleId, 'moments', pending.file)

      const { error: insertError } = await supabase.from('moments').insert({
        couple_id: coupleId,
        author_id: userId,
        storage_path: uploaded.path,
        media_type: 'photo',
        caption: caption.trim() || null,
        expires_at: disappears
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          : null,
      })
      if (insertError) throw insertError

      URL.revokeObjectURL(pending.preview)
      setPending(null)
      setCaption('')
      setDisappears(false)
      setComposing(false)
      await load()
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  async function remove(id: string) {
    await supabase.from('moments').delete().eq('id', id)
    await load()
  }

  if (loading) return <Loading label="Loading your moments…" />

  const partnerName = summary?.partner?.display_name ?? 'them'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">📸 Moments</h3>
        <button
          onClick={() => setComposing(true)}
          className="rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:from-pink-500 hover:to-rose-500"
        >
          📷 Send a moment
        </button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {moments.length === 0 ? (
        <button
          onClick={() => setComposing(true)}
          className="w-full rounded-3xl border border-dashed border-rose-700/40 bg-rose-900/20 p-10 text-center"
        >
          <p className="text-3xl">📷</p>
          <p className="mt-2 text-sm text-rose-200">Show {partnerName} where you are</p>
          <p className="mt-1 text-xs text-rose-400">
            A photo, straight to their phone. No feed, no likes, no one else.
          </p>
        </button>
      ) : (
        <div className="space-y-4">
          {moments.map((m) => {
            const mine = m.author_id === userId
            return (
              <article
                key={m.id}
                className="overflow-hidden rounded-3xl border border-rose-700/40 bg-rose-900/30"
              >
                {urls[m.storage_path] && (
                  <img
                    src={urls[m.storage_path]}
                    alt={m.caption ?? ''}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                )}

                <div className="space-y-2 p-4">
                  {m.caption && (
                    <p className="text-sm text-rose-100">{m.caption}</p>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-rose-400">
                      {mine ? 'You' : partnerName} · {ago(m.created_at)}
                      {m.expires_at && ' · disappears'}
                    </p>
                    {mine && (
                      <button
                        onClick={() => void remove(m.id)}
                        className="text-xs text-rose-500 hover:text-rose-300"
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  <Reactions
                    targetKind="moment"
                    targetId={m.id}
                    reactions={reactions[m.id] ?? []}
                    onChanged={load}
                  />
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal
        open={composing}
        onClose={() => {
          if (pending) URL.revokeObjectURL(pending.preview)
          setPending(null)
          setComposing(false)
        }}
        title="Send a moment 📸"
      >
        {!pending ? (
          <CameraCapture
            onCaptured={(file, preview) => setPending({ file, preview })}
            onCancel={() => setComposing(false)}
          />
        ) : (
          <div className="space-y-3">
            <img
              src={pending.preview}
              alt=""
              className="aspect-square w-full rounded-3xl object-cover"
            />

            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={120}
              placeholder="Say something… (optional)"
              className="w-full rounded-xl border border-rose-700/40 bg-rose-950/50 px-3 py-2.5 text-sm text-rose-100 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
            />

            <label className="flex cursor-pointer items-center gap-3 text-xs text-rose-300">
              <input
                type="checkbox"
                checked={disappears}
                onChange={(e) => setDisappears(e.target.checked)}
                className="size-4 accent-pink-500"
              />
              Disappear after 24 hours
            </label>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  URL.revokeObjectURL(pending.preview)
                  setPending(null)
                }}
                className="rounded-2xl bg-rose-900/60 px-4 py-3 text-sm font-semibold text-rose-200"
              >
                Retake
              </button>
              <button
                onClick={() => void send()}
                disabled={sending}
                className={cx(
                  'flex-1 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow transition',
                  sending && 'opacity-60',
                )}
              >
                {sending ? 'Sending…' : `Send to ${partnerName} 💌`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
