import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-64.png', 'logo-mark.png'],

      manifest: {
        name: 'Our Little World',
        short_name: 'Our World',
        description:
          'A private space for exactly two people. A daily question neither of you can read first, letters that open later, and a scrapbook only you two can see.',
        // Matches --canvas so the splash screen does not flash a different colour.
        theme_color: '#1a0b0f',
        background_color: '#1a0b0f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['lifestyle', 'social'],
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Single-page app: any unknown route resolves to the shell and React
        // Router takes it from there.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}'],
        // The FCM worker is a second, independently-registered service worker.
        // Precaching it here would pin a stale copy and stop push updates
        // reaching the browser.
        //
        // The iOS launch screens are excluded for a different reason: thirteen
        // full-resolution PNGs is 2.6MB, iOS fetches whichever one it needs by
        // itself, and no device will ever want more than one of them. Left in,
        // they would make every user download twelve images for nobody.
        //
        // The Twemoji set is excluded for the same reason as the splashes, one
        // order of magnitude up: 3,700 SVGs is 17MB, and nobody looks at more
        // than a few dozen. They are cached as they are used, below.
        globIgnores: ['**/firebase-messaging-sw.js', 'splash/**', 'emoji/**'],

        // 3,700 files would blow past the default precache manifest budget and
        // the emoji are the reason the number is this large.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

        runtimeCaching: [
          {
            // Emoji: cache-first and kept, because a given file never changes
            // and an emoji that needs the network is an emoji that is blank on
            // the train. The cap is generous — they are ~2KB each.
            urlPattern: /\/emoji\/[0-9a-f-]+\.svg$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'twemoji',
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts: cache-first, they never change.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Signed media URLs expire, so caching them would serve dead links.
            // Network-only, and never stored.
            urlPattern: /\/storage\/v1\/object\/sign\//,
            handler: 'NetworkOnly',
          },
          {
            // Never cache the API. A cached answer to "has my partner replied
            // yet" would be worse than no answer at all.
            urlPattern: /supabase\.co\/(rest|auth|realtime|functions)\//,
            handler: 'NetworkOnly',
          },
        ],
      },

      devOptions: {
        // Lets the install prompt and service worker be tested with `npm run dev`.
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: { port: 5173 },
})
