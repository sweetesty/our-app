import { useEffect, useRef, useState } from 'react'
import { cx } from './ui'

/**
 * Records a voice note in the browser.
 *
 * You could already attach an audio file, which meant recording in another app
 * and finding the file — enough friction that nobody would ever do it. The Dare
 * deck asks for voice notes by name, so it needs to be one tap.
 *
 * Format is whatever the browser gives: Chrome and Firefox produce webm/opus,
 * Safari mp4/aac. Both are in the storage bucket's allowed MIME types, and
 * both play back natively in the browser that made them and in each other's.
 */
export default function VoiceRecorder({
  onRecorded,
  maxSeconds = 180,
}: {
  onRecorded: (file: File | null) => void
  maxSeconds?: number
}) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef<number | null>(null)

  const supported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)

  // Releasing the mic matters: leave the stream open and the browser keeps
  // showing a recording indicator, which is alarming and looks like a bug.
  function releaseMic() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      releaseMic()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function start() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        // The extension has to match the real container or the storage bucket
        // rejects it on MIME type.
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
        const file = new File([blob], `voice-note.${ext}`, { type })

        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(URL.createObjectURL(blob))
        onRecorded(file)
        releaseMic()
      }

      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
      setSeconds(0)

      tickRef.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= maxSeconds) {
            recorder.stop()
            setRecording(false)
          }
          return s + 1
        })
      }, 1000)
    } catch {
      setError('Could not reach your microphone. Check the browser permission.')
      releaseMic()
    }
  }

  function stop() {
    recorderRef.current?.stop()
    setRecording(false)
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setSeconds(0)
    onRecorded(null)
  }

  if (!supported) {
    return (
      <p className="text-xs text-rose-400">
        This browser can't record audio — you can still attach a file.
      </p>
    )
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  if (previewUrl) {
    return (
      <div className="space-y-2 rounded-2xl border border-rose-700/40 bg-rose-900/30 p-4">
        <div className="flex items-center gap-2 text-xs text-rose-300">
          <span>🎙️</span>
          <span>Voice note · {mmss}</span>
        </div>
        <audio src={previewUrl} controls className="w-full" />
        <button
          onClick={discard}
          className="text-xs text-rose-400 underline-offset-4 hover:text-rose-200 hover:underline"
        >
          Delete and record again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={recording ? stop : () => void start()}
        className={cx(
          'flex w-full items-center justify-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition',
          recording
            ? 'bg-rose-600 text-white'
            : 'border border-rose-700/40 bg-rose-900/40 text-rose-100 hover:bg-rose-900',
        )}
      >
        {recording ? (
          <>
            <span className="size-2.5 animate-pulse rounded-full bg-white" />
            Stop · {mmss}
          </>
        ) : (
          <>🎙️ Record a voice note</>
        )}
      </button>

      {recording && (
        <p className="text-center text-xs text-rose-400">
          Up to {Math.floor(maxSeconds / 60)} minutes. Tap to stop.
        </p>
      )}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}
