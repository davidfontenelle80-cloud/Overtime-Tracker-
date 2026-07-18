/**
 * Overtime Tracker service worker
 * Safe, scoped PWA caching with network-first recovery.
 */

const CACHE_VERSION = 'overtime-tracker-v26-iphone-black-screen-recovery';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/dark-mode.css',
  './css/components.css',
  './css/responsive.css',
  './js/config.js',
  './js/i18n.js',
  './js/theme.js',
  './js/error-boundary.js',
  './js/a11y.js',
  './js/components/button.js',
  './js/components/modal.js',
  './js/components/card.js',
  './js/components/input.js',
  './js/perf.js',
  './js/sw-register.js',
  './js/app.js',
  './js/firebase/firebase-config.js',
  './js/firebase/cloud-backup.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.allSettled(
        PRECACHE_URLS.map(url => cache.add(url))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('overtime-tracker-') && key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(client => client.postMessage({ type: 'RELOAD_READY' })))
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === 'navigate' || event.request.destination === 'document';
  const isAppAsset = PRECACHE_URLS.some(path => new URL(path, self.location.href).pathname === url.pathname);
  if (!isNavigation && !isAppAsset) return;

  event.respondWith(
    fetch(event.request, { cache: 'reload' })
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        if (isNavigation) {
          return caches.match('./index.html').then(response => response || caches.match('./'));
        }
        return caches.match(event.request).then(response => response || Response.error());
      })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
