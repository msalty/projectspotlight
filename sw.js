// Offline support. App code is network-first (always fresh when online, cached copy when
// offline) so a new deploy is picked up on the next launch; fonts and icons are cache-first.
const CACHE = 'project-spotlight-v11';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/ui.js', './js/pwa.js', './js/db.js', './js/store.js', './js/images.js', './js/migrate.js',
  './js/render.js', './js/presets.js', './js/icons.js', './js/icons-data.js', './js/caption.js', './js/sync.js', './js/location.js', './js/video.js',
  './js/views/home.js', './js/views/editor.js', './js/views/brand.js', './js/views/settings.js', './js/views/syncbutton.js',
  './vendor/qrcode.mjs', './vendor/exifr-lite.mjs', './vendor/mp4-muxer.mjs',
  './fonts/anton.woff2', './fonts/archivo-black.woff2', './fonts/bebas-neue.woff2', './fonts/oswald-700.woff2',
  './fonts/inter-400.woff2', './fonts/inter-600.woff2', './fonts/inter-800.woff2',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  ]));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const cacheFirst = /\/(fonts|icons|vendor)\//.test(url.pathname);
  if (cacheFirst) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
