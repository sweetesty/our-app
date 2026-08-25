import { useEffect, useState } from 'react'
import Logo, { APP_NAME } from './Logo'

/** Chrome/Edge fire this so the page can defer the install banner. */
type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'olw-install-dismissed'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS predates the display-mode media query and uses its own flag.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  const ua = window.navigator.userAgent
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS reports as a Mac; the touch points give it away.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
}

/**
 * Nudges people to install the app to their home screen.
 *
 * This matters more than a normal "install our app" banner: on iOS, push
 * notifications only work once the site has been added to the Home Screen. A
 * Safari tab gets nothing, silently. So iOS users see instructions rather than
 * a button — Apple provides no programmatic install.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null)
  const [showIOSHelp, setShowIOSHelp] = useState(false)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (isStandalone()) return

    try {
      if (localStorage.getItem(DISMISSED_KEY) === '1') return
    } catch {
      // storage blocked; treat as not dismissed
    }

    setDismissed(false)

    if (isIOS()) {
      setShowIOSHelp(true)
      return
    }

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as InstallEvent)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function close() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // nothing to do
    }
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') close()
    setDeferred(null)
  }

  if (dismissed) return null
  if (!deferred && !showIOSHelp) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm">
      <div className="rounded-3xl border border-rose-700/50 bg-rose-950/95 p-5 shadow-2xl backdrop-blur">
        <div className="flex items-start gap-3">
          <Logo size={38} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">Add {APP_NAME} to your phone</p>

            {showIOSHelp ? (
              <>
                <p className="mt-1 text-xs leading-relaxed text-rose-300">
                  Tap <span className="text-white">Share</span>
                  <span className="mx-1 inline-block align-[-2px]">􀈂</span>
                  then <span className="text-white">Add to Home Screen</span>.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-pink-300">
                  On iPhone this is the only way notifications can reach you — a
                  Safari tab won't get them.
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs leading-relaxed text-rose-300">
                Installs like a real app. Opens full screen, and notifications
                arrive even when it's closed.
              </p>
            )}

            <div className="mt-3 flex gap-2">
              {deferred && (
                <button
                  onClick={() => void install()}
                  className="rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:from-pink-500 hover:to-rose-500"
                >
                  Install ✨
                </button>
              )}
              <button
                onClick={close}
                className="rounded-xl px-3 py-2 text-xs font-medium text-rose-400 transition hover:text-rose-200"
              >
                {showIOSHelp ? 'Got it' : 'Not now'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
