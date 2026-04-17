const CACHE_NAME = 'tracking-surat-runtime-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key)
          }

          return Promise.resolve()
        }),
      ),
    ),
  )

  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Always revalidate document navigations so phones do not stay on an old bundle.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match('/')
        return cached || Response.error()
      }),
    )
    return
  }

  // Static assets can use a lightweight runtime cache, but never block updates.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const cloned = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned))
        }

        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        return cached || Response.error()
      }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existingClient = clients[0]

      if (existingClient) {
        return existingClient.focus()
      }

      return self.clients.openWindow('/')
    }),
  )
})
