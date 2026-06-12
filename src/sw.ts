/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Navigation fallback — serve index.html for all nav requests (SPA)
registerRoute(
  new NavigationRoute(
    new NetworkFirst({ cacheName: 'navigation', networkTimeoutSeconds: 3 })
  )
)

// Supabase API — network first
registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 86400 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// Google Fonts stylesheets
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' })
)

// Google Fonts files
registerRoute(
  ({ url }) => url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 31536000 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload: { title: string; body: string; url?: string; tag?: string } = {
    title: '🌱 MoneyPlant',
    body: event.data.text(),
  }
  try { payload = event.data.json() } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag: payload.tag ?? 'moneyplant',
      data: { url: payload.url ?? '/' },
      requireInteraction: false,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin))
      if (existing) return existing.focus()
      return self.clients.openWindow(target)
    })
  )
})
