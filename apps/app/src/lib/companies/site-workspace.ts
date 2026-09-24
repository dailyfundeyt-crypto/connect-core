/**
 * Level 3 company site workspace — isolated from Connect app files.
 *
 * Each company gets its own namespace (`connect.site.{companyId}`).
 * Files here never merge into Connect/Connect source. Preview runs in a
 * sandboxed iframe (srcdoc), like a mini hosted site on Connect.
 */

export type SiteFile = {
  path: string;
  /** text or data-URL for binaries */
  content: string;
  mime: string;
  updatedAt: string;
};

export type SiteWorkspace = {
  companyId: string;
  files: SiteFile[];
  /** Entry HTML path, usually index.html */
  entry: string;
  updatedAt: string;
};

const PREFIX = "connect.site.";
const EVENT = "connect-site-changed";

function key(companyId: string) {
  return `${PREFIX}${companyId}`;
}

function emptyWorkspace(companyId: string, companyName: string): SiteWorkspace {
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(companyName)}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="wrap">
    <p class="eyebrow">Auf Connect gehostet · privat</p>
    <h1>${escapeHtml(companyName)}</h1>
    <p class="lede">Das ist eure Firmen-Website — getrennt vom Connect-Produkt.
      Dateien liegen nur in diesem Workspace. Chat links baut und passt an.</p>
    <button type="button" id="cta">Loslegen</button>
  </main>
  <script src="app.js"></script>
</body>
</html>`;
  const css = `*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#0a0a0a;color:#fafafa;min-height:100vh;display:grid;place-items:center}
.wrap{max-width:36rem;padding:2rem}.eyebrow{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:#a3a3a3}
h1{font-size:2.4rem;margin:.4rem 0 1rem;letter-spacing:-.03em}.lede{color:#d4d4d4;line-height:1.55}
#cta{margin-top:1.25rem;background:#fafafa;color:#0a0a0a;border:0;border-radius:999px;padding:.65rem 1.2rem;font-weight:600;cursor:pointer}
#cta:hover{opacity:.9}`;
  const js = `document.getElementById('cta')?.addEventListener('click',()=>{alert('Willkommen bei ${escapeJs(companyName)}. Hier wächst eure Seite.');});`;
  const now = new Date().toISOString();
  return {
    companyId,
    entry: "index.html",
    updatedAt: now,
    files: [
      { path: "index.html", content: html, mime: "text/html", updatedAt: now },
      { path: "styles.css", content: css, mime: "text/css", updatedAt: now },
      { path: "app.js", content: js, mime: "text/javascript", updatedAt: now },
    ],
  };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJs(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function read(companyId: string): SiteWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(companyId));
    if (!raw) return null;
    return JSON.parse(raw) as SiteWorkspace;
  } catch {
    return null;
  }
}

function write(ws: SiteWorkspace) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(ws.companyId), JSON.stringify(ws));
  window.dispatchEvent(new Event(EVENT));
}

export function getOrCreateSiteWorkspace(
  companyId: string,
  companyName: string,
): SiteWorkspace {
  return read(companyId) ?? (() => {
    const ws = emptyWorkspace(companyId, companyName);
    write(ws);
    return ws;
  })();
}

export function listSiteFiles(companyId: string): SiteFile[] {
  return read(companyId)?.files ?? [];
}

export function upsertSiteFile(
  companyId: string,
  companyName: string,
  file: Omit<SiteFile, "updatedAt">,
): SiteWorkspace {
  const ws = getOrCreateSiteWorkspace(companyId, companyName);
  const nextFile: SiteFile = { ...file, updatedAt: new Date().toISOString() };
  const files = ws.files.filter((f) => f.path !== file.path);
  files.push(nextFile);
  const next = { ...ws, files, updatedAt: nextFile.updatedAt };
  write(next);
  return next;
}

export function deleteSiteFile(
  companyId: string,
  companyName: string,
  path: string,
): SiteWorkspace {
  const ws = getOrCreateSiteWorkspace(companyId, companyName);
  const next = {
    ...ws,
    files: ws.files.filter((f) => f.path !== path),
    updatedAt: new Date().toISOString(),
  };
  write(next);
  return next;
}

export function subscribeSiteWorkspace(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/**
 * Build a single HTML document for iframe srcdoc — inlines CSS/JS from the
 * private workspace so the preview never touches Connect app routes.
 */
export function buildSitePreviewHtml(ws: SiteWorkspace): string {
  const byPath = new Map(ws.files.map((f) => [f.path, f]));
  const entry = byPath.get(ws.entry) ?? byPath.get("index.html");
  if (!entry) {
    return "<!DOCTYPE html><html><body><p>Keine index.html</p></body></html>";
  }
  let html = entry.content;
  for (const file of ws.files) {
    if (file.path.endsWith(".css")) {
      html = html.replace(
        new RegExp(
          `<link[^>]+href=["']${escapeReg(file.path)}["'][^>]*>`,
          "i",
        ),
        `<style>/* ${file.path} */\n${file.content}\n</style>`,
      );
    }
    if (file.path.endsWith(".js")) {
      html = html.replace(
        new RegExp(
          `<script[^>]+src=["']${escapeReg(file.path)}["'][^>]*></script>`,
          "i",
        ),
        `<script>/* ${file.path} */\n${file.content}\n</script>`,
      );
    }
  }
  return html;
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Simple local “AI” apply: merge prompt into a visible hero tweak (no API required). */
export function applyBuildPrompt(
  companyId: string,
  companyName: string,
  prompt: string,
): SiteWorkspace {
  const ws = getOrCreateSiteWorkspace(companyId, companyName);
  const css = ws.files.find((f) => f.path === "styles.css");
  const html = ws.files.find((f) => f.path === "index.html");
  const note = prompt.trim().slice(0, 280);
  if (html) {
    const patched = html.content.includes("data-build-note")
      ? html.content.replace(
          /data-build-note="[^"]*"/,
          `data-build-note="${escapeHtml(note)}"`,
        )
      : html.content.replace(
          "<main",
          `<main data-build-note="${escapeHtml(note)}"`,
        );
    const withBanner = patched.includes("id=\"ai-note\"")
      ? patched.replace(
          /<p id="ai-note"[^>]*>[\s\S]*?<\/p>/,
          `<p id="ai-note" class="lede">${escapeHtml(note)}</p>`,
        )
      : patched.replace(
          /<p class="lede">[\s\S]*?<\/p>/,
          `<p id="ai-note" class="lede">${escapeHtml(note)}</p>`,
        );
    upsertSiteFile(companyId, companyName, {
      path: "index.html",
      content: withBanner,
      mime: "text/html",
    });
  }
  if (css && /farb|color|dunkel|dark|hell|light|blau|rot|grün/i.test(note)) {
    const tint = /hell|light|weiß|white/i.test(note)
      ? "#f5f5f5"
      : /blau|blue/i.test(note)
        ? "#0c1222"
        : "#0a0a0a";
    const fg = tint === "#f5f5f5" ? "#0a0a0a" : "#fafafa";
    upsertSiteFile(companyId, companyName, {
      path: "styles.css",
      content: css.content
        .replace(/background:#[0-9a-fA-F]{3,8}/, `background:${tint}`)
        .replace(/color:#[0-9a-fA-F]{3,8}/, `color:${fg}`),
      mime: "text/css",
    });
  }
  return getOrCreateSiteWorkspace(companyId, companyName);
}
