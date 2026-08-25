import { useEffect, useState } from 'react'
import { enablePush, isConfigured, permissionState } from '../lib/push'

const DISMISSED_KEY = 'olw-notify-dismissed'

function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  const ua = navigator.userAgent
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
}

/**
 * First-run ask for notifications.
 *
 * Deliberately a card rather than an immediate permission dialog. Browsers
 * penalise a prompt nobody asked for — Chrome can block the origin outright
 * after a dismissal, and a "denied" is close to permanent. So this explains
 * what it's for and only calls requestPermission on a tap.
 *
 * On iPhone it doesn't appear at all until the app has been installed, because
 * Safari refuses push to a tab and the prompt would fail silently — teaching
 * someone the feature is broken.
 */
export default function NotificationPrompt() {
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isConfigured()) return
    if (permissionState() !== 'default') return   // already granted or blocked
    if (isIOS() && !isInstalled()) return          // install has to come first

    try {
      if (localStorage.getItem(DISMISSED_KEY) === '1') return
    } catch {
      // storage blocked; treat as not dismissed
    }

    setShow(true)
  }, [])

  function dismiss() {
    setShow(false)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // nothing to do
    }
  }

  async function turnOn() {
    setBusy(true)
    setError('')
    const result = await enablePush()
    setBusy(false)

    if (result.ok) {
      dismiss()
    } else {
      setError(result.reason)
      // A refusal is sticky in every browser, so stop asking. Settings still
      // has the toggle if they change their mind.
      if (permissionState() === 'denied') {
        try {
          localStorage.setItem(DISMISSED_KEY, '1')
        } catch {
          // nothing to do
        }
      }
    }
  }

  if (!show) return null

  return (
    <div className="animate-rise rounded-3xl border border-pink-500/40 bg-gradient-to-br from-pink-950/60 to-rose-950/80 p-5 shadow-xl">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🔔</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Let them reach you</p>
          <p className="mt-1 text-xs leading-relaxed text-rose-300">
            Without this, an "I miss you" only arrives if this app happens to be
            open. Turn it on and it lands on your phone like a text.
          </p>

          {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void turnOn()}
              disabled={busy}
              className="rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:from-pink-500 hover:to-rose-500 disabled:opacity-50"
            >
              {busy ? 'Turning on…' : 'Turn on notifications'}
            </button>
            <button
              onClick={dismiss}
              className="rounded-xl px-3 py-2 text-xs font-medium text-rose-400 transition hover:text-rose-200"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
