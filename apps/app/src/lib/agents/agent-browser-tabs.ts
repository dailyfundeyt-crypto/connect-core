/**
 * Per-Agent Browser Tabs — Persistenz inkl. Favicons.
 *
 * Pipeline (Stefan 05.10.):
 * 1) Lokale Connect App (3101) / Helium meldet Tab + favIconUrl
 * 2) Favicon wird geholt und als data-URL (klein) am Tab gespeichert
 * 3) connect.agent-browser-tabs wandert über Workspace-Sync nach Vercel
 * 4) Handy-Browser-Liste zeigt die gespeicherten Icons (ruhig, ohne Live-Fetch)
 */

import {
  ensureAgentBrowserStarted,
  getAgentBrowserSession,
  subscribeAgentBrowser,
} from "@/lib/agents/agent-browser";

export type AgentTab = {
  id: string;
  url: string;
  title: string;
  /** Gespeichertes Favicon (data-URL oder https). Primär von Helium lokal erfasst. */
  favicon?: string;
  groupId?: string;
  lastActiveAt: string;
  order: number;
};

export type AgentBrowserTabs = {
  agentId: string;
  tabs: AgentTab[];
  activeTabId: string | null;
  groups: AgentTabGroup[];
  lastTabId: string | null;
};

export type AgentTabGroup = {
  id: string;
  label: string;
  color: string;
};

const TABS_KEY = "connect.agent-browser-tabs";
const EVENT = "connect-agent-browser-tabs-changed";
/** Max. Favicon-Größe als data-URL (~48 KB Raw → ~64 KB Base64). */
const MAX_FAVICON_BYTES = 48_000;

type TabStore = Record<string, AgentBrowserTabs>;

function readStore(): TabStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TABS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TabStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: TabStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TABS_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(EVENT));
  void import("@/lib/companies/workspace-sync").then((m) =>
    m.scheduleConnectWorkspacePush(),
  );
}

function emptyTabs(agentId: string): AgentBrowserTabs {
  return {
    agentId,
    tabs: [],
    activeTabId: null,
    lastTabId: null,
    groups: [],
  };
}

export function getAgentTabs(agentId: string): AgentBrowserTabs {
  const store = readStore();
  return store[agentId] ?? emptyTabs(agentId);
}

function setAgentTabs(state: AgentBrowserTabs) {
  const store = readStore();
  store[state.agentId] = state;
  writeStore(store);
}

export function subscribeAgentTabs(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  const offBrowser = subscribeAgentBrowser(onChange);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
    offBrowser();
  };
}

function guessTitle(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 24);
  }
}

/** Leichte CDN-URL als Zwischenlösung, bis Helium das echte Favicon liefert. */
export function guessFaviconUrl(pageUrl: string): string | undefined {
  try {
    const host = new URL(pageUrl).hostname;
    if (!host || host === "localhost" || host.endsWith(".local")) return undefined;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return undefined;
  }
}

export function openAgentTab(
  agentId: string,
  input: { url: string; title?: string; groupId?: string; favicon?: string },
): AgentTab {
  const url = input.url.trim() || "about:blank";
  const now = new Date().toISOString();
  const tabs = getAgentTabs(agentId);
  const existing = tabs.tabs.find((t) => t.url === url);
  if (existing) {
    const mergedFavicon = input.favicon || existing.favicon || guessFaviconUrl(url);
    const updated: AgentBrowserTabs = {
      ...tabs,
      lastTabId: tabs.activeTabId,
      activeTabId: existing.id,
      tabs: tabs.tabs.map((t) =>
        t.id === existing.id
          ? {
              ...t,
              lastActiveAt: now,
              title: input.title?.trim() || t.title,
              favicon: mergedFavicon,
            }
          : t,
      ),
    };
    setAgentTabs(updated);
    const tab = updated.tabs.find((t) => t.id === existing.id) ?? existing;
    void ensureTabFaviconCaptured(agentId, tab.id);
    return tab;
  }
  const id = `t${now}-${Math.random().toString(36).slice(2, 8)}`;
  const tab: AgentTab = {
    id,
    url,
    title: input.title?.trim() || guessTitle(url),
    favicon: input.favicon || guessFaviconUrl(url),
    groupId: input.groupId,
    lastActiveAt: now,
    order: tabs.tabs.length,
  };
  const updated: AgentBrowserTabs = {
    ...tabs,
    tabs: [...tabs.tabs, tab],
    lastTabId: tabs.activeTabId,
    activeTabId: id,
  };
  setAgentTabs(updated);
  void ensureTabFaviconCaptured(agentId, id);
  return tab;
}

export function closeAgentTab(agentId: string, tabId: string) {
  const tabs = getAgentTabs(agentId);
  if (tabs.tabs.length === 0) return;
  const remaining = tabs.tabs.filter((t) => t.id !== tabId);
  let nextActive = tabs.activeTabId;
  if (tabs.activeTabId === tabId) {
    nextActive = remaining[remaining.length - 1]?.id ?? null;
  }
  setAgentTabs({
    ...tabs,
    tabs: remaining,
    activeTabId: nextActive,
    lastTabId:
      tabs.activeTabId === tabId
        ? (remaining[remaining.length - 1]?.id ?? null)
        : tabs.lastTabId,
  });
}

export function focusAgentTab(agentId: string, tabId: string) {
  const tabs = getAgentTabs(agentId);
  if (!tabs.tabs.some((t) => t.id === tabId)) return;
  setAgentTabs({
    ...tabs,
    lastTabId: tabs.activeTabId,
    activeTabId: tabId,
    tabs: tabs.tabs.map((t) =>
      t.id === tabId ? { ...t, lastActiveAt: new Date().toISOString() } : t,
    ),
  });
  void ensureTabFaviconCaptured(agentId, tabId);
}

/** Titel/Favicon von Helium oder CDP nachziehen, ohne den Tab neu anzulegen. */
export function updateAgentTabMeta(
  agentId: string,
  tabId: string,
  patch: { title?: string; favicon?: string; url?: string },
) {
  const tabs = getAgentTabs(agentId);
  const current = tabs.tabs.find((t) => t.id === tabId);
  if (!current) return;
  const title = patch.title?.trim() || current.title;
  // Ein schon erfasstes data-URL-Icon nicht durch eine bloße Adresse ersetzen.
  const keepData =
    current.favicon?.startsWith("data:image/") && !patch.favicon?.startsWith("data:image/");
  const favicon = keepData ? current.favicon : patch.favicon || current.favicon;
  const url = patch.url?.trim() || current.url;
  // Nur schreiben, wenn sich etwas ändert (sonst Sync-Push bei jedem Tab-Update).
  if (title === current.title && favicon === current.favicon && url === current.url) return;
  setAgentTabs({
    ...tabs,
    tabs: tabs.tabs.map((t) =>
      t.id === tabId ? { ...t, title, favicon, url, lastActiveAt: new Date().toISOString() } : t,
    ),
  });
}

/** Favicon an Tab speichern (data-URL bevorzugt). */
export function setAgentTabFavicon(agentId: string, tabId: string, favicon: string) {
  const trimmed = favicon.trim();
  if (!trimmed) return;
  updateAgentTabMeta(agentId, tabId, { favicon: trimmed });
}

export function getActiveAgentTab(agentId: string): AgentTab | null {
  const tabs = getAgentTabs(agentId);
  if (tabs.activeTabId) {
    const t = tabs.tabs.find((x) => x.id === tabs.activeTabId);
    if (t) return t;
  }
  if (tabs.tabs.length === 0) return null;
  const sorted = [...tabs.tabs].sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  );
  return sorted[0] ?? null;
}

export async function ensureAgentTabVisible(agentId: string): Promise<string | null> {
  await ensureAgentBrowserStarted(agentId);
  const session = getAgentBrowserSession(agentId);
  if (session.status !== "running") return null;
  const tab = getActiveAgentTab(agentId);
  if (!tab) return null;
  return tab.url;
}

const inflightFavicon = new Set<string>();

/**
 * Holt Favicon von Helium-URL oder Domain und speichert es als data-URL am Tab.
 * Läuft nur im Browser der lokalen App — Handy nutzt danach den gespeicherten Wert.
 */
export async function captureFaviconAsDataUrl(
  sourceUrl: string,
): Promise<string | undefined> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return undefined;
  const src = sourceUrl.trim();
  if (!src || src.startsWith("data:")) return src || undefined;
  if (src.startsWith("chrome://") || src.startsWith("chrome-extension://")) return undefined;
  try {
    const res = await fetch(src, { mode: "cors", credentials: "omit", cache: "force-cache" });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") && blob.type !== "application/octet-stream") {
      return undefined;
    }
    if (blob.size <= 0 || blob.size > MAX_FAVICON_BYTES) return undefined;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    if (!dataUrl.startsWith("data:image/")) return undefined;
    if (dataUrl.length > MAX_FAVICON_BYTES * 1.4) return undefined;
    return dataUrl;
  } catch {
    return undefined;
  }
}

/** Favicon für einen Tab nachziehen (Helium-URL oder Domain-CDN → data-URL). */
export async function ensureTabFaviconCaptured(
  agentId: string,
  tabId: string,
  heliumFavIconUrl?: string,
): Promise<void> {
  const key = `${agentId}:${tabId}`;
  if (inflightFavicon.has(key)) return;
  const tabs = getAgentTabs(agentId);
  const tab = tabs.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  // Schon als data-URL gespeichert → fertig (Handy kann offline rendern).
  if (tab.favicon?.startsWith("data:image/")) return;

  inflightFavicon.add(key);
  try {
    const candidates = [
      heliumFavIconUrl,
      tab.favicon,
      guessFaviconUrl(tab.url),
    ].filter((u): u is string => Boolean(u && u.trim()));

    for (const candidate of candidates) {
      if (candidate.startsWith("data:image/")) {
        setAgentTabFavicon(agentId, tabId, candidate);
        return;
      }
      const dataUrl = await captureFaviconAsDataUrl(candidate);
      if (dataUrl) {
        setAgentTabFavicon(agentId, tabId, dataUrl);
        return;
      }
    }
    // Fallback: CDN-URL speichern (besser als nichts; Sync trägt sie mit).
    const guess = guessFaviconUrl(tab.url);
    if (guess && tab.favicon !== guess) setAgentTabFavicon(agentId, tabId, guess);
  } finally {
    inflightFavicon.delete(key);
  }
}

/**
 * Helium meldet Tab-Metadaten an die Connect-Seite:
 * postMessage({ source:"connect-shell", type:"connect-shell-tab-meta", ... })
 */
export function applyHeliumTabMeta(input: {
  agentId?: string;
  url: string;
  title?: string;
  favicon?: string;
}) {
  const url = input.url?.trim();
  if (!url) return;
  // Lab-Browser-Links (Handy-Browserliste) bekommen dasselbe Icon.
  void import("@/lib/companies/lab-favicons").then((m) =>
    m.applyHeliumFaviconToLabApps(url, input.favicon),
  );
  const agentIds = input.agentId
    ? [input.agentId]
    : Object.keys(readStore());
  if (agentIds.length === 0 && input.agentId) agentIds.push(input.agentId);

  for (const agentId of agentIds) {
    const tabs = getAgentTabs(agentId);
    const match =
      tabs.tabs.find((t) => t.url === url) ||
      tabs.tabs.find((t) => {
        try {
          return new URL(t.url).hostname === new URL(url).hostname;
        } catch {
          return false;
        }
      });
    if (match) {
      updateAgentTabMeta(agentId, match.id, {
        title: input.agentId ? input.title : undefined,
        favicon: input.favicon,
        // Ohne Agent-Zuordnung nur das Icon übernehmen, die gespeicherte Adresse bleibt.
        url: input.agentId ? url : undefined,
      });
      void ensureTabFaviconCaptured(agentId, match.id, input.favicon);
    } else if (input.agentId) {
      const tab = openAgentTab(agentId, {
        url,
        title: input.title,
        favicon: input.favicon,
      });
      void ensureTabFaviconCaptured(agentId, tab.id, input.favicon);
    }
  }
}

/** Einmalig: alle Tabs ohne data-URL-Favicon nachziehen (lokale App). */
export function hydrateMissingTabFavicons(): void {
  if (typeof window === "undefined") return;
  const store = readStore();
  for (const agentId of Object.keys(store)) {
    for (const tab of store[agentId]?.tabs ?? []) {
      if (!tab.favicon?.startsWith("data:image/")) {
        void ensureTabFaviconCaptured(agentId, tab.id);
      }
    }
  }
}

let heliumListenerStarted = false;

/** In der Connect App (3101) starten — nimmt Favicons aus Helium entgegen. */
export function startHeliumTabFaviconListener(): () => void {
  if (typeof window === "undefined") return () => {};
  if (heliumListenerStarted) return () => {};
  heliumListenerStarted = true;
  // Icons nur in der lokalen App nachziehen; das Handy zeigt die gespeicherten Werte.
  if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) hydrateMissingTabFavicons();

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || typeof data !== "object") return;
    const source = data.source;
    const type = data.type;
    if (source !== "connect-shell" && source !== "connect-helium") return;
    if (
      type !== "connect-shell-tab-meta" &&
      type !== "connect-shell-tabs" &&
      type !== "connect-tab-favicon"
    ) {
      return;
    }
    if (type === "connect-shell-tabs" && Array.isArray(data.tabs)) {
      for (const raw of data.tabs) {
        const tab = raw as Record<string, unknown>;
        if (typeof tab.url !== "string") continue;
        applyHeliumTabMeta({
          agentId: typeof data.agentId === "string" ? data.agentId : undefined,
          url: tab.url,
          title: typeof tab.title === "string" ? tab.title : undefined,
          favicon:
            typeof tab.favIconUrl === "string"
              ? tab.favIconUrl
              : typeof tab.favicon === "string"
                ? tab.favicon
                : undefined,
        });
      }
      return;
    }
    if (typeof data.url !== "string") return;
    applyHeliumTabMeta({
      agentId: typeof data.agentId === "string" ? data.agentId : undefined,
      url: data.url,
      title: typeof data.title === "string" ? data.title : undefined,
      favicon:
        typeof data.favIconUrl === "string"
          ? data.favIconUrl
          : typeof data.favicon === "string"
            ? data.favicon
            : undefined,
    });
  };

  window.addEventListener("message", onMessage);
  // Helium-Erweiterung (connect-bridge.js) nach allen offenen Tabs fragen; Antwort kommt als
  // "connect-shell-tabs". Ohne Erweiterung (Handy/Vercel) passiert nichts.
  const requestTabs = () => {
    if (document.documentElement.dataset.connectShell !== "1") return;
    window.postMessage(
      { source: "connect-app", type: "connect-shell-list-tabs", id: `tabs-${Date.now()}` },
      window.location.origin,
    );
  };
  const first = window.setTimeout(requestTabs, 1500);
  const every = window.setInterval(requestTabs, 5 * 60_000);
  return () => {
    window.clearTimeout(first);
    window.clearInterval(every);
    window.removeEventListener("message", onMessage);
    heliumListenerStarted = false;
  };
}
