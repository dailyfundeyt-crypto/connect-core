/**
 * Connect Sync (Helium-Erweiterung) ↔ lokaler Connect-Server: Zustand im Prozess.
 * Die Erweiterung meldet Fenster/Tabs und holt Befehle per Long-Poll ab; der PC-Worker
 * (pc-bridge/worker.ts) spiegelt den Stand in die Online-Datenbank und reicht Befehle vom Handy durch.
 */
import type { HeliumAction, HeliumArgs, HeliumResult, HeliumTab, HeliumWindow } from "../pc-bridge/helium-store";

export type ExtensionCommand = { id: string; action: HeliumAction; args: HeliumArgs };

type Snapshot = { windows: HeliumWindow[]; tabs: HeliumTab[]; browser: string | null; version: string | null; at: number };

const LIVE_MS = 30_000;
const state = {
  snapshot: { windows: [], tabs: [], browser: null, version: null, at: 0 } as Snapshot,
  lastSeen: 0,
  polling: 0,
  revision: 0,
  queue: [] as ExtensionCommand[],
  waiters: new Set<(commands: ExtensionCommand[]) => void>(),
  results: new Map<string, (result: HeliumResult) => void>(),
  executed: 0,
  /** Several browsers may run the extension (Stefans Helium, Connect-Chrome); one is served at a time. */
  primary: null as string | null,
  clients: new Map<string, number>(),
};

/** True when this client is (or becomes) the one whose tabs and commands count. */
export function claimClient(clientId: string | null | undefined): boolean {
  const id = (clientId || "default").slice(0, 64);
  const now = Date.now();
  state.clients.set(id, now);
  const primarySeen = state.primary ? (state.clients.get(state.primary) ?? 0) : 0;
  if (!state.primary || (state.primary !== id && now - primarySeen > LIVE_MS)) {
    if (state.primary !== id) {
      state.primary = id;
      state.queue = [];
    }
  }
  return state.primary === id;
}

export function heliumClients() {
  const now = Date.now();
  return [...state.clients.entries()].filter(([, at]) => now - at < LIVE_MS).map(([id, at]) => ({ id, primary: id === state.primary, lastSeen: new Date(at).toISOString() }));
}
const listeners = new Set<() => void>();

export function touchExtension() {
  const wasLive = extensionLive();
  state.lastSeen = Date.now();
  if (!wasLive) notify();
}

export function extensionLive(): boolean {
  return state.polling > 0 || Date.now() - state.lastSeen < LIVE_MS;
}

function notify() {
  state.revision += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function onHeliumChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const MAX_TABS = 300;
const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const int = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? value : -1);

function cleanFavicon(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 600) return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
}

/** Accepts the extension's report (only plain fields, sizes capped). */
export function setSnapshot(raw: unknown) {
  const input = (raw ?? {}) as { windows?: unknown; tabs?: unknown; browser?: unknown; version?: unknown };
  const windows: HeliumWindow[] = (Array.isArray(input.windows) ? input.windows : [])
    .slice(0, 50)
    .map((w) => w as Record<string, unknown>)
    .filter((w) => int(w.id) >= 0)
    .map((w) => ({ id: int(w.id), focused: w.focused === true, ...(typeof w.type === "string" ? { type: str(w.type, 20) } : {}) }));
  const tabs: HeliumTab[] = (Array.isArray(input.tabs) ? input.tabs : [])
    .slice(0, MAX_TABS)
    .map((t) => t as Record<string, unknown>)
    .filter((t) => int(t.id) >= 0 && int(t.windowId) >= 0)
    .map((t) => {
      const favIconUrl = cleanFavicon(t.favIconUrl);
      return {
        id: int(t.id),
        windowId: int(t.windowId),
        index: Math.max(0, int(t.index)),
        title: str(t.title, 300),
        url: str(t.url, 2048),
        ...(favIconUrl ? { favIconUrl } : {}),
        active: t.active === true,
        ...(t.pinned === true ? { pinned: true } : {}),
        ...(t.audible === true ? { audible: true } : {}),
      };
    });
  state.snapshot = { windows, tabs, browser: str(input.browser, 80) || null, version: str(input.version, 20) || null, at: Date.now() };
  touchExtension();
  notify();
}

export function heliumSnapshot() {
  return {
    live: extensionLive(),
    lastSeen: state.lastSeen ? new Date(state.lastSeen).toISOString() : null,
    revision: state.revision,
    ...state.snapshot,
  };
}

export function heliumStatus() {
  return {
    connected: extensionLive(),
    lastSeen: state.lastSeen ? new Date(state.lastSeen).toISOString() : null,
    browser: state.snapshot.browser,
    version: state.snapshot.version,
    tabs: state.snapshot.tabs.length,
    windows: state.snapshot.windows.length,
    executed: state.executed,
    clients: heliumClients().length,
  };
}

/** Long-poll: resolves with queued commands at once, or after `waitMs` with none. */
export function waitForCommands(waitMs: number, signal?: AbortSignal): Promise<ExtensionCommand[]> {
  touchExtension();
  if (state.queue.length) return Promise.resolve(state.queue.splice(0));
  state.polling += 1;
  return new Promise((resolve) => {
    let done = false;
    const finish = (commands: ExtensionCommand[]) => {
      if (done) return;
      done = true;
      state.polling = Math.max(0, state.polling - 1);
      state.lastSeen = Date.now();
      state.waiters.delete(finish);
      clearTimeout(timer);
      resolve(commands);
    };
    const timer = setTimeout(() => finish([]), waitMs);
    signal?.addEventListener("abort", () => {
      if (!done) finish([]);
    });
    state.waiters.add(finish);
  });
}

export function deliverResult(id: string, result: HeliumResult) {
  touchExtension();
  const resolve = state.results.get(id);
  if (resolve) resolve(result);
}

/** Hands a command to the extension and waits for its answer. */
export function executeInHelium(action: HeliumAction, args: HeliumArgs, timeoutMs = 15_000): Promise<HeliumResult> {
  if (!extensionLive()) return Promise.resolve({ ok: false, error: "Helium ist nicht verbunden (Erweiterung Connect Sync aus oder Helium geschlossen)." });
  const id = (globalThis.crypto as Crypto).randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.results.delete(id);
      state.queue = state.queue.filter((command) => command.id !== id);
      resolve({ ok: false, error: "Helium hat nicht rechtzeitig geantwortet." });
    }, timeoutMs);
    state.results.set(id, (result) => {
      clearTimeout(timer);
      state.results.delete(id);
      state.executed += 1;
      resolve(result);
    });
    const command = { id, action, args };
    const waiter = state.waiters.values().next().value as ((commands: ExtensionCommand[]) => void) | undefined;
    if (waiter) waiter([command]);
    else state.queue.push(command);
  });
}
