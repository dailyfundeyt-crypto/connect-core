/**
 * Outside Connect Desktop (WPF / WebView2) a Lab app never replaces the Connect view and never
 * loads in an iframe (most sites block framing via X-Frame-Options / CSP). It opens as a NEW TAB
 * in a normal Helium window; Connect stays exactly as it is in its own app window.
 *
 * - Helium with the Connect Shell extension (apps/helium-shell): its content script
 *   `connect-bridge.js` marks `<html data-connect-shell="1">`, forwards this message to the
 *   extension (chrome.tabs.create in the last normal window, or focus an existing tab with that
 *   URL) and answers with `connect-shell-opened`.
 * - No answer (extension missing / reloaded) or any other browser: `window.open(url, "_blank")`,
 *   which Chromium opens as a tab in a normal window — also from an --app window.
 */

const OPEN_WINDOW_MESSAGE = "connect-shell-open-window";
const OPENED_MESSAGE = "connect-shell-opened";
/** Stays well inside the ~5 s user-activation window, so the fallback is not popup-blocked. */
const BRIDGE_TIMEOUT_MS = 1500;

export function hasConnectShell(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.connectShell === "1"
  );
}

function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function openWithBrowser(target: string) {
  window.open(target, "_blank", "noopener,noreferrer");
}

/**
 * Opens `url` as a new Helium tab (or focuses the tab that already shows it).
 * Returns false for an empty URL. Never navigates the Connect view.
 */
export function openInHeliumTab(url: string, options: { forceNew?: boolean } = {}): boolean {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw || typeof window === "undefined") return false;
  const target = withProtocol(raw);

  if (!hasConnectShell()) {
    openWithBrowser(target);
    return true;
  }

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let settled = false;
  const finish = (ok: boolean) => {
    if (settled) return;
    settled = true;
    window.removeEventListener("message", onReply);
    window.clearTimeout(timer);
    if (!ok) openWithBrowser(target);
  };
  const onReply = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const d = event.data as { source?: string; type?: string; id?: string; ok?: boolean } | null;
    if (!d || d.source !== "connect-shell" || d.type !== OPENED_MESSAGE || d.id !== id) return;
    finish(Boolean(d.ok));
  };
  window.addEventListener("message", onReply);
  const timer = window.setTimeout(() => finish(false), BRIDGE_TIMEOUT_MS);
  window.postMessage(
    { source: "connect-app", type: OPEN_WINDOW_MESSAGE, url: target, id, forceNew: Boolean(options.forceNew) },
    window.location.origin,
  );
  return true;
}

/** True when the loaded Connect Shell extension (>= 0.4.0) can tile split links itself. */
export function shellSupportsSplit(): boolean {
  if (!hasConnectShell()) return false;
  const features = document.documentElement.dataset.connectShellFeatures ?? "";
  return features.split(/[\s,]+/).includes("split");
}

type Half = { left: number; top: number; width: number; height: number };

function screenHalves(): [Half, Half] {
  const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
  const x = scr.availLeft ?? 0;
  const y = scr.availTop ?? 0;
  const w = scr.availWidth || 1600;
  const h = scr.availHeight || 900;
  const half = Math.floor(w / 2);
  return [
    { left: x, top: y, width: half, height: h },
    { left: x + half, top: y, width: w - half, height: h },
  ];
}

function openHalf(url: string, name: string, b: Half): boolean {
  let win: Window | null = null;
  try {
    win = window.open(url, name, `popup,left=${b.left},top=${b.top},width=${b.width},height=${b.height}`);
  } catch {
    win = null;
  }
  if (!win) return false;
  try {
    win.opener = null;
  } catch {
    /* cross-origin already */
  }
  return true;
}

const SPLIT_PROMPT_ID = "connect-split-prompt";

/**
 * Chromium allows ONE popup per click. When the browser blocked a half, show a small card whose
 * buttons are a fresh click (= a new user activation), so the missing half always opens.
 */
function showSplitPrompt(missing: { url: string; name: string; half: Half; label: string }[]) {
  document.getElementById(SPLIT_PROMPT_ID)?.remove();
  if (!missing.length) return;
  const card = document.createElement("div");
  card.id = SPLIT_PROMPT_ID;
  card.setAttribute("role", "dialog");
  card.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:340px;padding:12px 14px;" +
    "border-radius:12px;background:#111827;color:#f9fafb;font:13px/1.4 system-ui,sans-serif;" +
    "box-shadow:0 10px 30px rgba(0,0,0,.35)";
  const text = document.createElement("div");
  text.textContent =
    "Split-Link: Der Browser hat ein Fenster blockiert. Klick zum Öffnen – oder Pop-ups für diese Seite " +
    "erlauben (Adressleiste › Pop-up-Symbol › „Immer zulassen“).";
  card.appendChild(text);
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap";
  const close = () => card.remove();
  for (const m of missing) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${m.label} öffnen`;
    btn.style.cssText =
      "padding:6px 10px;border-radius:8px;border:0;background:#10b981;color:#052e16;font-weight:600;cursor:pointer";
    btn.onclick = () => {
      openHalf(m.url, m.name, m.half);
      btn.remove();
      if (!row.querySelector("button[data-half]")) close();
    };
    btn.dataset.half = m.name;
    row.appendChild(btn);
  }
  const x = document.createElement("button");
  x.type = "button";
  x.textContent = "Schließen";
  x.style.cssText =
    "padding:6px 10px;border-radius:8px;border:1px solid #374151;background:transparent;color:#d1d5db;cursor:pointer";
  x.onclick = close;
  row.appendChild(x);
  card.appendChild(row);
  document.body.appendChild(card);
  window.setTimeout(close, 20000);
}

/** Without the extension: two half-screen popup windows; a blocked half gets a click-to-open card. */
function openSplitFallback(a: string, b: string) {
  const [l, r] = screenHalves();
  const okLeft = openHalf(a, "connect-split-left", l);
  const okRight = openHalf(b, "connect-split-right", r);
  const missing: { url: string; name: string; half: Half; label: string }[] = [];
  if (!okLeft) missing.push({ url: a, name: "connect-split-left", half: l, label: "Linke Seite" });
  if (!okRight) missing.push({ url: b, name: "connect-split-right", half: r, label: "Rechte Seite" });
  showSplitPrompt(missing);
}

/**
 * Split-Link: opens `left` and `right` side by side (left / right half of the screen).
 * - Connect Shell extension >= 0.4.0 (marks `data-connect-shell-features="split"`): message
 *   `connect-shell-open-split` → two normal Helium windows tiled on the work area (existing tabs reused).
 * - Otherwise (no extension, or an older one still loaded): immediately, inside the click, two
 *   half-screen `window.open` popups; if the popup blocker stops one, a card offers a click to open it.
 */
export function openSplitInHelium(left: string, right: string): boolean {
  const l = typeof left === "string" ? left.trim() : "";
  const r = typeof right === "string" ? right.trim() : "";
  if (!l || !r || typeof window === "undefined") return false;
  const a = withProtocol(l);
  const b = withProtocol(r);

  if (!shellSupportsSplit()) {
    openSplitFallback(a, b);
    return true;
  }
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let settled = false;
  const finish = (ok: boolean) => {
    if (settled) return;
    settled = true;
    window.removeEventListener("message", onReply);
    window.clearTimeout(timer);
    if (!ok) openSplitFallback(a, b);
  };
  const onReply = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const d = event.data as { source?: string; type?: string; id?: string; ok?: boolean } | null;
    if (!d || d.source !== "connect-shell" || d.type !== OPENED_MESSAGE || d.id !== id) return;
    finish(Boolean(d.ok));
  };
  window.addEventListener("message", onReply);
  const timer = window.setTimeout(() => finish(false), BRIDGE_TIMEOUT_MS + 1000);
  window.postMessage(
    { source: "connect-app", type: "connect-shell-open-split", left: a, right: b, id },
    window.location.origin,
  );
  return true;
}

/** @deprecated Old name — Lab apps now open as tabs. */
export const openInNewBrowserWindow = openInHeliumTab;
