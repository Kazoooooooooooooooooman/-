// オフラインでも開けるようにアプリ本体をキャッシュ
const CACHE = "ontime-v1";
const FILES = ["./", "./index.html", "./styles.css", "./core.js", "./app.js", "./icon.svg", "./manifest.webmanifest"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // ネット優先・失敗したらキャッシュ (共有で ?text= 付きで開かれても本体を返す)
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        if (!url.search) caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow("./index.html"));
});
