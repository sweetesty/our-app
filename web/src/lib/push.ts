import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from 'firebase/messaging'
import { supabase } from './supabase'

/**
 * Web push.
 *
 * Registers this browser as a device against the signed-in user, so the same
 * send-push Edge Function that reaches the Flutter app can reach a browser too
 * — it is the same FCM token type, just issued to a service worker instead of
 * to an Android app.
 *
 * Everything degrades quietly. Unsupported browser, blocked permission, or a
 * missing VAPID key all end with push simply not working; realtime nudges keep
 * arriving whenever a tab is open.
 *
 * iOS caveat worth repeating: Safari only grants push to a site that has been
 * added to the Home Screen, on iOS 16.4+. In a normal tab, requestPermission
 * resolves 'denied' and there is nothing the page can do about it.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

let app: FirebaseApp | null = null
let messaging: Messaging | null = null
let registeredToken: string | null = null

export function isConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.appId && VAPID_KEY)
}

/** True once this browser is receiving pushes. */
export function pushEnabled(): boolean {
  return registeredToken !== null
}

export function permissionState(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

async function ensureMessaging(): Promise<Messaging | null> {
  if (messaging) return messaging
  if (!isConfigured()) return null
  if (!(await isSupported())) return null

  app ??= initializeApp(firebaseConfig)
  messaging = getMessaging(app)
  return messaging
}

/**
 * Asks for permission and registers the token. Must be called from a user
 * gesture — browsers reject a permission prompt that nobody asked for, and
 * Safari is strictest about it.
 */
export async function enablePush(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (!isConfigured()) {
    return { ok: false, reason: 'Push is not configured for this deployment.' }
  }

  const m = await ensureMessaging()
  if (!m) {
    return { ok: false, reason: 'This browser does not support push notifications.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return {
      ok: false,
      reason:
        permission === 'denied'
          ? 'Notifications are blocked. On iPhone, add this to your Home Screen first.'
          : 'Permission was dismissed.',
    }
  }

  try {
    // Firebase looks for /firebase-messaging-sw.js by default, but the PWA has
    // already claimed the root scope, so hand it an explicit registration.
    const swRegistration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      {
        scope: '/firebase-cloud-messaging-push-scope',
        // Bypass the HTTP cache when checking this script, so a fix ships on
        // the next launch rather than whenever the browser feels like it.
        updateViaCache: 'none',
      },
    )

    // Force a check now as well; registration alone reuses an existing worker.
    void swRegistration.update()

    const token = await getToken(m, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    })

    if (!token) return { ok: false, reason: 'Could not get a push token.' }

    const { error } = await supabase.rpc('register_device_token', {
      device_token: token,
      device_platform: 'web',
    })
    if (error) return { ok: false, reason: error.message }

    registeredToken = token

    // A push that arrives with the tab focused is delivered here instead of to
    // the service worker. The in-app banner already covers that case, so this
    // stays quiet rather than double-notifying.
    onMessage(m, (payload) => {
      console.debug('push received in foreground', payload.notification?.title)
    })

    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Failed.' }
  }
}

/** Called on sign-out so a shared computer stops receiving someone else's nudges. */
export async function disablePush(): Promise<void> {
  const token = registeredToken
  if (!token) return
  registeredToken = null
  try {
    await supabase.rpc('unregister_device_token', { device_token: token })
  } catch {
    // Signing out matters more than tidying up.
  }
}

/** Re-registers silently on load if permission was already granted. */
export async function refreshPushRegistration(): Promise<void> {
  if (!isConfigured()) return
  if (permissionState() !== 'granted') return
  await enablePush()
}
