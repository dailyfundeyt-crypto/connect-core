// Testapp wie ein Vite-Build: absolute Pfade (/assets, /src, /api). Port 5199, nur 127.0.0.1.
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spark Dashboard</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/assets/app.css"></head>
<body><main><p class="k">localhost:5199 · über Connect-Proxy</p><h1>Spark Dashboard</h1>
<div class="card"><span>CSS (/assets/app.css)</span><b id="css">…</b></div>
<div class="card"><span>JS-Modul (/assets/app.js)</span><b id="js">fehlt</b></div>
<div class="card"><span>Import (/src/extra.js)</span><b id="imp">…</b></div>
<div class="card"><span>fetch("/api/hello")</span><b id="api">…</b></div>
<div class="card"><span>Adresse im Frame</span><b id="loc"></b></div></main>
<script type="module" src="/assets/app.js"></script></body></html>`;
const css = `body{margin:0;font:15px/1.4 system-ui;background:#0f1117;color:#e5e7eb}main{padding:22px}h1{font-size:26px;margin:4px 0 18px}.k{color:#34d399;font-size:12px;letter-spacing:.08em;text-transform:uppercase}.card{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;margin:8px 0;border-radius:16px;background:#1a1d27;border:1px solid #2a2f3d}.card b{color:#34d399}#css::after{content:"ok"}`;
const js = `document.getElementById("js").textContent="ok";document.getElementById("css").textContent="";document.getElementById("loc").textContent=location.pathname;
import("/src/extra.js").then(m=>{document.getElementById("imp").textContent=m.default}).catch(e=>{document.getElementById("imp").textContent="Fehler"});
fetch("/api/hello").then(r=>r.json()).then(j=>{document.getElementById("api").textContent=j.msg}).catch(()=>{document.getElementById("api").textContent="Fehler"});`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#f59e0b"/><path d="M36 8 16 36h14l-4 20 22-30H34z" fill="#fff"/></svg>`;
Bun.serve({ port: 5199, hostname: "127.0.0.1", fetch(req) {
  const p = new URL(req.url).pathname;
  const t = (b: string, ct: string) => new Response(b, { headers: { "content-type": ct, "x-frame-options": "DENY" } });
  if (p === "/" || p === "/index.html") return t(html, "text/html; charset=utf-8");
  if (p === "/assets/app.css") return t(css, "text/css");
  if (p === "/assets/app.js") return t(js, "text/javascript");
  if (p === "/src/extra.js") return t(`export default "ok"`, "text/javascript");
  if (p === "/api/hello") return Response.json({ msg: "ok (" + (req.headers.get("host")) + ")" });
  if (p === "/favicon.svg" || p === "/favicon.ico") return t(svg, "image/svg+xml");
  return new Response("404", { status: 404 });
}});
console.log("local-app 5199");
