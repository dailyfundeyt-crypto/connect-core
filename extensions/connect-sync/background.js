/*
 * Connect Sync – Service Worker.
 * Verbindet sich NUR mit der lokalen Connect App (http://127.0.0.1:3101), koppelt sich dort einmal
 * automatisch (Token vom lokalen Endpunkt /api/helium-sync/pair), meldet Fenster/Tabs und führt die
 * erlaubten Befehle aus. Kein Code in Webseiten, keine anderen Server.
 */
const BASE = "http://127.0.0.1:3101/api/helium-sync";
const VERSION = chrome.runtime.getManifest().version;
const ACTIONS = new Set(["open", "close", "activate", "reload", "navigate", "focusWindow", "screenshot"]);
const MAX_BACKOFF = 60_000;

let token = null;
let clientId = null;
let running = false;
let backoff = 1_000;
let status = { state: "start", detail: "", since: Date.now(), lastOk: 0, commands: 0 };

function setStatus(state, detail = "") {
  if (status.state !== state || status.detail !== detail) status = { ...status, state, detail, since: Date.now() };
  if (state === "verbunden") status.lastOk = Date.now();
  chrome.storage.session?.set({ status }).catch(() => {});
  const badge = state === "verbunden" ? "" : state === "koppeln" ? "…" : "!";
  chrome.action.setBadgeText({ text: badge }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: state === "verbunden" ? "#10b981" : "#f59e0b" }).catch(() => {});
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Only ever talks to 127.0.0.1:3101 – the URL is fixed, nothing from outside can change it. */
async function call(path, { method = "GET", body, timeout = 12_000 } = {}) {
  const url = BASE + path;
  if (!url.startsWith("http://127.0.0.1:3101/")) throw new Error("nur localhost");
  const response = await fetch(url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
    credentials: "omit",
  });
  if (response.status === 401) {
    token = null;
    await chrome.storage.local.remove("token");
    throw new Error("Kopplung abgelaufen");
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function ensureClient() {
  if (clientId) return clientId;
  const stored = await chrome.storage.local.get("clientId");
  clientId = stored.clientId || crypto.randomUUID();
  if (!stored.clientId) await chrome.storage.local.set({ clientId });
  return clientId;
}

async function ensureToken() {
  await ensureClient();
  if (token) return;
  const stored = await chrome.storage.local.get("token");
  if (stored.token) {
    token = stored.token;
    return;
  }
  setStatus("koppeln", "hole Kopplung von Connect …");
  const result = await call("/pair", { method: "POST", body: { client: clientId } });
  if (typeof result.token !== "string") throw new Error("keine Kopplung");
  token = result.token;
  await chrome.storage.local.set({ token });
}

// ---------------------------------------------------------------- snapshot

function cleanFavicon(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) && url.length <= 600 ? url : undefined;
}

async function snapshot() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal", "app", "popup"] });
  const list = [];
  const tabs = [];
  for (const win of windows) {
    if (win.incognito) continue;
    list.push({ id: win.id, focused: win.focused, type: win.type });
    for (const tab of win.tabs ?? []) {
      tabs.push({
        id: tab.id,
        windowId: tab.windowId,
        index: tab.index,
        title: tab.title ?? "",
        url: tab.url ?? tab.pendingUrl ?? "",
        favIconUrl: cleanFavicon(tab.favIconUrl),
        active: tab.active,
        pinned: tab.pinned || undefined,
        audible: tab.audible || undefined,
      });
    }
  }
  const brand = navigator.userAgentData?.brands?.find((entry) => !/Not.?A.?Brand|Chromium/i.test(entry.brand))?.brand;
  return { clientId: await ensureClient(), windows: list, tabs, browser: brand || "Helium", version: VERSION };
}

let reportTimer = null;
let reporting = false;
let reportAgain = false;
function scheduleReport(delay = 350) {
  if (reportTimer) return;
  reportTimer = setTimeout(() => {
    reportTimer = null;
    void report();
  }, delay);
}

async function report() {
  if (reporting) {
    reportAgain = true;
    return;
  }
  reporting = true;
  try {
    await ensureToken();
    await call("/state", { method: "POST", body: await snapshot() });
  } catch {
    /* the loop reconnects */
  } finally {
    reporting = false;
    if (reportAgain) {
      reportAgain = false;
      scheduleReport();
    }
  }
}

// ---------------------------------------------------------------- commands

function httpUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
const isId = (value) => Number.isInteger(value) && value >= 0;

async function execute(command) {
  const { action, args = {} } = command;
  if (!ACTIONS.has(action)) throw new Error("Aktion nicht erlaubt");
  switch (action) {
    case "open": {
      const url = httpUrl(args.url);
      if (!url) throw new Error("Nur http(s)-Adressen");
      const tab = await chrome.tabs.create({ url, active: true, ...(isId(args.windowId) ? { windowId: args.windowId } : {}) });
      return { tabId: tab.id };
    }
    case "navigate": {
      const url = httpUrl(args.url);
      if (!url || !isId(args.tabId)) throw new Error("Tab oder Adresse fehlt");
      await chrome.tabs.update(args.tabId, { url });
      return { tabId: args.tabId };
    }
    case "close":
      if (!isId(args.tabId)) throw new Error("Tab fehlt");
      await chrome.tabs.remove(args.tabId);
      return {};
    case "activate": {
      if (!isId(args.tabId)) throw new Error("Tab fehlt");
      const tab = await chrome.tabs.update(args.tabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return {};
    }
    case "reload":
      if (!isId(args.tabId)) throw new Error("Tab fehlt");
      await chrome.tabs.reload(args.tabId);
      return {};
    case "focusWindow":
      if (!isId(args.windowId)) throw new Error("Fenster fehlt");
      await chrome.windows.update(args.windowId, { focused: true });
      return {};
    case "screenshot": {
      const granted = await chrome.permissions.contains({ origins: ["<all_urls>"] });
      if (!granted) throw new Error("Screenshots sind in Connect Sync nicht erlaubt (Symbol der Erweiterung → „Screenshots erlauben“).");
      let windowId = isId(args.windowId) ? args.windowId : undefined;
      if (windowId === undefined) {
        const focused = await chrome.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => null);
        windowId = focused?.id;
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 45 });
      return { dataUrl };
    }
  }
}

async function runCommand(command) {
  let payload;
  try {
    payload = { id: command.id, ok: true, result: await execute(command) };
    status.commands += 1;
  } catch (error) {
    payload = { id: command.id, ok: false, error: String(error?.message ?? error).slice(0, 300) };
  }
  await call("/result", { method: "POST", body: payload, timeout: 20_000 }).catch(() => {});
  scheduleReport(200);
}

// ---------------------------------------------------------------- loop

async function loop() {
  if (running) return;
  running = true;
  // Extension API calls keep the MV3 service worker alive while connected.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo().catch(() => {}), 20_000);
  try {
    let reported = false;
    while (true) {
      try {
        await ensureToken();
        if (!reported) {
          await call("/state", { method: "POST", body: await snapshot() });
          reported = true;
        }
        setStatus("verbunden");
        backoff = 1_000;
        const { commands = [], primary } = await call(`/poll?client=${encodeURIComponent(clientId)}`, { timeout: 15_000 });
        if (primary !== false && status.primary === false) scheduleReport(0);
        status.primary = primary !== false;
        for (const command of commands) void runCommand(command);
      } catch (error) {
        reported = false;
        const message = String(error?.message ?? error);
        setStatus("getrennt", /Failed to fetch|NetworkError|TimeoutError|aborted/i.test(message) ? "Connect App (127.0.0.1:3101) nicht erreichbar" : message);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
      }
    }
  } finally {
    clearInterval(keepAlive);
    running = false;
  }
}

function start() {
  void loop();
}

chrome.runtime.onStartup.addListener(start);
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("connect-sync-tick", { periodInMinutes: 0.5 });
  start();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "connect-sync-tick") start();
});
chrome.alarms.get("connect-sync-tick").then((alarm) => {
  if (!alarm) chrome.alarms.create("connect-sync-tick", { periodInMinutes: 0.5 });
});

for (const event of [
  chrome.tabs.onCreated,
  chrome.tabs.onRemoved,
  chrome.tabs.onActivated,
  chrome.tabs.onMoved,
  chrome.tabs.onAttached,
  chrome.tabs.onDetached,
  chrome.tabs.onReplaced,
  chrome.windows.onCreated,
  chrome.windows.onRemoved,
  chrome.windows.onFocusChanged,
]) {
  event.addListener(() => {
    start();
    scheduleReport();
  });
}
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.title || change.favIconUrl || change.status === "complete" || change.pinned !== undefined || change.audible !== undefined) {
    start();
    scheduleReport();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "status") {
    sendResponse({ status, paired: Boolean(token) });
    return false;
  }
  if (message?.type === "reconnect") {
    backoff = 1_000;
    start();
    scheduleReport(0);
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "unpair") {
    token = null;
    chrome.storage.local.remove("token").then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

start();
