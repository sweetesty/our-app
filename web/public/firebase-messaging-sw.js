/* eslint-disable no-undef */
/**
 * Background push handler.
 *
 * This is a second, separate service worker from the PWA's sw.js. It has to be
 * a plain file in public/ because a service worker cannot be bundled — the
 * browser fetches it directly by URL. That also means it cannot read Vite env
 * vars, so the Firebase config is inlined below. Those values are public client
 * configuration and ship in every Firebase web app's JavaScript anyway.
 *
 * It handles notifications that arrive while the tab is closed or backgrounded.
 * Foreground messages go to onMessage() in src/lib/push.ts instead.
 */

importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js')

// Take over as soon as a new version lands. Without these, the previous worker
// keeps running until every tab and every installed window is closed — which on
// a phone can be days. That is why the duplicate-notification fix appeared to
// do nothing: the old worker was still the one handling the push.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

firebase.initializeApp({
  apiKey: 'AIzaSyDmMwV5fK9SyZgn1URpqFVxSHnRuUSfdP0',
  authDomain: 'our-app-6c77f.firebaseapp.com',
  projectId: 'our-app-6c77f',
  storageBucket: 'our-app-6c77f.firebasestorage.app',
  messagingSenderId: '895218514745',
  appId: '1:895218514745:web:726eb94c384fe0206886e8',
})

const messaging = firebase.messaging()

/**
 * Do NOT call showNotification here.
 *
 * Every message we send carries a `notification` payload, and FCM displays
 * those itself. Showing one here as well produced two notifications for every
 * nudge. This handler exists only to mark the app icon.
 *
 * Routing is handled by webpush.fcm_options.link in the send-push function —
 * FCM owns the click for notification-payload messages, so a notificationclick
 * listener here would never fire.
 */
messaging.onBackgroundMessage(() => {
  // The worker has no idea what the real count is — that lives in home_summary
  // — so this sets a plain dot, and the app replaces it with the exact number
  // the next time it opens and refreshes.
  if (self.navigator && 'setAppBadge' in self.navigator) {
    self.navigator.setAppBadge().catch(() => {})
  }
})

// Fallback only. FCM handles the click for notification-payload messages via
// fcm_options.link; this covers the case where APP_URL is unset server-side, so
// no link was attached and the tap would otherwise do nothing.
self.addEventListener('notificationclick', (event) => {
  // Bail only if FCM actually has a link to follow. The old check bailed
  // whenever FCM had touched the payload at all — which is always — so when
  // APP_URL was unset server-side, nothing had a link and nothing handled the
  // tap either. Notifications simply did nothing when clicked.
  const fcmLink =
    event.notification.data?.FCM_MSG?.notification?.click_action ||
    event.notification.data?.FCM_MSG?.fcmOptions?.link
  if (fcmLink) return

  event.notification.close()

  // FCM nests the original data payload when it handles the message itself.
  const data = event.notification.data?.FCM_MSG?.data ?? event.notification.data ?? {}
  const type = data.type

  // Mirrors pathFor() in supabase/functions/send-push. Half the types were
  // missing here, so with APP_URL unset a tapped message or reply opened Today
  // and left you to find the thing yourself.
  const path =
    type === 'vault' || type === 'surprise' ? '/vault'
    : type === 'note' ? '/notes'
    : type === 'reply' ? (data.kind === 'vault' ? '/vault' : '/notes')
    : type === 'message' ? '/chat'
    : type === 'nudge' ? '/nudges'
    : type === 'date' || type === 'memory' ? '/timeline'
    : type === 'moment' ? '/moments'
    : '/' // answer, mood, joined, reaction, compliment, milestone, photo, reveal, test

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(new URL(path, self.location.origin).href)
          return client.focus()
        }
      }
      return clients.openWindow(new URL(path, self.location.origin).href)
    }),
  )
})
