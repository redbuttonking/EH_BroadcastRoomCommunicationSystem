// Only the offline notice is stored. Chat, credentials, and Firebase responses are never cached.
const OFFLINE_CACHE = 'eh-offline-v2'
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add('/offline.html')))
  self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith('eh-offline-') && key !== OFFLINE_CACHE)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    }),
  )
})
self.addEventListener('fetch', (event) => {
  if (
    event.request.mode !== 'navigate' ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return
  event.respondWith(
    fetch(event.request).catch(
      async () => (await caches.match('/offline.html')) || Response.error(),
    ),
  )
})
