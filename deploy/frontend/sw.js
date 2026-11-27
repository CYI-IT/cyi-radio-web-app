const cachePrefix = 'cyi-radio-listener-'
const version = "6b95a7b4faadb1dd"
const shellPath = "/assets/listener-shell-6b95a7b4faadb1dd.html"
const assets = ["/assets/CYI-radio-original-2.png","/assets/X.es-pNLYHf-y.js","/assets/broadcast-pattern-qbtAuifX.webp","/assets/cyi-radio-icon-192.png","/assets/cyi-radio-icon-512.png","/assets/index-BgZIRQM2.js","/assets/index-CYR0O2Y-.css","/assets/outfit-latin-wght-normal-Bc-8i84L.woff2","/manifest.webmanifest"]

// The production build prepends the cache version and public listener asset list.
const cacheName = cachePrefix + version
const assetPaths = new Set(assets)

self.addEventListener('install', event => {
  const requests = [shellPath, ...assets].map(path => new Request(path, {
    cache: 'reload', credentials: 'omit', redirect: 'error',
  }))
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(requests)))
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith(cachePrefix) && name !== cacheName)
      .map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

async function listenerPage(request) {
  try {
    return await fetch(request)
  } catch {
    const cache = await caches.open(cacheName)
    return await cache.match(shellPath) ?? Response.error()
  }
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    if (['/', '/index.html', '/schedule', '/schedule/'].includes(url.pathname)) {
      event.respondWith(listenerPage(request))
    }
    return
  }

  if (!url.search && assetPaths.has(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async cache => await cache.match(request) ?? fetch(request)))
  }
})
