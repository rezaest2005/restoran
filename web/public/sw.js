// Service worker حداقلی: فقط برای نصب‌پذیری و باز شدن پوسته‌ی برنامه بدون اینترنت.
// درخواست‌های API هرگز کش نمی‌شوند (داده‌ی مأموریت و مالی باید همیشه تازه باشد).
const CACHE = "bizsuite-shell-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add("/")).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/api/") || url.pathname.startsWith("/admin/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/")));
  }
});
