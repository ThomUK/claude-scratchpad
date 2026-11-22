// Global Explorer service worker: precache the app shell and data so the game
// works offline and installs as an app. The build script (build.mjs) rewrites every
// "?v=5c15159f" to the commit SHA, which versions both the cache and the assets.
const VERSION = 'global-explorer?v=5c15159f';
const ASSETS = [
  './', './index.html', './styles.css?v=5c15159f', './app.js?v=5c15159f', './engine.js?v=5c15159f', './globe.js?v=5c15159f', './native.js?v=5c15159f',
  './manifest.webmanifest?v=5c15159f', './icons/icon.svg?v=5c15159f', './icons/icon-192.png?v=5c15159f', './icons/icon-512.png?v=5c15159f',
  './data/countries.json?v=5c15159f', './data/world.json?v=5c15159f',
  './vendor/three/three.module.js?v=5c15159f', './vendor/three/three.core.js', './vendor/three/OrbitControls.js?v=5c15159f',
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
    // Only a successful page is kept: on the schools' site a signed-out visit returns
    // the sign-in page (401), which must never replace the cached game.
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('./', copy)); } return res; }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  })));
});
