/** Kleine, eigenstaendige HTML-Seiten fuer den Tunnel (kein App-Code, keine Daten). */
const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function shell(title: string, body: string) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#09090b">
<title>${esc(title)}</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;
background:radial-gradient(120% 80% at 50% 0%,#1e1b4b 0%,#09090b 60%);color:#e4e4e7;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px}
.card{width:100%;max-width:400px;background:rgba(24,24,27,.72);border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:28px 22px;backdrop-filter:blur(16px);text-align:center}
.logo{width:56px;height:56px;margin:0 auto 14px;border-radius:16px;background:linear-gradient(135deg,#38bdf8,#8b5cf6);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;color:#fff}
h1{font-size:22px;margin:0 0 8px}p{margin:0 0 14px;color:#a1a1aa}ol{text-align:left;color:#a1a1aa;padding-left:22px;margin:0 0 16px}
input{width:100%;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:#18181b;color:#fff;font-size:16px;margin:4px 0 14px}
button{width:100%;padding:14px;border:0;border-radius:16px;background:linear-gradient(180deg,#fff,#d4d4d8);color:#09090b;font-weight:600;font-size:16px}
.err{color:#fca5a5}.small{font-size:13px;color:#71717a;margin-top:12px}
</style></head><body><main class="card"><div class="logo">C</div>${body}</main></body></html>`;
}

export function lockedPage() {
  return shell(
    "Connect – Handy koppeln",
    `<h1>Dieses Gerät ist nicht gekoppelt</h1>
<p>Connect läuft auf deinem PC. Zum Verbinden brauchst du einen QR-Code von dort.</p>
<ol><li>Am PC in Connect: Profilbild › <b>Handy verbinden</b> (oder Einstellungen › Handy verbinden)</li>
<li>QR-Code mit der Handy-Kamera scannen</li><li>„Koppeln“ tippen – fertig</li></ol>
<p class="small">Ohne Kopplung ist hier nichts erreichbar.</p>`,
  );
}

export function pairPage(token: string, suggestedLabel: string, error?: string) {
  return shell(
    "Connect – Gerät koppeln",
    `<h1>Mit Connect koppeln?</h1>
<p>Dieses Handy bekommt Zugriff auf deine Connect App am PC (gleiche Agenten, gleicher Stand). Du kannst es jederzeit am PC in Einstellungen › Handy verbinden wieder entfernen.</p>
${error ? `<p class="err">${esc(error)}</p>` : ""}
<form method="post" action="/__connect/pair"><input type="hidden" name="t" value="${esc(token)}">
<label for="n" class="small">Gerätename</label><input id="n" name="name" maxlength="60" value="${esc(suggestedLabel)}">
<button type="submit">Koppeln</button></form>`,
  );
}

export function pairFailedPage(message: string) {
  return shell(
    "Connect – Kopplung fehlgeschlagen",
    `<h1>Kopplung fehlgeschlagen</h1><p class="err">${esc(message)}</p>
<p>Am PC in Connect › Handy verbinden einen neuen QR-Code anzeigen und erneut scannen.</p>`,
  );
}

/** helium-pairfix: statt Sackgasse -> nach 2 s automatisch ueber das Gateway neu anmelden (CSP: kein Skript, daher meta refresh). */
export function pairExpiredPage(gatewayUrl: string, from: string) {
  const target = `${gatewayUrl}${gatewayUrl.includes("?") ? "&" : "?"}from=${encodeURIComponent(from)}`;
  return shell(
    "Connect – neu anmelden",
    `<h1>Anmelde-Link schon verwendet</h1>
<p>Dieser Einmal-Link wurde bereits benutzt oder ist abgelaufen. Kein Problem: Du wirst gleich automatisch über Connect neu angemeldet.</p>
<p style="margin-top:18px"><a href="${esc(target)}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#fff;color:#09090b;text-decoration:none;font-weight:600">Über Connect anmelden</a></p>
<p class="small">Weiterleitung in 2 Sekunden …</p>`,
  ).replace("</head>", `<meta http-equiv="refresh" content="2;url=${esc(target)}"></head>`);
}
