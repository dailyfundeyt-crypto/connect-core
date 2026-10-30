/* Connect Service Worker. */
// v9 (helium-stale): KEIN App-Shell-Fallback mehr. v8 lieferte bei Netzfehler die gecachte index.html
// aus; deren Bundles kamen ohne Netz nie an -> Intro-Karte "Connect ... Anmelden", und "Anmelden"
// (/sign) landete wieder im selben Fallback (Falle). Passiert v. a. auf alten Tunnel-Adressen
// (*.trycloudflare.com wechselt bei jedem Neustart) und waehrend der lokale Server neu startet.
// Jetzt: Navigation immer Netz zuerst (cache:"reload"). Ohne Netz kommt eine eigenstaendige Seite,
// die auf Tunnel-Adressen zum Gateway (kennt immer die aktuelle Adresse) und lokal per Auto-Retry
// zurueck in die App fuehrt. Hash-Assets werden nicht vom SW angefasst.
const CACHE = "connect-shell-v9";
const SHELL = ["/manifest.webmanifest", "/brand/connect-logo.png"];
const GATEWAY = "https://connect-kunc-preview.vercel.app/gateway";
const TUNNEL = /\.trycloudflare\.com$/i.test(self.location.hostname);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()),
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

function offlinePage(reason) {
  const text = TUNNEL
    ? "Die Verbindung zu deinem PC hat sich ge\u00e4ndert oder ist kurz weg. Du wirst automatisch \u00fcber Connect neu verbunden \u2026"
    : "Der Connect-Server auf diesem PC startet gerade neu oder ist aus. Es wird automatisch erneut versucht \u2026";
  const link = TUNNEL ? `<a href="${GATEWAY}?from=offline">\u00dcber Connect anmelden</a>` : "";
  const body = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#09090b"><title>Connect - nicht erreichbar</title>
<style>html,body{margin:0;background:#09090b;color:#e4e4e7;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}main{max-width:420px;margin:12vh auto;padding:24px}h1{font-size:20px;margin:0 0 8px}p{color:#a1a1aa;line-height:1.5}a,button{display:inline-block;margin:8px 8px 0 0;padding:11px 16px;border-radius:10px;border:0;background:#2563eb;color:#fff;font-weight:600;text-decoration:none;font-size:15px;cursor:pointer}small{color:#71717a}</style></head>
<body><main><h1>Connect ist gerade nicht erreichbar</h1><p>${text}</p><p><button id="r">Erneut versuchen</button>${link}</p><p><small>Grund: ${reason}</small></p></main>
<script>(function(){var T=${TUNNEL},G=${JSON.stringify(GATEWAY)},R=${JSON.stringify(reason)},n=0;
function go(){location.replace(G+"?from=offline&reason="+encodeURIComponent(R));}
function fail(){n++;if(T&&n>=20)go();}
function back(){if(/^\\/(pair|__connect\\/(pc-)?pair)\\/?$/.test(location.pathname))location.replace("/");else location.reload();}
function tryNow(){fetch(T?"/__connect/ping":"/",{cache:"no-store"}).then(function(r){if(r.ok)back();else fail();},fail);}
document.getElementById("r").onclick=function(){if(T&&R!=="server")go();else back();};
if(T&&R!=="server"){setTimeout(go,800);return;}
setInterval(tryNow,3000);})();</script></body></html>`;
  return new Response(body, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/__connect/") || url.pathname === "/pair") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request.url, { cache: "reload" }))
        .then((response) => {
          // Weitergeleitete Antworten duerfen einer Navigation nicht direkt zurueckgegeben werden.
          if (response.redirected) return Response.redirect(response.url, 302);
          // 530 = Cloudflare-Tunnel weg (PC aus / neue Adresse) -> Gateway.
          if (TUNNEL && response.status === 530) return offlinePage("tunnel");
          // 502-504 = Tunnel steht, Server startet neu -> kurz warten, dann Gateway.
          if (TUNNEL && response.status >= 502 && response.status <= 504) return offlinePage("server");
          return response;
        })
        .catch(() => offlinePage(TUNNEL ? "network" : "server")),
    );
    return;
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(request).then((c) => c || Response.error())));
  }
  // Hash-Assets (index-B4g6BjcX.js) kommen direkt vom Server; fehlende liefern jetzt 404 (kein HTML),
  // der Boot-Waechter in index.html laedt dann einmal neu bzw. geht ueber das Gateway.
});
