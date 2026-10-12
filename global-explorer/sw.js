// Global Explorer service worker: precache the app shell and data so the game
// works offline and installs as an app. The build script (build.mjs) rewrites every
// "?v=cdba8160" to the commit SHA, which versions both the cache and the assets.
const VERSION = 'global-explorer?v=cdba8160';
const ASSETS = [
  './', './index.html', './styles.css?v=cdba8160', './app.js?v=cdba8160', './engine.js?v=cdba8160', './globe.js?v=cdba8160', './native.js?v=cdba8160',
  './manifest.webmanifest?v=cdba8160', './icons/icon.svg?v=cdba8160', './icons/icon-192.png?v=cdba8160', './icons/icon-512.png?v=cdba8160',
  './data/countries.json?v=cdba8160', './data/world.json?v=cdba8160',
  './vendor/three/three.module.js?v=cdba8160', './vendor/three/three.core.js', './vendor/three/OrbitControls.js?v=cdba8160',
  './vendor/fonts/TwemojiCountryFlags.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Pages first, so a new deploy is picked up; fall back to the cached shell offline.
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./', copy)); return res; }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  })));
});
