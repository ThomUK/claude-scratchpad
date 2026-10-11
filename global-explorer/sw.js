// Global Explorer service worker: precache the app shell and data so the game
// works offline and installs as an app. The build script (build.mjs) rewrites every
// "?v=0fb72dc8" to the commit SHA, which versions both the cache and the assets.
const VERSION = 'global-explorer?v=0fb72dc8';
const ASSETS = [
  './', './index.html', './styles.css?v=0fb72dc8', './app.js?v=0fb72dc8', './engine.js?v=0fb72dc8', './globe.js?v=0fb72dc8', './native.js?v=0fb72dc8',
  './manifest.webmanifest?v=0fb72dc8', './icons/icon.svg?v=0fb72dc8', './icons/icon-192.png?v=0fb72dc8', './icons/icon-512.png?v=0fb72dc8',
  './data/countries.json?v=0fb72dc8', './data/world.json?v=0fb72dc8',
  './vendor/three/three.module.js?v=0fb72dc8', './vendor/three/three.core.js', './vendor/three/OrbitControls.js?v=0fb72dc8',
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
