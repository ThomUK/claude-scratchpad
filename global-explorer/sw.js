// Global Explorer service worker: precache the app shell and data so the game
// works offline and installs as an app. The build script (build.mjs) rewrites every
// "?v=bf828186" to the commit SHA, which versions both the cache and the assets.
const VERSION = 'global-explorer?v=bf828186';
const ASSETS = [
  './', './index.html', './styles.css?v=bf828186', './app.js?v=bf828186', './engine.js?v=bf828186', './globe.js?v=bf828186', './native.js?v=bf828186',
  './manifest.webmanifest?v=bf828186', './icons/icon.svg?v=bf828186', './icons/icon-192.png?v=bf828186', './icons/icon-512.png?v=bf828186',
  './data/countries.json?v=bf828186', './data/world.json?v=bf828186',
  './vendor/three/three.module.js?v=bf828186', './vendor/three/three.core.js', './vendor/three/OrbitControls.js?v=bf828186',
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
