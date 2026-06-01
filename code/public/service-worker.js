const CACHE_NAME = 'edgeops-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/favicon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Suppress errors if some assets fail to cache
        return cache.addAll(urlsToCache).catch(err => console.warn('PWA Cache err', err));
      })
  );
});

self.addEventListener('fetch', event => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response or fetch from network
        return response || fetch(event.request).catch(() => {
          // Offline fallback could go here
        });
      })
  );
});
