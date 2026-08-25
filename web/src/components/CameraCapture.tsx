import { useCallback, useEffect, useRef, useState } from 'react'
import { cx } from './ui'

/**
 * In-app camera for Moments.
 *
 * A plain <input capture> would hand off to the system camera app and lose the
 * flow — you want to open, shoot and send without leaving. This uses
 * getUserMedia so the preview lives inside the app, with a front/back toggle.
 *
 * Falls back to a file input where getUserMedia isn't available or is refused,
 * so the feature degrades to "pick a photo" rather than disappearing.
 */
export default function CameraCapture({
  onCaptured,
  onCancel,
}: {
  onCaptured: (file: File, previewUrl: string) => void
  onCancel: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [useNativeCamera, setUseNativeCamera] = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const start = useCallback(
    async (mode: 'user' | 'environment') => {
      stop()
      setReady(false)
      setError('')

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1440 }, height: { ideal: 1440 } },
          audio: false,
        })
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setReady(true)
      } catch (err) {
        // iOS refuses getUserMedia inside a home-screen PWA on many versions,
        // usually without even prompting. Rather than dead-end, fall back to
        // the native camera via an input, which works everywhere.
        const name = err instanceof Error ? err.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was refused.'
            : "This browser won't open the camera in-app.",
        )
        setUseNativeCamera(true)
      }
    },
    [stop],
  )

  useEffect(() => {
    void start(facing)
    return stop
  }, [facing, start, stop])

  function capture() {
    const video = videoRef.current
    if (!video) return

    // Square crop from the centre, the way Locket-style photos read best.
    const size = Math.min(video.videoWidth, video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (facing === 'user') {
      // Un-mirror: the preview is flipped so it feels like a mirror, but the
      // saved photo should read the right way round.
      ctx.translate(size, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(
      video,
      (video.videoWidth - size) / 2,
      (video.videoHeight - size) / 2,
      size,
      size,
      0,
      0,
      size,
      size,
    )

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `moment-${Date.now()}.jpg`, { type: 'image/jpeg' })
        stop()
        onCaptured(file, URL.createObjectURL(blob))
      },
      'image/jpeg',
      // 0.85 keeps a 1440px square around 200-400KB — good on a phone plan.
      0.85,
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-rose-700/50 bg-rose-950">
        <video
          ref={videoRef}
          playsInline
          muted
          className={cx(
            'h-full w-full object-cover',
            facing === 'user' && 'scale-x-[-1]',
          )}
        />

        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-rose-300">
            Opening camera…
          </div>
        )}

        {error && (
          <div className="absolute inset-0 grid place-items-center bg-rose-950/80 p-6 text-center">
            <div>
              <p className="text-3xl">📷</p>
              <p className="mt-2 text-xs text-rose-300">{error}</p>
              <p className="mt-1 text-[11px] text-rose-400">
                Use your phone's camera instead — it works the same.
              </p>
            </div>
          </div>
        )}

        {ready && !useNativeCamera && (
          <button
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            aria-label="Switch camera"
            className="absolute top-3 right-3 rounded-full bg-rose-950/70 p-2.5 text-lg backdrop-blur"
          >
            🔄
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => {
            stop()
            onCancel()
          }}
          className="rounded-xl px-4 py-2 text-xs font-medium text-rose-400 hover:text-rose-200"
        >
          Cancel
        </button>

        {useNativeCamera ? (
          /* `capture` opens the phone's own camera app straight away rather
             than the photo picker. Only meaningful on mobile; desktop treats
             it as a normal file input, which is the right fallback anyway. */
          <label
            className="grid size-16 cursor-pointer place-items-center rounded-full border-4 border-rose-300 bg-white text-2xl transition active:scale-95"
            aria-label="Take photo"
          >
            📷
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                stop()
                onCaptured(file, URL.createObjectURL(file))
              }}
            />
          </label>
        ) : (
          <button
            onClick={capture}
            disabled={!ready}
            aria-label="Take photo"
            className="size-16 rounded-full border-4 border-rose-300 bg-white transition active:scale-95 disabled:opacity-40"
          />
        )}

        <label className="cursor-pointer rounded-xl px-4 py-2 text-xs font-medium text-rose-400 hover:text-rose-200">
          Gallery
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              stop()
              onCaptured(file, URL.createObjectURL(file))
            }}
          />
        </label>
      </div>
    </div>
  )
}
