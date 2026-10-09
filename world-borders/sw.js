// The app moved to ../global-explorer/. This stub replaces the old service
// worker registered at this scope, clears its caches and unregisters itself so
// the redirect page above is always served fresh.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
