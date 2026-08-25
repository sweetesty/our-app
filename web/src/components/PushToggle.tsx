import { useEffect, useState } from 'react'
import { enablePush, isConfigured, permissionState, refreshPushRegistration } from '../lib/push'

function isIOSSafariTab(): boolean {
  const ua = navigator.userAgent
  const iOS =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  return iOS && !installed
}

/**
 * Turning on browser notifications. The permission prompt has to come from a
 * click — browsers reject one that appears unprompted.
 */
export default function PushToggle() {
  const [state, setState] = useState<NotificationPermission | 'unsupported'>('default')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setState(permissionState())
    // If permission was granted on a previous visit, quietly re-register — FCM
    // tokens rotate and a stale one fails silently.
    void refreshPushRegistration()
  }, [])

  async function turnOn() {
    setBusy(true)
    setError('')
    const result = await enablePush()
    setBusy(false)
    setState(permissionState())
    if (!result.ok) setError(result.reason)
  }

  if (!isConfigured()) {
    return (
      <p className="text-xs text-rose-400">
        Push isn't configured for this deployment.
      </p>
    )
  }

  if (state === 'unsupported') {
    return (
      <p className="text-xs text-rose-400">
        This browser can't do notifications.
      </p>
    )
  }

  // On iPhone, a Safari tab can never receive push. Say so plainly rather than
  // offering a button that is guaranteed to fail.
  if (isIOSSafariTab()) {
    return (
      <div className="rounded-2xl border border-pink-500/30 bg-pink-500/10 p-4">
        <p className="text-xs leading-relaxed text-pink-200">
          On iPhone, notifications only work once this is added to your Home
          Screen. Tap <span className="font-semibold text-white">Share</span> →
          <span className="font-semibold text-white"> Add to Home Screen</span>,
          then open it from there and come back here.
        </p>
      </div>
    )
  }

  if (state === 'granted') {
    return (
      <p className="text-xs text-emerald-300">
        ✓ Notifications are on for this device.
      </p>
    )
  }

  if (state === 'denied') {
    return (
      <p className="text-xs leading-relaxed text-rose-400">
        Notifications are blocked. Turn them back on in your browser's site
        settings — the padlock icon in the address bar.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => void turnOn()}
        disabled={busy}
        className="rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow transition hover:from-pink-500 hover:to-rose-500 disabled:opacity-50"
      >
        {busy ? 'Turning on…' : 'Turn on notifications 🔔'}
      </button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}
