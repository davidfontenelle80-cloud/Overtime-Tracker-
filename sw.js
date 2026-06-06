/**
 * sw.js — KHub Boilerplate
 * Version: v2
 *
 * Responsibilities:
 *  1. Precache the app shell on install
 *  2. Serve from cache (cache-first), fall back to network
 *  3. Purge old caches on activate
 *  4. Respond to SKIP_WAITING message (user clicked Refresh)
 *  5. Broadcast RELOAD_READY to all clients after activation
 *
 * Update-check timing (12-hour interval) is owned by the page (app.js)
 * because the SW can be suspended by the browser at any time.
 * The page calls registration.update() → browser re-fetches sw.js →
 * if content changed, new SW installs → page receives 'updatefound' →
 * shows banner or quietly reloads depending on "safe" state.
 *
 * BUMP THIS VERSION STRING on every deploy so the cache key changes.
 */

const CACHE_VERSION = 'overtime-tracker-v2';

/**
 * All URLs that make up the app shell.
 * Add any new JS/CSS files here when you create them.
 */
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
  './js/app.js',
  './js/firebase/firebase-config.js',
  './js/firebase/cloud-backup.js',
];

// ── Install ──────────────────────────────────────────────────
// Cache every app-shell URL. If any fail, the install aborts —
// that keeps the old SW serving until a complete set is ready.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => {
        // Don't skipWaiting here — let the page decide when to swap.
        // skipWaiting is sent via message after the user acknowledges.
        console.log('[KHub SW] Installed — waiting for activation signal.');
      })
      .catch(err => console.error('[KHub SW] Install failed:', err))
  );
});

// ── Activate ─────────────────────────────────────────────────
// Delete every cache that isn't the current version,
// then take control of all open pages immediately.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => {
            console.log('[KHub SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Broadcast to all tabs: "new version is now active, safe to reload"
        self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'RELOAD_READY' }));
        });
      })
  );
});

// ── Fetch ────────────────────────────────────────────────────
// Strategy: cache-first for app shell, network-only for everything else.
// This keeps the app fast offline while letting API calls go through.
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Only handle same-origin requests (skip cross-origin APIs/CDNs)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache the response
      return fetch(event.request)
        .then(response => {
          // Only cache valid responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const cloned = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => {
          // Network failed and not in cache — nothing we can do
          console.warn('[KHub SW] Fetch failed (offline?) for:', event.request.url);
        });
    })
  );
});

// ── Messages ─────────────────────────────────────────────────
// SKIP_WAITING: sent by app.js when user clicks "Refresh" on the update banner.
// SW skips the waiting phase and activates immediately.
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    console.log('[KHub SW] SKIP_WAITING received — activating new version.');
    self.skipWaiting();
  }
});

