/* Minimal offline shell so Chromium offers "Install app". */
// v2: Seiten-Navigationen gehen zuerst ans Netz. v1 hat "/" cache-first ausgeliefert –
// nach einem Update zeigte die alte index.html auf gelöschte Assets (leere Seite).
const CACHE = "connect-shell-v2";
const SHELL = ["/", "/manifest.webmanifest", "/brand/connect-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Netz zuerst (immer die aktuelle index.html), offline Fallback auf die gecachte Shell.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname === "/") {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error())),
    );
    return;
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(request).then((c) => c || Response.error())));
  }
  // Alles andere (Assets mit Hash im Namen) normal übers Netz/HTTP-Cache.
});
