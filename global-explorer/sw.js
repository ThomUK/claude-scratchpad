// Retired. This copy of Global Explorer has moved to globalexplorer.app.
// Browsers that installed the old offline version fetch this file the next time
// they check for an update (the old page registered sw.js?v=…, and the query is
// ignored by the host). It deletes the old cached game, unregisters itself and
// reloads any open tabs, so they show the "moved" page instead of the old game.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
