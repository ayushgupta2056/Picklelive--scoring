/* PickleLive service worker: app shell offline, never caches live data. */
const VERSION = "pl-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/theme-init.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  // Live data and sockets always go to the network (the server is the source of truth).
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io") || url.pathname === "/healthz") return;
  if (req.mode === "navigate") {
    // Network first, fall back to the cached shell so the ref screen opens offline.
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put("/", copy)); return r; }).catch(() => caches.match("/")));
    return;
  }
  if (url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return r; })));
  }
});
