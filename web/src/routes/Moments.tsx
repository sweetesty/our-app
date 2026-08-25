import { useRef, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Modal } from '../components/ui'
import CameraCapture from '../components/CameraCapture'
import MomentStack from '../components/MomentStack'
import { uploadMedia } from '../lib/media'

/**
 * Moments — a photo sent straight to your person.
 *
 * This screen is now just the sending half; MomentStack owns viewing, which
 * keeps one swipe implementation shared with Today and Memories rather than a
 * feed here and a stack elsewhere.
 *
 * A moment is not a separate photo store either: memories() reads them
 * alongside everything else, so one photo flows moment → memory → album
 * without being copied.
 */
export default function Moments() {
  const { coupleId, userId, summary, refresh } = useSession()

  const [composing, setComposing] = useState(false)
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null)
  const [disappears, setDisappears] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // Uncontrolled: a controlled field re-rendered this screen on every letter,
  // which on iOS dropped focus and closed the keyboard after each character.
  const captionRef = useRef<HTMLInputElement>(null)

  const partnerName = summary?.partner?.display_name ?? 'them'

  function closeComposer() {
    if (pending) URL.revokeObjectURL(pending.preview)
    setPending(null)
    setComposing(false)
    setError('')
  }

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
        caption: captionRef.current?.value.trim() || null,
        expires_at: disappears
          ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          : null,
      })
      if (insertError) throw insertError

      URL.revokeObjectURL(pending.preview)
      setPending(null)
      if (captionRef.current) captionRef.current.value = ''
      setDisappears(false)
      setComposing(false)
      setReloadKey((k) => k + 1) // nudge the stack to refetch
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-white">📸 Moments</h3>
        <button
          onClick={() => setComposing(true)}
          className="rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:from-pink-500 hover:to-rose-500"
        >
          📷 Send a moment
        </button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <MomentStack key={reloadKey} />

      <Modal open={composing} onClose={closeComposer} title="Send a moment 📸">
        {!pending ? (
          <CameraCapture
            onCaptured={(file, preview) => setPending({ file, preview })}
            onCancel={closeComposer}
          />
        ) : (
          <div className="space-y-3">
            <img
              src={pending.preview}
              alt=""
              className="aspect-square w-full rounded-3xl object-cover"
            />

            <input
              ref={captionRef}
              defaultValue=""
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
