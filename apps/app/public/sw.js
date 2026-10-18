/* Minimal offline shell so Chromium offers "Install app". */
// v3: Navigationen holen die index.html mit cache:"reload" – umgeht den HTTP-Cache.
// v2 war zwar network-first, aber der HTTP-Cache lieferte weiterhin eine alte index.html
// aus, die auf ein altes, inzwischen geloeschtes Bundle zeigte (leere Seite / alte Route).
// v1 hat "/" cache-first ausgeliefert – nach einem Update zeigte die alte index.html
// auf gelöschte Assets (leere Seite).
const CACHE = "connect-shell-v8";
const SHELL = ["/manifest.webmanifest", "/brand/connect-logo.png"];

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
    // Netz zuerst, aber mit cache:"reload": erzwingt eine frische index.html und
    // umgeht eine veraltete HTTP-Cache-Antwort, die auf ein altes Bundle zeigte.
    // offline Fallback auf die gecachte Shell.
    event.respondWith(
      fetch(new Request(request.url, { cache: "reload" }))
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
  // Hash-Assets (index-B4g6BjcX.js) sind immutable und kommen direkt aus dem HTTP-Cache.
});
