// Service worker mínimo: cache-first del shell, network para /api/*.
const CACHE = 'renderz-tools-v1';
const SHELL = [
  '/',
  '/inbox.html',
  '/inbox.css',
  '/inbox.js',
  '/style.css',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API y OAuth: siempre red.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/healthz')) return;
  // Resto: cache-first con fallback a red, y refresh background.
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetcher = fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fetcher;
    })
  );
});
