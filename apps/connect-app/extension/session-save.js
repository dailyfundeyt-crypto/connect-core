/*
 * Connect Shell – Tab-Sitzungen automatisch sichern (chrome.storage.local "connectShell.session").
 *
 * - Bei jeder Tab-/Fensteränderung (entprellt) wird ein Snapshot aller NORMALEN Helium-Fenster mit
 *   ihren http(s)-Tabs gespeichert (Connect-App-Fenster und Connect-Tabs ausgenommen).
 * - Ein leerer Zustand überschreibt nie einen gespeicherten (Herunterfahren schließt Fenster einzeln).
 *   Beim Schließen eines ganzen Fensters wird der Snapshot erst nach 4 s aktualisiert – endet Helium
 *   in dieser Zeit, bleibt der letzte vollständige Stand erhalten.
 * - Start: Hat Helium nach ~7 s keine normalen Fenster mit Webseiten wiederhergestellt
 *   (Einstellung "Zuletzt geöffnete Seiten öffnen" aus), stellt die Extension den Snapshot her.
 *   Abschalten: tabs.config.js -> restoreSession: false.
 */
self.ConnectShellSession = (() => {
  "use strict";
  const KEY = "connectShell.session";
  const W = self.ConnectShellWindows;
  const cfg = self.CONNECT_SHELL_CONFIG || {};
  const MAX_TABS = 200;
  let timer = null;
  let restoring = false;

  const isWeb = (u) => /^https?:\/\//i.test(u || "");

  async function snapshot() {
    const wins = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
    const out = [];
    let count = 0;
    for (const w of wins) {
      if (w.type !== "normal" || w.incognito) continue;
      const tabs = (w.tabs || [])
        .map((t) => ({ url: W.tabUrl(t), pinned: !!t.pinned, active: !!t.active }))
        .filter((t) => isWeb(t.url) && !W.isConnectUrl(t.url));
      if (!tabs.length) continue;
      count += tabs.length;
      if (count > MAX_TABS) break;
      out.push({
        state: w.state,
        bounds: w.state === "normal" ? { left: w.left, top: w.top, width: w.width, height: w.height } : undefined,
        tabs,
      });
    }
    return out;
  }

  async function save() {
    if (restoring) return;
    const windows = await snapshot();
    if (!windows.length) return; // nie mit leerem Zustand überschreiben
    await chrome.storage.local.set({ [KEY]: { savedAt: new Date().toISOString(), windows } });
  }

  function schedule(ms = 1500) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; save().catch((e) => console.warn("[connect-shell] session save:", e)); }, ms);
  }

  async function restoreIfMissing() {
    if (cfg.restoreSession === false) return { skipped: "disabled" };
    const data = (await chrome.storage.local.get(KEY))[KEY];
    if (!data || !Array.isArray(data.windows) || !data.windows.length) return { skipped: "no snapshot" };
    const current = await snapshot();
    if (current.length) return { skipped: "helium restored tabs itself" };
    restoring = true;
    try {
      for (const w of data.windows) {
        const urls = w.tabs.map((t) => t.url);
        const created = await chrome.windows.create({ url: urls, type: "normal", focused: false, ...(w.bounds || {}) });
        if (w.state === "maximized") await chrome.windows.update(created.id, { state: "maximized" }).catch(() => {});
        for (let i = 0; i < w.tabs.length; i++) {
          const tab = created.tabs && created.tabs[i];
          if (!tab) continue;
          if (w.tabs[i].pinned) await chrome.tabs.update(tab.id, { pinned: true }).catch(() => {});
          if (w.tabs[i].active) await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
        }
      }
      return { restored: data.windows.length };
    } finally {
      restoring = false;
      schedule(2000);
    }
  }

  function install() {
    chrome.tabs.onCreated.addListener(() => schedule());
    chrome.tabs.onUpdated.addListener((_id, info) => { if (info.url || info.pinned !== undefined || info.status === "complete") schedule(); });
    chrome.tabs.onRemoved.addListener((_id, info) => { if (!info.isWindowClosing) schedule(); });
    chrome.tabs.onMoved.addListener(() => schedule());
    chrome.tabs.onAttached.addListener(() => schedule());
    chrome.tabs.onDetached.addListener(() => schedule());
    chrome.tabs.onActivated.addListener(() => schedule(3000));
    chrome.windows.onRemoved.addListener(() => schedule(4000));
    chrome.windows.onBoundsChanged && chrome.windows.onBoundsChanged.addListener(() => schedule(3000));
  }

  async function read() { return (await chrome.storage.local.get(KEY))[KEY] || null; }

  return { install, save, schedule, restoreIfMissing, read, snapshot };
})();
