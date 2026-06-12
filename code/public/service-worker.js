const CACHE_NAME = 'restops-cache-cleanup-v5';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.delete(CACHE_NAME));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => caches.delete(key)));
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      return self.registration.unregister();
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
