// Global Explorer service worker: precache the app shell and data so the game
// works offline and installs as an app. The Pages workflow rewrites every
// "?v=dev" to the commit SHA, which versions both the cache and the assets.
const VERSION = 'global-explorer?v=dev';
const ASSETS = [
  './', './index.html', './styles.css?v=dev', './app.js?v=dev', './engine.js?v=dev', './globe.js?v=dev',
  './manifest.webmanifest?v=dev', './icons/icon.svg?v=dev', './icons/icon-192.png?v=dev', './icons/icon-512.png?v=dev',
  './data/countries.json?v=dev', './data/world.json?v=dev',
  './vendor/three/three.module.js?v=dev', './vendor/three/three.core.js', './vendor/three/OrbitControls.js?v=dev',
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
