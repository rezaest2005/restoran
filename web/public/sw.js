// Minimal service worker: it only has to exist (with a fetch handler) so the courier page can be installed as an app.
// It never answers or caches anything itself, so it cannot interfere with other applications on the same domain.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
