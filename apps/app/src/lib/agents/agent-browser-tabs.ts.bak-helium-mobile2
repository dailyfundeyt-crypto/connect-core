/**
 * Per-Agent Browser Tabs — jedem Agent steht ein eigenes Profil mit eigenen Tabs.
 * "Die jüngsten Tabs sollten immer für die geöffnet sein" — das ist hier umgesetzt:
 * - Letzter aktiver Tab wird persistiert (localStorage)
 * - Tab-Gruppen optional (Phase 2)
 * - Beim Wechsel des Agents → dessen letzter Tab wird angesteuert
 *
 * Host-Chrome mit --user-data-dir pro Agent (Plan 043). Diese Datei hält nur die
 * UI-State-Persistenz; das eigentliche Browser-Profil wird vom Backend / Desktop
 * gestartet (siehe agent-browser.ts).
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
  /** Optional favicon — vom Backend gecaptured oder vom Frontend geschätzt. */
  favicon?: string;
  /** Welche Gruppe dieser Tab angehört (Phase 2 — aktuell ignoriert). */
  groupId?: string;
  /** Wann dieser Tab zuletzt aktiv war (ISO-8601). */
  lastActiveAt: string;
  /** Reihenfolge in der Leiste (kleiner zuerst). */
  order: number;
};

export type AgentBrowserTabs = {
  agentId: string;
  /** Tabs in stabiler Reihenfolge. */
  tabs: AgentTab[];
  /** Welcher Tab ist gerade aktiv. */
  activeTabId: string | null;
  /** Phase 2: opt-in Tab-Gruppen (Label + Color). */
  groups: AgentTabGroup[];
  /** Welcher Tab war vor `activeTabId` aktiv (für ◀ Previous). */
  lastTabId: string | null;
};

export type AgentTabGroup = {
  id: string;
  label: string;
  /** Tabler color name: blue / green / amber / rose / … */
  color: string;
};

const TABS_KEY = "connect.agent-browser-tabs";
const EVENT = "connect-agent-browser-tabs-changed";

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
  // Mit-Agent-Browser-Session-Updates ebenfalls pumpen (CDP URL / status).
  const offBrowser = subscribeAgentBrowser(onChange);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
    offBrowser();
  };
}

/**
 * Neuen Tab hinzufügen oder bestehenden aktualisieren (gleiche URL → reopen).
 * Wird zum aktiven Tab. Wenn es keinen gab, wird ein Default-Tab angelegt.
 */
export function openAgentTab(
  agentId: string,
  input: { url: string; title?: string; groupId?: string },
): AgentTab {
  const url = input.url.trim() || "about:blank";
  const now = new Date().toISOString();
  const tabs = getAgentTabs(agentId);
  const existing = tabs.tabs.find((t) => t.url === url);
  if (existing) {
    const updated: AgentBrowserTabs = {
      ...tabs,
      lastTabId: tabs.activeTabId,
      activeTabId: existing.id,
      tabs: tabs.tabs.map((t) =>
        t.id === existing.id ? { ...t, lastActiveAt: now } : t,
      ),
    };
    setAgentTabs(updated);
    return updated.tabs.find((t) => t.id === existing.id) ?? existing;
  }
  const id = `t${now}-${Math.random().toString(36).slice(2, 8)}`;
  const tab: AgentTab = {
    id,
    url,
    title: input.title?.trim() || guessTitle(url),
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
  return tab;
}

export function closeAgentTab(agentId: string, tabId: string) {
  const tabs = getAgentTabs(agentId);
  if (tabs.tabs.length === 0) return;
  const remaining = tabs.tabs.filter((t) => t.id !== tabId);
  let nextActive = tabs.activeTabId;
  if (tabs.activeTabId === tabId) {
    nextActive =
      remaining[remaining.length - 1]?.id ?? null;
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
      t.id === tabId
        ? { ...t, lastActiveAt: new Date().toISOString() }
        : t,
    ),
  });
}

/** Aktiven Tab ermitteln — fällt auf den jüngsten Tab zurück, falls aktiv leer. */
export function getActiveAgentTab(agentId: string): AgentTab | null {
  const tabs = getAgentTabs(agentId);
  if (tabs.activeTabId) {
    const t = tabs.tabs.find((x) => x.id === tabs.activeTabId);
    if (t) return t;
  }
  if (tabs.tabs.length === 0) return null;
  const sorted = [...tabs.tabs].sort(
    (a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  );
  return sorted[0] ?? null;
}

/**
 * Stellt sicher, dass der Agent-Browser läuft und sein letzter Tab sichtbar ist.
 * Wirft nicht — returnt die aktive URL oder null bei Fehler.
 */
export async function ensureAgentTabVisible(
  agentId: string,
): Promise<string | null> {
  await ensureAgentBrowserStarted(agentId);
  const session = getAgentBrowserSession(agentId);
  if (session.status !== "running") return null;
  const tab = getActiveAgentTab(agentId);
  if (!tab) return null;
  return tab.url;
}

function guessTitle(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 24);
  }
}
