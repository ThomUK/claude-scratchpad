// Global Explorer service worker: precache the app shell and data so the game
// works offline and installs as an app. The build script (build.mjs) rewrites every
// "?v=daaeec81" to the commit SHA, which versions both the cache and the assets.
const VERSION = 'global-explorer?v=daaeec81';
const ASSETS = [
  './', './index.html', './styles.css?v=daaeec81', './app.js?v=daaeec81', './engine.js?v=daaeec81', './globe.js?v=daaeec81', './native.js?v=daaeec81',
  './manifest.webmanifest?v=daaeec81', './icons/icon.svg?v=daaeec81', './icons/icon-192.png?v=daaeec81', './icons/icon-512.png?v=daaeec81',
  './data/countries.json?v=daaeec81', './data/world.json?v=daaeec81',
  './vendor/three/three.module.js?v=daaeec81', './vendor/three/three.core.js', './vendor/three/OrbitControls.js?v=daaeec81',
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
