/**
 * Lab (mode 3) — Europe-simple: one explicit Chromium + app icons.
 *
 * Agents take access to those apps and to this browser to build software.
 * When ★ is set, Lab shows the finished product. Bearbeiten always returns
 * to the browser so the AI can apply changes. Local websearch runs in Chromium.
 */

import { navigateDesktopBrowser } from "@/lib/desktop-bridge";

export type LabAppKind = "browser" | "computer";

export type LabApp = {
  id: string;
  kind: LabAppKind;
  label: string;
  blurb: string;
  /** URL the Chromium pane opens (browser apps + optional docs for computer). */
  url?: string;
  /** Hint for agents driving Computer-Use on the sandbox PC. */
  computerHint?: string;
  icon: string;
  tint: string;
  builtin?: boolean;
};

/** App icons in the sidebar — agents + humans open them in the Lab browser. */
export const LAB_APP_ICONS: LabApp[] = [
  // Technische
  {
    id: "markettrace",
    kind: "browser",
    label: "MarketTrace | Micro",
    url: "https://markettrace.io",
    blurb: "Marktdaten",
    icon: "chart",
    tint: "#10B981",
    builtin: true,
  },
  {
    id: "tradingview",
    kind: "browser",
    label: "TradingView - Alle Märkte",
    url: "https://de.tradingview.com",
    blurb: "Charts & Analyse",
    icon: "tradingview",
    tint: "#2962FF",
    builtin: true,
  },
  {
    id: "btcusdt",
    kind: "browser",
    label: "BTCUSDT | 86386.6",
    url: "https://de.tradingview.com/symbols/BTCUSDT",
    blurb: "Krypto Kurs",
    icon: "bitcoin",
    tint: "#F59E0B",
    builtin: true,
  },
  {
    id: "prorealtime",
    kind: "browser",
    label: "ProRealTime Web",
    url: "https://m.prorealtime.com",
    blurb: "Pro Trading",
    icon: "activity",
    tint: "#3B82F6",
    builtin: true,
  },
  {
    id: "plattform",
    kind: "browser",
    label: "Starten Ihrer Plattform",
    url: "https://prorealtime.com",
    blurb: "Plattform",
    icon: "device-desktop",
    tint: "#6366F1",
    builtin: true,
  },
  // Sentimentalle
  {
    id: "allcategories",
    kind: "browser",
    label: "All Categories: Live...",
    url: "https://coinmarketcap.com",
    blurb: "Markt-Kategorien",
    icon: "category",
    tint: "#8B5CF6",
    builtin: true,
  },
  {
    id: "cryptopanic",
    kind: "browser",
    label: "(21) CryptoPanic",
    url: "https://cryptopanic.com",
    blurb: "Krypto News & Sentiment",
    icon: "flame",
    tint: "#EF4444",
    builtin: true,
  },
  // Build
  {
    id: "lovable",
    kind: "browser",
    label: "Lovable",
    url: "https://lovable.dev",
    blurb: "Bauen · MCP → GitHub",
    icon: "vercel",
    tint: "#111111",
    builtin: true,
  },
  {
    id: "claude",
    kind: "browser",
    label: "Claude",
    url: "https://claude.ai",
    blurb: "Aufgaben eintippen",
    icon: "anthropic",
    tint: "#D97757",
    builtin: true,
  },
  {
    id: "cursor",
    kind: "browser",
    label: "Cursor",
    url: "https://cursor.com/agents",
    blurb: "Cloud Agent",
    icon: "cursor",
    tint: "#000000",
    builtin: true,
  },
  {
    id: "chatgpt",
    kind: "browser",
    label: "ChatGPT",
    url: "https://chatgpt.com",
    blurb: "Canvas / Code",
    icon: "openai",
    tint: "#10A37F",
    builtin: true,
  },
  {
    id: "github",
    kind: "browser",
    label: "GitHub",
    url: "https://github.com",
    blurb: "Repos & Deploy",
    icon: "github",
    tint: "#181717",
    builtin: true,
  },
  {
    id: "laravel",
    kind: "browser",
    label: "Laravel",
    url: "https://laravel.com/docs",
    blurb: "Docs im Browser",
    icon: "laravel",
    tint: "#FF2D20",
    builtin: true,
  },
  // Pinned Apps
  {
    id: "gmail",
    kind: "browser",
    label: "Gmail",
    url: "https://mail.google.com",
    blurb: "E-Mails & Postfach",
    icon: "mail",
    tint: "#EA4335",
    builtin: true,
  },
  {
    id: "calendar",
    kind: "browser",
    label: "Kalender",
    url: "https://calendar.google.com",
    blurb: "Termine",
    icon: "calendar",
    tint: "#4285F4",
    builtin: true,
  },
];

/** @deprecated Prefer LAB_APP_ICONS */
export const LEVEL3_PRESETS = LAB_APP_ICONS;
export const BROWSER_APP_PRESETS = LAB_APP_ICONS;
export const COMPUTER_APP_PRESETS: LabApp[] = [];

export type Level3ToolId = string;

export type Level3Connection = {
  toolId: string;
  projectId?: string;
  projectUrl?: string;
  githubUrl?: string;
  connectedAt: string;
};

export type Level3BrowserState = {
  companyId: string;
  activeTool: string;
  customUrl?: string;
  browsing: boolean;
  connections: Level3Connection[];
  starred: boolean;
  starredConnectionToolId?: string;
  customApps: LabApp[];
  /** Named tab groups — may nest via parentId (Arc-style). */
  tabGroups: LabTabGroup[];
  /**
   * `full` (default) = Connect IS the browser — Host-Chrome with
   * Connect profile (extensions / Web Store). Not a website-in-tab.
   * `embed` = optional iframe preview only (no real Chromium).
   */
  engine?: "embed" | "full";
  /** Last local websearch query (shown in chrome). */
  lastSearch?: string;
  updatedAt: string;
};

export type LabTabGroup = {
  id: string;
  label: string;
  /** Parent group id for nested folders. Root groups omit this. */
  parentId?: string;
  /** App ids in this group. */
  appIds: string[];
  collapsed?: boolean;
  /** Optional Arc-style accent (used by the sidebar to color the folder). */
  accent?: GroupAccent;
};

export type GroupAccent =
  | "technische"
  | "fundamentals"
  | "sentimentalle"
  | "sektorielle"
  | "build"
  | "ai";

const KEY = "connect.level3.browser";
const EVENT = "connect-level3-browser-changed";

/** DuckDuckGo — local websearch in the Lab Chromium pane. */
export function localWebSearchUrl(query: string): string {
  const q = query.trim();
  if (!q) return "https://duckduckgo.com";
  return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
}

export const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/category/extensions";

function defaultTabGroups(): LabTabGroup[] {
  return [
    {
      id: "group-technische",
      label: "Technische",
      accent: "technische",
      appIds: ["tradingview", "markettrace", "btcusdt", "prorealtime", "plattform"],
    },
    {
      id: "group-fundamentals",
      label: "Fundamentals",
      accent: "fundamentals",
      appIds: [],
    },
    {
      id: "group-sentimentalle",
      label: "Sentimentalle",
      accent: "sentimentalle",
      appIds: ["cryptopanic", "allcategories"],
    },
    {
      id: "group-sektorielle",
      label: "Sektorielle",
      accent: "sektorielle",
      appIds: [],
    },
    {
      id: "group-build",
      label: "Build",
      accent: "build",
      appIds: ["lovable", "cursor", "github", "laravel"],
    },
    {
      id: "group-ai",
      label: "AI",
      accent: "ai",
      appIds: ["claude", "chatgpt"],
    },
  ];
}

function readAll(): Record<string, Level3BrowserState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Level3BrowserState>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, Level3BrowserState>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
  void import("./workspace-sync").then((m) => m.scheduleConnectWorkspacePush());
}

function emptyState(companyId: string): Level3BrowserState {
  return {
    companyId,
    activeTool: "lovable",
    browsing: true,
    connections: [],
    starred: false,
    customApps: [],
    tabGroups: defaultTabGroups(),
    engine: "full",
    updatedAt: "",
  };
}

/** Lab defaults to Connect-Chrome (`full`). Only explicit `embed` keeps the iframe. */
export function resolveLabEngine(
  engine: Level3BrowserState["engine"] | undefined,
): "embed" | "full" {
  return engine === "embed" ? "embed" : "full";
}

function normalizeGroups(
  groups: LabTabGroup[] | undefined,
): LabTabGroup[] {
  if (!Array.isArray(groups) || groups.length === 0) return defaultTabGroups();
  const defaults = defaultTabGroups();
  const existingIds = new Set(groups.map((g) => g.id));
  const missing = defaults.filter((d) => !existingIds.has(d.id));

  // Heal broken state — legacy data may have created one-off groups per app.
  // Their label looks like an app name (no "group-" prefix, no accent).
  // Merge those apps back into the matching default group.
  const knownAppIds = new Set<string>([
    "markettrace",
    "tradingview",
    "btcusdt",
    "prorealtime",
    "plattform",
    "allcategories",
    "cryptopanic",
    "lovable",
    "claude",
    "cursor",
    "chatgpt",
    "github",
    "laravel",
    "gmail",
    "calendar",
  ]);
  const accented = new Set<GroupAccent>([
    "technische",
    "fundamentals",
    "sentimentalle",
    "sektorielle",
    "build",
    "ai",
  ]);
  const defaultById = new Map(defaults.map((d) => [d.id, d]));
  const defaultByAccent = new Map<GroupAccent, LabTabGroup>();
  for (const d of defaults) {
    if (d.accent) defaultByAccent.set(d.accent, d);
  }

  const leftovers = new Map<string, LabTabGroup>();
  const cleaned: LabTabGroup[] = [];
  for (const g of groups) {
    const isDefault = defaultById.has(g.id);
    const isAccent = g.accent && accented.has(g.accent);
    if (isDefault || isAccent) {
      cleaned.push(g);
      continue;
    }
    // Foreign group — collect its apps into the matching default group by accent
    // or into "Technische" as the catch-all (since most extras were trading apps).
    if (g.appIds.length > 0) {
      leftovers.set(g.id, g);
    }
  }

  const merged = new Map<string, string[]>();
  for (const g of defaults) merged.set(g.id, [...g.appIds]);
  for (const foreign of leftovers.values()) {
    const target = defaultByAccent.get("technische")!;
    for (const appId of foreign.appIds) {
      if (!knownAppIds.has(appId)) continue;
      const list = merged.get(target.id)!;
      if (!list.includes(appId)) list.push(appId);
    }
  }
  const rebuiltDefaults = defaults.map((d) => ({
    ...d,
    appIds: merged.get(d.id) ?? d.appIds,
  }));

  const order = [
    ...missing,
    ...rebuiltDefaults.filter((d) => existingIds.has(d.id)),
    ...cleaned.filter((g) => !defaultById.has(g.id) && !(g.accent && accented.has(g.accent))),
  ];

  // Deduplicate by id while preserving order.
  const seen = new Set<string>();
  return order.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}

export function getLevel3Browser(companyId: string): Level3BrowserState {
  const raw = readAll()[companyId];
  if (!raw) return emptyState(companyId);

  const legacy = raw as Level3BrowserState & {
    activated?: boolean;
    githubUrl?: string;
    tool?: string;
    browserUrl?: string;
  };

  const customApps = Array.isArray(legacy.customApps) ? legacy.customApps : [];
  const tabGroups = normalizeGroups(legacy.tabGroups);

  if (Array.isArray(legacy.connections)) {
    return {
      ...emptyState(companyId),
      ...raw,
      customApps,
      tabGroups,
      browsing: legacy.browsing !== false,
      engine: resolveLabEngine(legacy.engine),
    };
  }

  const connections: Level3Connection[] = [];
  if (legacy.githubUrl || legacy.browserUrl) {
    connections.push({
      toolId: legacy.tool ?? "lovable",
      projectUrl: legacy.browserUrl,
      githubUrl: legacy.githubUrl,
      connectedAt: legacy.updatedAt || new Date().toISOString(),
    });
  }
  return {
    companyId,
    activeTool: legacy.tool ?? legacy.activeTool ?? "lovable",
    customUrl: legacy.browserUrl ?? legacy.customUrl,
    browsing: true,
    connections,
    starred: Boolean(legacy.activated ?? legacy.starred),
    starredConnectionToolId: connections[0]?.toolId,
    customApps,
    tabGroups,
    updatedAt: legacy.updatedAt ?? "",
  };
}

export function setLevel3Browser(
  companyId: string,
  patch: Partial<Omit<Level3BrowserState, "companyId" | "updatedAt">>,
): Level3BrowserState {
  const all = readAll();
  const prev = getLevel3Browser(companyId);
  const next: Level3BrowserState = {
    ...prev,
    ...patch,
    companyId,
    updatedAt: new Date().toISOString(),
  };
  all[companyId] = next;
  writeAll(all);
  return next;
}

export function subscribeLevel3Browser(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function allLabApps(state: Level3BrowserState): LabApp[] {
  return [...LAB_APP_ICONS, ...state.customApps];
}

export function resolveLabApp(
  state: Level3BrowserState,
  appId: string = state.activeTool,
): LabApp | undefined {
  return allLabApps(state).find((a) => a.id === appId);
}

export function getConnection(
  state: Level3BrowserState,
  toolId: string,
): Level3Connection | undefined {
  return state.connections.find((c) => c.toolId === toolId);
}

export function connectTool(
  companyId: string,
  toolId: string,
  fields: { projectId?: string; projectUrl?: string; githubUrl?: string },
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const row: Level3Connection = {
    toolId,
    projectId: fields.projectId?.trim() || undefined,
    projectUrl: fields.projectUrl?.trim() || undefined,
    githubUrl: fields.githubUrl?.trim() || undefined,
    connectedAt: new Date().toISOString(),
  };
  return setLevel3Browser(companyId, {
    connections: [
      ...prev.connections.filter((c) => c.toolId !== toolId),
      row,
    ],
    activeTool: toolId,
    customUrl: row.projectUrl,
    browsing: true,
    starred: false,
  });
}

export function disconnectTool(
  companyId: string,
  toolId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  return setLevel3Browser(companyId, {
    connections: prev.connections.filter((c) => c.toolId !== toolId),
    starred: prev.starredConnectionToolId === toolId ? false : prev.starred,
    starredConnectionToolId:
      prev.starredConnectionToolId === toolId
        ? undefined
        : prev.starredConnectionToolId,
  });
}

export function starSoftware(
  companyId: string,
  toolId: string,
): Level3BrowserState {
  return setLevel3Browser(companyId, {
    starred: true,
    starredConnectionToolId: toolId,
    browsing: false,
  });
}

/**
 * Bearbeiten — always leave the finished product and return to the
 * browser version so the AI (or you) can change the software.
 */
export function unstarToBrowser(companyId: string): Level3BrowserState {
  return setLevel3Browser(companyId, {
    starred: false,
    browsing: true,
  });
}

export function addCustomLabApp(
  companyId: string,
  input: {
    kind?: LabAppKind;
    label: string;
    url: string;
    groupId?: string;
  },
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const label = input.label.trim();
  const url = input.url.trim();
  if (!label || !url) return prev;
  const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const id = `custom-${Date.now().toString(36)}`;
  const app: LabApp = {
    id,
    kind: "browser",
    label,
    blurb: "Eigene App",
    url: withProto,
    icon: "googlechrome",
    tint: "#4285F4",
    builtin: false,
  };
  const groups = [...normalizeGroups(prev.tabGroups)];
  const targetId = input.groupId ?? groups[0]?.id;
  const nextGroups = groups.map((g) =>
    g.id === targetId ? { ...g, appIds: [...g.appIds, id] } : g,
  );
  return setLevel3Browser(companyId, {
    customApps: [...prev.customApps, app],
    tabGroups: nextGroups,
    activeTool: id,
    customUrl: withProto,
    browsing: true,
    starred: false,
  });
}

export function removeCustomLabApp(
  companyId: string,
  appId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const nextApps = prev.customApps.filter((a) => a.id !== appId);
  const activeGone = prev.activeTool === appId;
  return setLevel3Browser(companyId, {
    customApps: nextApps,
    tabGroups: normalizeGroups(prev.tabGroups).map((g) => ({
      ...g,
      appIds: g.appIds.filter((id) => id !== appId),
    })),
    activeTool: activeGone ? "lovable" : prev.activeTool,
    connections: prev.connections.filter((c) => c.toolId !== appId),
  });
}

export function createTabGroup(
  companyId: string,
  label: string,
  parentId?: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const name = label.trim() || "Gruppe";
  const groups = normalizeGroups(prev.tabGroups);
  const parentOk =
    parentId && groups.some((g) => g.id === parentId) ? parentId : undefined;
  const group: LabTabGroup = {
    id: `group-${Date.now().toString(36)}`,
    label: name,
    parentId: parentOk,
    appIds: [],
    collapsed: false,
  };
  return setLevel3Browser(companyId, {
    tabGroups: [...groups, group],
  });
}

export function renameTabGroup(
  companyId: string,
  groupId: string,
  label: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const name = label.trim();
  if (!name) return prev;
  return setLevel3Browser(companyId, {
    tabGroups: normalizeGroups(prev.tabGroups).map((g) =>
      g.id === groupId ? { ...g, label: name } : g,
    ),
  });
}

export function toggleTabGroup(
  companyId: string,
  groupId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  return setLevel3Browser(companyId, {
    tabGroups: normalizeGroups(prev.tabGroups).map((g) =>
      g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
    ),
  });
}

export function setTabGroupOpen(
  companyId: string,
  groupId: string,
  open: boolean,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  return setLevel3Browser(companyId, {
    tabGroups: normalizeGroups(prev.tabGroups).map((g) =>
      g.id === groupId ? { ...g, collapsed: !open } : g,
    ),
  });
}

export function deleteTabGroup(
  companyId: string,
  groupId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const groups = normalizeGroups(prev.tabGroups);
  const removed = groups.find((g) => g.id === groupId);
  if (!removed) return prev;
  const rest = groups.filter((g) => g.id !== groupId);
  // Promote children to removed.parentId; merge apps into parent or first root.
  const parentId = removed.parentId;
  const next = rest.map((g) => {
    if (g.parentId === groupId) {
      return { ...g, parentId };
    }
    if (parentId && g.id === parentId) {
      return { ...g, appIds: [...g.appIds, ...removed.appIds] };
    }
    return g;
  });
  if (!parentId && removed.appIds.length > 0) {
    const root = next.find((g) => !g.parentId);
    if (root) {
      return setLevel3Browser(companyId, {
        tabGroups: next.map((g) =>
          g.id === root.id
            ? { ...g, appIds: [...g.appIds, ...removed.appIds] }
            : g,
        ),
      });
    }
  }
  return setLevel3Browser(companyId, { tabGroups: next });
}

export function moveAppToGroup(
  companyId: string,
  appId: string,
  groupId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  return setLevel3Browser(companyId, {
    tabGroups: normalizeGroups(prev.tabGroups).map((g) => {
      const without = g.appIds.filter((id) => id !== appId);
      if (g.id !== groupId) return { ...g, appIds: without };
      return {
        ...g,
        appIds: without.includes(appId) ? without : [...without, appId],
      };
    }),
  });
}

/** Move a folder under another folder (or to root when parentId is null). */
export function moveGroupUnder(
  companyId: string,
  groupId: string,
  parentId: string | null,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const groups = normalizeGroups(prev.tabGroups);
  if (groupId === parentId) return prev;
  // Prevent cycles: parent cannot be a descendant of groupId.
  if (parentId) {
    let walk: string | undefined = parentId;
    const byId = new Map(groups.map((g) => [g.id, g]));
    while (walk) {
      if (walk === groupId) return prev;
      walk = byId.get(walk)?.parentId;
    }
  }
  return setLevel3Browser(companyId, {
    tabGroups: groups.map((g) =>
      g.id === groupId
        ? { ...g, parentId: parentId ?? undefined }
        : g,
    ),
  });
}

/** Reorder groups like HQ Nachrichten-Ordner (same parent only). */
export function reorderTabGroups(
  companyId: string,
  orderedIds: string[],
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const byId = new Map(normalizeGroups(prev.tabGroups).map((g) => [g.id, g]));
  const next = orderedIds
    .map((id) => byId.get(id))
    .filter((g): g is LabTabGroup => Boolean(g));
  for (const g of byId.values()) {
    if (!orderedIds.includes(g.id)) next.push(g);
  }
  return setLevel3Browser(companyId, { tabGroups: next });
}

/** Reorder apps inside one group. */
export function reorderAppsInGroup(
  companyId: string,
  groupId: string,
  orderedAppIds: string[],
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  return setLevel3Browser(companyId, {
    tabGroups: normalizeGroups(prev.tabGroups).map((g) => {
      if (g.id !== groupId) return g;
      const set = new Set(g.appIds);
      const ordered = orderedAppIds.filter((id) => set.has(id));
      const rest = g.appIds.filter((id) => !ordered.includes(id));
      return { ...g, appIds: [...ordered, ...rest] };
    }),
  });
}

export function removeAppFromGroups(
  companyId: string,
  appId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  return setLevel3Browser(companyId, {
    tabGroups: normalizeGroups(prev.tabGroups).map((g) => ({
      ...g,
      appIds: g.appIds.filter((id) => id !== appId),
    })),
  });
}

/** Arc-style + New Tab — blank custom tab added to a group (or ungrouped). */
export function addNewTab(
  companyId: string,
  groupId?: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const id = `tab-${Date.now().toString(36)}`;
  const app: LabApp = {
    id,
    kind: "browser",
    label: "New Tab",
    blurb: "Neuer Tab",
    url: "https://duckduckgo.com",
    icon: "googlechrome",
    tint: "#5F6368",
    builtin: false,
  };
  const groups = [...normalizeGroups(prev.tabGroups)];
  const target = groupId ?? groups.find((g) => !g.parentId)?.id;
  const nextGroups = target
    ? groups.map((g) =>
        g.id === target ? { ...g, appIds: [...g.appIds, id], collapsed: false } : g,
      )
    : groups;
  return setLevel3Browser(companyId, {
    customApps: [...prev.customApps, app],
    tabGroups: nextGroups,
    activeTool: id,
    customUrl: app.url,
    browsing: true,
    starred: false,
  });
}

export function setLabEngine(
  companyId: string,
  engine: "embed" | "full",
): Level3BrowserState {
  return setLevel3Browser(companyId, { engine });
}

export const DND_LAB_GROUP = "application/x-connect-lab-group";
export const DND_LAB_APP = "application/x-connect-lab-app";

export type LabFolderNode = LabTabGroup & {
  apps: LabApp[];
  children: LabFolderNode[];
};

/** Flat groups + ungrouped — kept for simple callers. */
export function labAppsByGroup(state: Level3BrowserState): {
  groups: Array<LabTabGroup & { apps: LabApp[] }>;
  ungrouped: LabApp[];
} {
  const apps = allLabApps(state);
  const byId = new Map(apps.map((a) => [a.id, a]));
  const claimed = new Set<string>();
  const groups = normalizeGroups(state.tabGroups).map((g) => {
    const list: LabApp[] = [];
    for (const id of g.appIds) {
      const app = byId.get(id);
      if (!app) continue;
      claimed.add(id);
      list.push(app);
    }
    return { ...g, apps: list };
  });
  const ungrouped = apps.filter((a) => !claimed.has(a.id));
  return { groups, ungrouped };
}

/** Nested folder tree for Arc-style sidebar. */
export function labFolderTree(state: Level3BrowserState): {
  roots: LabFolderNode[];
  ungrouped: LabApp[];
} {
  const { groups, ungrouped } = labAppsByGroup(state);
  const nodes = new Map<string, LabFolderNode>();
  for (const g of groups) {
    nodes.set(g.id, { ...g, children: [] });
  }
  const roots: LabFolderNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return { roots, ungrouped };
}

/** Open an app icon in the Lab browser (and leave ★ product view). */
export function selectLabApp(
  companyId: string,
  appId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const app = resolveLabApp(prev, appId);
  const conn = getConnection(prev, appId);
  const targetUrl = conn?.projectUrl ?? app?.url;
  if (targetUrl) {
    navigateDesktopBrowser(targetUrl);
  }
  return setLevel3Browser(companyId, {
    activeTool: appId,
    customUrl: targetUrl,
    browsing: true,
    starred: false,
  });
}

/** Run a local websearch inside the Lab Chromium. */
export function runLocalWebSearch(
  companyId: string,
  query: string,
): Level3BrowserState {
  const url = localWebSearchUrl(query);
  navigateDesktopBrowser(url);
  return setLevel3Browser(companyId, {
    activeTool: "custom",
    customUrl: url,
    lastSearch: query.trim(),
    browsing: true,
    starred: false,
  });
}

export function resolveTabUrl(state: Level3BrowserState): string {
  const app = resolveLabApp(state);
  const conn = getConnection(state, state.activeTool);
  if (conn?.projectUrl?.trim()) return conn.projectUrl.trim();
  if (state.customUrl?.trim()) return state.customUrl.trim();
  if (app?.url?.trim()) return app.url.trim();
  return "https://lovable.dev";
}

export function toolIconUrl(icon: string): string {
  return `https://cdn.simpleicons.org/${icon}`;
}

export async function navigateChromium(
  computerId: string,
  url: string,
): Promise<{ ok: boolean; detail: string }> {
  const target = url.trim();
  if (!target) return { ok: false, detail: "Keine URL." };
  try {
    const res = await fetch(`/api/computers/${computerId}/navigate`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: target }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      return {
        ok: false,
        detail: body?.error?.trim() || `Navigate HTTP ${res.status}`,
      };
    }
    return { ok: true, detail: "Chromium öffnet die Seite." };
  } catch (caught) {
    return {
      ok: false,
      detail:
        caught instanceof Error
          ? caught.message
          : "Chromium nicht erreichbar.",
    };
  }
}

export const LOVABLE_MCP_HINT =
  "Lovable MCP (mcp.lovable.dev): get_project → github_url / preview_url → Connect.";
