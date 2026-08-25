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
      } catch {
        setError('No camera access. Check the permission, or pick a photo instead.')
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
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-xs text-rose-300">
            {error}
          </div>
        )}

        {ready && (
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

        <button
          onClick={capture}
          disabled={!ready}
          aria-label="Take photo"
          className="size-16 rounded-full border-4 border-rose-300 bg-white transition active:scale-95 disabled:opacity-40"
        />

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
