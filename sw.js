/**
 * ONDA — Progressive Web App Service Worker
 * Caches the static app shell for fast startup and offline resilience while
 * leaving live audio streams and cross-origin Radio Browser API calls untouched.
 */

const CACHE_VERSION = 'onda-shell-v1.5.0';

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles/base.css',
  './styles/views.css',
  './styles/components.css',
  './styles/atlas.css',
  './styles/mobile-player.css',
  './js/config.js',
  './js/utils.js',
  './js/api.js',
  './js/player.js',
  './js/storage.js',
  './js/custom-streams.js',
  './js/mobile-player.js',
  './js/app.js',
  './favicon.svg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('onda-shell-') && key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept cross-origin audio streams, CDN scripts, or Radio Browser API requests
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first with cached index.html fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Same-origin static shell assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
