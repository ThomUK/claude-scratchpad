// Global Explorer service worker: precache the app shell and data so the game
// works offline and installs as an app. The build script (build.mjs) rewrites every
// "?v=69782716" to the commit SHA, which versions both the cache and the assets.
const VERSION = 'global-explorer?v=69782716';
const ASSETS = [
  './', './index.html', './styles.css?v=69782716', './app.js?v=69782716', './engine.js?v=69782716', './globe.js?v=69782716', './native.js?v=69782716',
  './manifest.webmanifest?v=69782716', './icons/icon.svg?v=69782716', './icons/icon-192.png?v=69782716', './icons/icon-512.png?v=69782716',
  './data/countries.json?v=69782716', './data/world.json?v=69782716',
  './vendor/three/three.module.js?v=69782716', './vendor/three/three.core.js', './vendor/three/OrbitControls.js?v=69782716',
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
