// Service Worker: Toolbar-Icon (oder Alt+Shift+S) öffnet die Sidebar; Fenster-Logik siehe open-window.js.
// Build-Wechsel: Helium registriert den Extension-Service-Worker einer per --load-extension geladenen
// Extension NICHT neu, auch wenn sich Version und background.js ändern (getestet, Helium 0.18.2.1) – der
// alte Code läuft weiter. Darum zeigt manifest.json auf einen versionierten Lader "sw-<version>.js"
// (nur importScripts("background.js")); neuer Dateiname = neue Registrierung = frischer Code.
// Bei JEDER Änderung an background.js, open-window.js, session-save.js oder tabs.config.js:
//   SHELL_BUILD hier + "version" in manifest.json erhöhen, sw-<alt>.js -> sw-<neu>.js umbenennen und
//   "background.service_worker" anpassen (setup\Set-ConnectUrl.ps1 -Bump erledigt alles).
const SHELL_BUILD = "0.4.19";
importScripts("tabs.config.js", "open-window.js", "session-save.js");
// Neue Extension-Version sofort aktiv schalten (sonst wartet der neue Service Worker, bis der alte endet,
// und Helium führt weiter den alten Code aus).
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
const W = self.ConnectShellWindows;
const S = self.ConnectShellSession;
S.install();

const enablePanelOnAction = () =>
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn("[connect-shell] setPanelBehavior:", err));

// Beim Start kurz warten: ein per --app=... gestartetes Connect-Fenster ist dann schon registriert.
const ensureSoon = (ms) => setTimeout(() => W.ensureConnectApp().catch((e) => console.warn("[connect-shell] ensure:", e)), ms);

// Per --load-extension (Start-Connect) gilt jeder Helium-Start als "install/update" -> onInstalled statt
// onStartup. Daher Wiederherstellung in beiden Fällen (restoreIfMissing tut nichts, wenn schon Webseiten offen sind).
const restoreSoon = () => setTimeout(() => S.restoreIfMissing().then((r) => console.info("[connect-shell] session:", r)).catch((e) => console.warn("[connect-shell] restore:", e)), 7000);
// Einmal pro Helium-Sitzung (chrome.storage.session wird beim Beenden geleert) – unabhängig davon, ob
// Helium onStartup/onInstalled feuert (bei --load-extension unzuverlässig, getestet).
const restoreOncePerSession = () =>
  chrome.storage.session.get("connectShell.restoreChecked").then((v) => {
    if (v && v["connectShell.restoreChecked"]) return;
    return chrome.storage.session.set({ "connectShell.restoreChecked": Date.now() }).then(restoreSoon);
  }).catch((e) => console.warn("[connect-shell] restore check:", e));
restoreOncePerSession();
chrome.runtime.onInstalled.addListener(() => { enablePanelOnAction(); ensureSoon(3000); });
chrome.runtime.onStartup.addListener(() => {
  enablePanelOnAction();
  ensureSoon(3000);
  // Tabs der letzten Sitzung zurückholen, falls Helium sie nicht selbst wiederhergestellt hat
  // (Connect ist schon da: Startseite bzw. App-Fenster -> wiederhergestellte Tabs kommen danach).
  restoreOncePerSession();
});
enablePanelOnAction();

// Vom Nutzer geöffnetes normales Fenster: Connect-App-Fenster sicherstellen (kein gepinnter localhost-Tab).
chrome.windows.onCreated.addListener((win) => { if (win && win.type === "normal") ensureSoon(1500); });

// chrome.commands: Ctrl+Shift+C / Alt+Shift+S -> open sidebar action
// Ctrl+Shift+Y -> open Helium+Connect tab (replaces old floating-notch shortcut)
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-floating-bar") {
    // Open (or focus) the Helium+Connect web app on localhost:3101
    const url = (self.CONNECT_SHELL_CONFIG || {}).connectUrl || "http://localhost:3101";
    W.openConnect(url + "/").catch((e) => console.warn("[connect-shell] open-helium:", e));
  }
});

// Nachrichten von connect-bridge.js (Helium+Connect) und der Sidebar
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return false;
  const reply = (p) => p
    .then((r) => sendResponse({ ok: true, build: SHELL_BUILD, ...r }))
    .catch((e) => sendResponse({ ok: false, build: SHELL_BUILD, error: String((e && e.message) || e) }));
  if (msg.type === "open-window") { reply(W.openWindow(msg.url, { forceNew: !!msg.forceNew })); return true; }
  if (msg.type === "open-split") { reply(W.openSplit(msg.left, msg.right)); return true; }
  if (msg.type === "session-save") { reply(S.save().then(() => S.read()).then((s) => ({ session: s }))); return true; }
  if (msg.type === "session-restore") { reply(S.restoreIfMissing()); return true; }
  if (msg.type === "open-connect-notch") {
    // Open the legacy white Connect-Notch in a small popup
    chrome.windows.create({
      url: (self.CONNECT_SHELL_CONFIG || {}).connectUrl + "/notch",
      type: "popup",
      width: 360,
      height: 480,
      left: Math.round((screen.availWidth - 360) / 2),
      top: 0,
    }).catch((e) => console.warn("[connect-shell] open-connect-notch:", e));
    return false;
  }
  if (msg.type === "open-companies-sheet") {
    // Open the companies sheet in the Connect app window
    chrome.tabs.query({ url: ["http://localhost:3101/*", "http://127.0.0.1:3101/*", "http://localhost:3010/*"] }, (tabs) => {
      if (tabs && tabs.length) {
        const target = tabs[0];
        chrome.tabs.update(target.id, { active: true }).catch(() => {});
        chrome.windows.update(target.windowId, { focused: true }).catch(() => {});
        // Tell the Connect page to open companies sheet via DOM event
        chrome.tabs.sendMessage(target.id, { type: "open-companies-sheet" }).catch(() => {});
      }
    });
    return false;
  }
  return false;
});
