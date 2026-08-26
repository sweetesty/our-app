import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { signedUrls, uploadMedia } from '../lib/media'
import { celebrateReveal } from '../lib/celebrate'
import CameraCapture from './CameraCapture'
import { cx, ErrorNote, Modal } from './ui'

type Photo = {
  id: string
  author_id: string
  storage_path: string
  caption: string | null
  created_at: string
}

type State = {
  paired: boolean
  mine: Photo | null
  partner_posted: boolean
  partner_photo: Photo | null
  revealed: boolean
}

/**
 * Both post, both unlock.
 *
 * The same bargain as the daily question, in pictures. Their photo is withheld
 * by RLS as well as by this screen, so there is no version of the app — or the
 * network tab — where you can peek without posting.
 *
 * Lives on Today rather than in its own tab: it is a daily ritual, and it
 * belongs beside the other one.
 */
export default function DailyReveal() {
  const { coupleId, summary, refresh } = useSession()
  const [state, setState] = useState<State | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [composing, setComposing] = useState(false)
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [fullscreen, setFullscreen] = useState<string | null>(null)

  const partnerName = summary?.partner?.display_name ?? 'them'

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('today_photos')
    // Silent if the migration has not run — this sits on the busiest screen in
    // the app and must not take it down with it.
    if (rpcError) return

    const next = data as State
    setState(next)

    const paths = [next.mine?.storage_path, next.partner_photo?.storage_path].filter(
      Boolean,
    ) as string[]
    if (paths.length > 0) setUrls(await signedUrls(paths))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Their half can land while you are looking at the screen.
  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel(`daily-photos:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_photos' },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, load])

  function close() {
    if (pending) URL.revokeObjectURL(pending.preview)
    setPending(null)
    setComposing(false)
    setError('')
  }

  async function post() {
    if (!pending || !coupleId) return
    setSending(true)
    setError('')

    try {
      const uploaded = await uploadMedia(coupleId, 'daily', pending.file)
      const { error: rpcError } = await supabase.rpc('post_daily_photo', {
        path: uploaded.path,
        photo_caption: null,
      })
      if (rpcError) throw rpcError

      URL.revokeObjectURL(pending.preview)
      setPending(null)
      setComposing(false)

      // If they were already waiting, posting is the moment it opens.
      if (state?.partner_posted) celebrateReveal()
      await load()
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (!state?.paired) return null

  const mine = state.mine
  const theirs = state.partner_photo

  return (
    <section className="rounded-3xl border border-rose-700/40 bg-rose-950/40 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wider text-rose-300 uppercase">
          📷 Today, both of you
        </h3>
        {state.revealed && <span className="text-xs text-rose-400">Both in ✓</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* yours */}
        <Frame
          label="You"
          url={mine ? urls[mine.storage_path] : undefined}
          onOpen={() => mine && setFullscreen(urls[mine.storage_path])}
          empty={
            <button
              onClick={() => setComposing(true)}
              className="grid h-full w-full place-items-center gap-1 text-rose-300"
            >
              <span className="text-2xl">📷</span>
              <span className="text-[0.65rem]">Post your day</span>
            </button>
          }
        />

        {/* theirs */}
        <Frame
          label={partnerName}
          url={theirs ? urls[theirs.storage_path] : undefined}
          onOpen={() => theirs && setFullscreen(urls[theirs.storage_path])}
          empty={
            <div className="grid h-full w-full place-items-center gap-1 px-3 text-center text-rose-400">
              {/* Three genuinely different states, and saying which is the
                  whole point — an empty frame with no explanation reads as
                  broken rather than as waiting. */}
              {!state.partner_posted ? (
                <>
                  <span className="text-2xl opacity-50">🌙</span>
                  <span className="text-[0.65rem]">Nothing yet</span>
                </>
              ) : !mine ? (
                <>
                  <span className="text-2xl">🔒</span>
                  <span className="text-[0.65rem] leading-relaxed">
                    Posted. Post yours to see it.
                  </span>
                </>
              ) : null}
            </div>
          }
        />
      </div>

      {mine && (
        <button
          onClick={() => setComposing(true)}
          className="mt-3 w-full text-center text-[0.65rem] text-rose-400 transition-colors hover:text-rose-200"
        >
          Change yours
        </button>
      )}

      {error && !composing && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <Modal open={composing} onClose={close} title="Your day 📷">
        {!pending ? (
          <CameraCapture
            onCaptured={(file, preview) => setPending({ file, preview })}
            onCancel={close}
          />
        ) : (
          <div className="space-y-3">
            <img
              src={pending.preview}
              alt=""
              className="aspect-square w-full rounded-3xl object-cover"
            />
            {error && <ErrorNote>{error}</ErrorNote>}
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
                onClick={() => void post()}
                disabled={sending}
                className={cx(
                  'flex-1 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow transition',
                  sending && 'opacity-60',
                )}
              >
                {sending ? 'Posting…' : state.partner_posted ? 'Post and unlock 🔓' : 'Post 📷'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {fullscreen && (
        <div
          onClick={() => setFullscreen(null)}
          className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4 backdrop-blur"
        >
          <img src={fullscreen} alt="" className="max-h-[85dvh] w-auto rounded-2xl" />
        </div>
      )}
    </section>
  )
}

function Frame({
  label,
  url,
  onOpen,
  empty,
}: {
  label: string
  url?: string
  onOpen: () => void
  empty: React.ReactNode
}) {
  return (
    <div>
      <div className="relative w-full overflow-hidden rounded-2xl border border-rose-800/50 bg-rose-900/30 pt-[100%]">
        <div className="absolute inset-0">
          {url ? (
            <img
              src={url}
              alt=""
              onClick={onOpen}
              className="h-full w-full cursor-pointer object-cover"
            />
          ) : (
            empty
          )}
        </div>
      </div>
      <p className="mt-1.5 truncate text-center text-[0.65rem] text-rose-400">{label}</p>
    </div>
  )
}
