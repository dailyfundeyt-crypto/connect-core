/*
 * Connect Shell – Fenster-Logik (geteilt von background.js und sidebar.js)
 *
 * - openWindow(url): Link/App als NEUEN TAB im zuletzt benutzten normalen Helium-Fenster öffnen (fehlt
 *   eins: neues normales Fenster). Gibt es schon einen Tab mit dieser Seite (gleicher Host,
 *   Pfad-Präfix), werden Tab + Fenster nach vorne geholt statt dupliziert.
 *   Der Connect-Tab/-App-Fenster wird nie überschrieben.
 * - ensureConnectApp(): sorgt dafür, dass das Connect-App-Fenster (ohne Adressleiste) existiert.
 *   Erkannt wird ein Fenster vom Typ "app"/"popup" mit Connect (localhost:3101). Fehlt es, wird es per
 *   chrome.windows.create({ type: "popup" }) erzeugt (ebenfalls ohne Adressleiste).
 */
self.ConnectShellWindows = (() => {
  "use strict";
  const cfg = self.CONNECT_SHELL_CONFIG || {};
  const CONNECT = (cfg.connectUrl || cfg.startUrl || "http://localhost:3101").replace(/\/$/, "");
  const APP_TYPES = ["app", "popup"];

  const parse = (u) => { try { return new URL(u); } catch { return null; } };
  const normHost = (h) => (h === "127.0.0.1" ? "localhost" : h).replace(/^www\./, "");
  function sameTarget(current, target) {
    const a = parse(current), b = parse(target);
    if (!a || !b) return false;
    if (normHost(a.hostname) !== normHost(b.hostname) || a.port !== b.port) return false;
    const bp = b.pathname.replace(/\/$/, "");
    return bp === "" || a.pathname === bp || a.pathname.startsWith(bp + "/");
  }
  const tabUrl = (t) => (t && (t.url || t.pendingUrl)) || "";
  const isConnectUrl = (u) => sameTarget(u || "", CONNECT + "/");

  async function allWindows() {
    return chrome.windows.getAll({ populate: true, windowTypes: ["normal", "popup", "app"] });
  }

  /** Connect-Tab finden: bevorzugt im App-/Popup-Fenster, sonst irgendein Connect-Tab. */
  async function findConnectTab() {
    const wins = await allWindows();
    let fallback = null;
    for (const w of wins) {
      for (const t of w.tabs || []) {
        if (!isConnectUrl(tabUrl(t))) continue;
        if (APP_TYPES.includes(w.type)) return { tab: t, window: w, app: true };
        if (!fallback) fallback = { tab: t, window: w, app: false };
      }
    }
    return fallback;
  }

  /** Fenster sichtbar machen und nach vorne holen (auch wenn minimiert). */
  async function focusWindow(win) {
    if (!win) return;
    if (win.state === "minimized") await chrome.windows.update(win.id, { state: "normal" });
    await chrome.windows.update(win.id, { focused: true });
  }

  /** Zuletzt benutztes NORMALES Helium-Fenster (nie das Connect-App-/Popup-Fenster). */
  async function targetNormalWindow() {
    try {
      const last = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
      if (last && last.type === "normal") return last;
    } catch { /* kein normales Fenster */ }
    const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
    return wins.find((w) => w.type === "normal") || null;
  }

  /**
   * App/Link als NEUEN TAB in einem normalen Helium-Fenster öffnen. Gibt es den Tab schon
   * (gleicher Host + Pfad-Präfix), werden Tab und Fenster nach vorne geholt. Gibt es kein normales
   * Fenster, wird eins erzeugt. forceNew (Strg-Klick in der Sidebar) = immer eigenes neues Fenster.
   */
  async function openWindow(url, { forceNew = false } = {}) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("Ungültige URL");
    if (isConnectUrl(url)) return openConnect(url);
    if (forceNew) {
      const w = await chrome.windows.create({ url, type: "normal", focused: true });
      return { created: w && w.id, mode: "window" };
    }
    const tabs = await chrome.tabs.query({});
    const hit = tabs.find((t) => !isConnectUrl(tabUrl(t)) && sameTarget(tabUrl(t), url));
    if (hit) {
      await chrome.tabs.update(hit.id, { active: true });
      await focusWindow(await chrome.windows.get(hit.windowId));
      return { focused: hit.id, windowId: hit.windowId, mode: "focus" };
    }
    const win = await targetNormalWindow();
    if (win) {
      const tab = await chrome.tabs.create({ windowId: win.id, url, active: true });
      await focusWindow(win);
      return { tab: tab && tab.id, windowId: win.id, mode: "tab" };
    }
    const w = await chrome.windows.create({ url, type: "normal", focused: true });
    return { created: w && w.id, mode: "window" };
  }

  // ---------------------------------------------------------------------------------------------
  // Split-Link: zwei URLs nebeneinander (linke / rechte Bildschirmhälfte).
  // Chromiums natives Split-View (zwei Tabs in einem Fenster) hat keine Extension-API zum Anlegen
  // (nur das read-only Feld tab.splitViewId) -> zwei normale Fenster, per chrome.system.display
  // auf die Arbeitsfläche (ohne Taskleiste) gekachelt.
  // ---------------------------------------------------------------------------------------------

  /** Arbeitsfläche des Bildschirms, auf dem das zuletzt benutzte Fenster liegt (sonst primär). */
  async function workArea() {
    let ref = null;
    try { ref = await chrome.windows.getLastFocused(); } catch { /* none */ }
    let displays = [];
    try { displays = await chrome.system.display.getInfo(); } catch { /* API fehlt */ }
    if (displays.length) {
      const cx = ref && ref.left != null ? ref.left + (ref.width || 0) / 2 : null;
      const cy = ref && ref.top != null ? ref.top + (ref.height || 0) / 2 : null;
      const hit = cx == null ? null : displays.find((d) => {
        const b = d.bounds;
        return cx >= b.left && cx < b.left + b.width && cy >= b.top && cy < b.top + b.height;
      });
      const d = hit || displays.find((x) => x.isPrimary) || displays[0];
      return { ...d.workArea };
    }
    // Fallback: Fenstergröße des letzten Fensters
    return { left: (ref && ref.left) || 0, top: (ref && ref.top) || 0, width: (ref && ref.width) || 1600, height: (ref && ref.height) || 900 };
  }

  /** Eine Hälfte belegen: vorhandenen Tab wiederverwenden (eigenes Fenster), sonst neues Fenster. */
  // Merkt sich pro Split-URL den Tab (Seiten leiten oft um, z. B. notion.so -> notion.com, dann passt
  // der URL-Vergleich beim zweiten Klick nicht mehr).
  const memKey = (url) => "connectShell.split:" + url;
  async function rememberedTab(url) {
    try {
      const id = (await chrome.storage.session.get(memKey(url)))[memKey(url)];
      return id ? await chrome.tabs.get(id) : null;
    } catch { return null; }
  }
  const remember = (url, tabId) => (tabId ? chrome.storage.session.set({ [memKey(url)]: tabId }).catch(() => {}) : Promise.resolve());

  async function placeInBounds(url, bounds, splitKey) {
    const r = await placeInBoundsInner(url, bounds, splitKey);
    await remember(url, r.tabId);
    return r;
  }

  async function placeInBoundsInner(url, bounds, splitKey) {
    const tabs = await chrome.tabs.query({});
    const hit = (await rememberedTab(url)) || tabs.find((t) => !isConnectUrl(tabUrl(t)) && sameTarget(tabUrl(t), url));
    if (hit) {
      const win = await chrome.windows.get(hit.windowId, { populate: true });
      if (win.type === "normal" && (win.tabs || []).length === 1) {
        if (win.state !== "normal") await chrome.windows.update(win.id, { state: "normal" });
        await chrome.windows.update(win.id, { ...bounds, focused: true });
        await chrome.tabs.update(hit.id, { active: true });
        return { windowId: win.id, tabId: hit.id, reused: true };
      }
      // Tab liegt in einem Fenster mit anderen Tabs: in ein eigenes Fenster für den Split holen.
      const moved = await chrome.windows.create({ tabId: hit.id, type: "normal", focused: true, ...bounds });
      return { windowId: moved.id, tabId: hit.id, reused: true, moved: true };
    }
    const w = await chrome.windows.create({ url, type: "normal", focused: true, state: "normal", ...bounds });
    // Manche Builds ignorieren Bounds beim Erzeugen -> einmal nachziehen.
    try { await chrome.windows.update(w.id, { ...bounds }); } catch { /* ignore */ }
    return { windowId: w.id, tabId: w.tabs && w.tabs[0] && w.tabs[0].id, reused: false, splitKey };
  }

  async function openSplit(leftUrl, rightUrl) {
    for (const u of [leftUrl, rightUrl]) {
      if (typeof u !== "string" || !/^https?:\/\//i.test(u)) throw new Error("Ungültige URL");
    }
    const a = await workArea();
    const half = Math.floor(a.width / 2);
    const leftB = { left: a.left, top: a.top, width: half, height: a.height };
    const rightB = { left: a.left + half, top: a.top, width: a.width - half, height: a.height };
    const left = await placeInBounds(leftUrl, leftB, "left");
    const right = await placeInBounds(rightUrl, rightB, "right");
    // Windows verschiebt frisch erzeugte Fenster gelegentlich (Kaskade) -> Grenzen kurz danach nachziehen.
    await new Promise((r) => setTimeout(r, 400));
    for (const [p, b] of [[left, leftB], [right, rightB]]) {
      try { await chrome.windows.update(p.windowId, { ...b }); } catch { /* Fenster schon zu */ }
    }
    try { await chrome.windows.update(right.windowId, { focused: true }); await chrome.windows.update(left.windowId, { focused: true }); } catch { /* ignore */ }
    return { mode: "split", left, right, workArea: a };
  }

  /** Connect-Route im Connect-App-Fenster öffnen (fehlt es: neues App-Fenster ohne Adressleiste). */
  async function openConnect(url) {
    const found = await findConnectTab();
    if (found) {
      await chrome.tabs.update(found.tab.id, { url, active: true });
      await chrome.windows.update(found.window.id, { focused: true });
      return { tab: found.tab.id };
    }
    const nw = await targetNormalWindow(); /* connect-app: Tab statt Popup */ if (nw) { const t = await chrome.tabs.create({ windowId: nw.id, url, active: true }); await focusWindow(nw); return { tab: t && t.id }; } const w = await chrome.windows.create({ url, type: "normal", focused: true });
    return { created: w && w.id };
  }

  let ensuring = false;
  async function ensureConnectApp() {
    if (ensuring) return;
    ensuring = true;
    try {
      const wins = await allWindows();
      const hasApp = wins.some((w) => APP_TYPES.includes(w.type) && (w.tabs || []).some((t) => isConnectUrl(tabUrl(t))));
      if (hasApp) return;
      // Helium-Startseite (manifest chrome_settings_overrides.startup_pages = CONNECT_URL) hat Connect
      // schon als ersten Tab geöffnet -> kein zweites Connect-Fenster.
      const hasTab = wins.some((w) => (w.tabs || []).some((t) => isConnectUrl(tabUrl(t))));
      if (hasTab) return;
      { const nw = await targetNormalWindow(); /* connect-app: Tab statt Popup */ if (nw) await chrome.tabs.create({ windowId: nw.id, url: CONNECT + "/", index: 0, active: false }); else await chrome.windows.create({ url: CONNECT + "/", type: "normal", focused: true }); }
    } finally { ensuring = false; }
  }

  return { CONNECT, sameTarget, isConnectUrl, tabUrl, findConnectTab, openWindow, openConnect, ensureConnectApp, openSplit, workArea };
})();
