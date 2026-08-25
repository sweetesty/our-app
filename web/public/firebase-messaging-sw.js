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

firebase.initializeApp({
  apiKey: 'AIzaSyDmMwV5fK9SyZgn1URpqFVxSHnRuUSfdP0',
  authDomain: 'our-app-6c77f.firebaseapp.com',
  projectId: 'our-app-6c77f',
  storageBucket: 'our-app-6c77f.firebasestorage.app',
  messagingSenderId: '895218514745',
  appId: '1:895218514745:web:726eb94c384fe0206886e8',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Our Little World'

  self.registration.showNotification(title, {
    body: payload.notification?.body ?? '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    // Collapses repeat nudges into one entry rather than stacking a pile of
    // them up while the phone is in a pocket.
    tag: payload.data?.type ?? 'nudge',
    renotify: true,
    data: payload.data ?? {},
  })
})

// Tapping the notification should land on the relevant screen, reusing an
// already-open tab rather than opening a second one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const type = event.notification.data?.type
  const path = type === 'answer' ? '/' : '/nudges'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.navigate(path)
            return client.focus()
          }
        }
        return clients.openWindow(path)
      }),
  )
})
