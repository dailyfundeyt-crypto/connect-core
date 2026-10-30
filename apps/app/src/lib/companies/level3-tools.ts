/**
 * Lab (mode 3) — Europe-simple: one explicit Chromium + app icons.
 *
 * Agents take access to those apps and to this browser to build software.
 * When ★ is set, Lab shows the finished product. Bearbeiten always returns
 * to the browser so the AI can apply changes. Local websearch runs in Chromium.
 */

import { isDesktopApp, navigateDesktopBrowser } from "@/lib/desktop-bridge";

/** `split` = Split-Link: two URLs opened side by side (left / right half of the screen). `note` = linked Obsidian / Brain planning note. */
export type LabAppKind = "browser" | "computer" | "split" | "note";

export type LabApp = {
  id: string;
  kind: LabAppKind;
  label: string;
  blurb: string;
  /** URL the Chromium pane opens (browser apps + optional docs for computer). Split-Link: left. */
  url?: string;
  /** Split-Link only: URL for the right half. */
  url2?: string;
  /** Hint for agents driving Computer-Use on the sandbox PC. */
  computerHint?: string;
  icon: string;
  tint: string;
  builtin?: boolean;
  /**
   * Echtes Seiten-Icon (data-URL oder https), lokal aus dem offenen Helium-Tab erfasst
   * (lab-favicons.ts). Wird per Workspace-Sync mitgenommen; die Handy-Browserliste zeigt es.
   */
  favicon?: string;
  /** Vault path for linked planning notes (e.g. "MOC/02-Prompts-AI.md"). */
  notePath?: string;
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
  /** Example Split-Link was added once (deleting it keeps it deleted). */
  splitExampleSeeded?: boolean;
  /**
   * Set once the seed tab groups have been stripped. Stored under the same
   * localStorage key as the state, per company, so the strip runs exactly once
   * and a group the user later creates by hand is never removed.
   */
  "connect.level3.migrated.v2-cleared-defaults"?: boolean;
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

// SEED_DISABLED — sidebar starts empty; user creates groups via + Neue Gruppe.
function defaultTabGroups(): LabTabGroup[] {
  return [];
}

// Keep the function so normalizeGroups() still type-checks without import changes.
export function getDefaultTabGroups(): LabTabGroup[] {
  return [];
}

// ---------------------------------------------------------------------------
// One-time migration: v2-cleared-defaults
//
// If the user's persisted localStorage still holds the old seeded groups
// (Technische, Fundamentals, Sentimentalle, Sektorielle, Build, AI),
// remove them once so the sidebar is truly empty on first load after this change.
//
// The migration key lives under the same localStorage KEY so it is per-company
// and survives a workspace switch.  Run once on any company that still has the
// old seed groups.  Group names are matched case-insensitively.
// ---------------------------------------------------------------------------
const MIGRATION_KEY = "connect.level3.migrated.v2-cleared-defaults";

const SEED_GROUP_IDS = new Set([
  "group-technische",
  "group-fundamentals",
  "group-sentimentalle",
  "group-sektorielle",
  "group-build",
  "group-ai",
]);

const SEED_GROUP_LABELS = new Set([
  // German
  "technische",
  "fundamentals",
  "sentimentalle",
  "sektorielle",
  "sektoriell",
  "build",
  "ai",
]);

/**
 * One-time cleanup of the seeded defaults, so the list is empty on first load after the change.
 *
 * Older state holds the seeded groups (Technische, Fundamentals, Sentimentalle, Sektorielle, Build,
 * AI) and, for some companies, groups that were only ever a copy of one app. Both are removed --
 * an entry that references a deleted group keeps the apps themselves, so nothing is lost, only the
 * pre-made grouping.
 *
 * Runs inside readAll() rather than as a second pass over localStorage: the repair for quoted keys
 * writes the map back, and a second pass afterwards would read its own output and race it.
 * The flag is stored per company so one company being cleared does not clear the rest.
 */
function clearSeededGroups(companyId: string, entry: Level3BrowserState): Level3BrowserState {
  if (entry[MIGRATION_KEY]) return entry;
  const kept = (entry.tabGroups ?? []).filter((g) => {
    if (SEED_GROUP_IDS.has(g.id)) return false;
    const label = (g.label ?? "").toLowerCase().trim();
    if (SEED_GROUP_LABELS.has(label)) return false;
    return true;
  });
  return { ...entry, tabGroups: kept, [MIGRATION_KEY]: true };
}

function readAll(): Record<string, Level3BrowserState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const healed = healQuotedCompanyKeys(parsed);
    return clearSeededGroupsInAll(healed);
  } catch {
    return {};
  }
}

/** Apply the seeded-group cleanup to every company at once, writing back only if something changed. */
function clearSeededGroupsInAll(
  map: Record<string, Level3BrowserState>,
): Record<string, Level3BrowserState> {
  let changed = false;
  const out: Record<string, Level3BrowserState> = {};
  for (const [companyId, entry] of Object.entries(map)) {
    const next = clearSeededGroups(companyId, entry);
    if (next !== entry) changed = true;
    out[companyId] = next;
  }
  if (changed) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(out));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* quota -- the in-memory map is still correct for this session */
    }
  }
  return out;
}

/**
 * Older workspace syncs could store a company under a JSON-quoted key, so the same company ended
 * up twice in the map: `connect` and `"connect"`. Writes always addressed the unquoted one, which
 * is why freshly created apps appeared to vanish -- the list read the quoted entry.
 *
 * Unquoting the key and folding it into its plain twin repairs the map on read. Where both copies
 * exist the plain one wins, because that is the key every writer uses; a quoted copy only fills in
 * a company that has no plain entry at all. The repaired map is written back once so the next read
 * is cheap and the duplicate stops travelling to the server on the next push.
 */
function healQuotedCompanyKeys(
  parsed: Record<string, unknown>,
): Record<string, Level3BrowserState> {
  const out: Record<string, Level3BrowserState> = {};
  let repaired = false;
  for (const [key, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object") continue;
    out[key] = value as Level3BrowserState;
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object") continue;
    let plain = key;
    try {
      const unquoted = JSON.parse(key) as unknown;
      if (typeof unquoted === "string") plain = unquoted;
    } catch {
      continue; // not a quoted key, nothing to heal
    }
    if (plain === key) continue;
    repaired = true;
    const existing = out[plain];
    if (!existing) {
      out[plain] = value as Level3BrowserState;
    } else {
      // Both copies exist: keep the plain one, but take anything the quoted copy alone had, so
      // nothing the user created under the quoted key is dropped.
      out[plain] = {
        ...(value as Level3BrowserState),
        ...existing,
        customApps: mergeById(
          (value as Level3BrowserState).customApps,
          existing.customApps,
        ),
        tabGroups: mergeById(
          (value as Level3BrowserState).tabGroups,
          existing.tabGroups,
        ),
      };
    }
    delete out[key];
  }
  if (repaired) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(out));
    } catch {
      /* quota -- the in-memory map is still correct for this session */
    }
  }
  return out;
}

/** Union by `id`, later entries win. Keeps both copies' contents when a key exists twice. */
function mergeById<T extends { id: string }>(older: T[] | undefined, newer: T[] | undefined): T[] {
  const byId = new Map<string, T>();
  for (const item of older ?? []) byId.set(item.id, item);
  for (const item of newer ?? []) byId.set(item.id, item);
  return [...byId.values()];
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
    tabGroups: [],
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

export function normalizeGroups(
  groups: LabTabGroup[] | undefined,
): LabTabGroup[] {
  if (!Array.isArray(groups)) return [];
  const defaults = defaultTabGroups();
  const defaultIds = new Set(defaults.map((d) => d.id));
  const accented = new Set<GroupAccent>([
    "technische",
    "fundamentals",
    "sentimentalle",
    "sektorielle",
    "build",
    "ai",
  ]);
  // Heal broken state — legacy data created one-off groups per app: label looks like an app
  // name, id WITHOUT the "group-" prefix and no accent. Their known apps go back to Technische.
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

  // Keep the person's own groups, order, app lists and collapsed state as stored. (Earlier this
  // rebuilt default groups from the default app lists on every read and dropped user-created
  // groups, so added/moved apps did not survive a reload.)
  const kept: LabTabGroup[] = [];
  const legacyApps: string[] = [];
  for (const g of groups) {
    if (!g || typeof g.id !== "string") continue;
    const appIds = Array.isArray(g.appIds)
      ? [...new Set(g.appIds.filter((id): id is string => typeof id === "string"))]
      : [];
    const legit =
      defaultIds.has(g.id) ||
      g.id.startsWith("group-") ||
      // Groups created by the bookmark importer. Without this they would be treated as legacy and
      // silently dropped on the next read, so an imported structure would vanish on reload.
      g.id.startsWith("bmg-") ||
      Boolean(g.accent && accented.has(g.accent));
    if (legit) kept.push({ ...g, appIds });
    else legacyApps.push(...appIds.filter((id) => knownAppIds.has(id)));
  }

  // Deduplicate by id while preserving order; drop dangling parents.
  const seen = new Set<string>();
  const unique = kept.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
  return unique.map((g) =>
    g.parentId && !seen.has(g.parentId) ? { ...g, parentId: undefined } : g,
  );
}

/** Editable example Split-Link, seeded once into Technische (deterministic id).
 * SEED_DISABLED — no longer auto-seeded. Kept for reference and manual re-enabling. */
export const SPLIT_EXAMPLE_ID = "split-example-notion-tradingview";

/** Adds the example Split-Link once per company state (flag `splitExampleSeeded`).
 * SEED_DISABLED — the Split-Link is no longer auto-seeded into any group. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _withSplitExample_DISABLED(state: Level3BrowserState): Level3BrowserState {
  return state;
}

// UNUSED — kept so callers don't break. Remove after any callers are updated.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function withSplitExample(state: Level3BrowserState): Level3BrowserState {
  return state; // SEED_DISABLED
}

export function getLevel3Browser(companyId: string): Level3BrowserState {
  // withSplitExample is a no-op (SEED_DISABLED); readLevel3Browser already applies the
  // seeded-group cleanup via readAll().
  return withSplitExample(readLevel3Browser(companyId));
}

function readLevel3Browser(companyId: string): Level3BrowserState {
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

/** Alle Firmen-IDs mit gespeichertem Lab-Browser (für die Favicon-Erfassung). */
export function listLevel3CompanyIds(): string[] {
  return Object.keys(readAll());
}

/** Favicon an einer eigenen App speichern; schreibt nur, wenn sich wirklich etwas ändert. */
export function setLabAppFavicon(
  companyId: string,
  appId: string,
  favicon: string,
): boolean {
  const value = favicon.trim();
  if (!value) return false;
  const prev = getLevel3Browser(companyId);
  const current = prev.customApps.find((a) => a.id === appId);
  if (!current || current.favicon === value) return false;
  setLevel3Browser(companyId, {
    customApps: prev.customApps.map((a) => (a.id === appId ? { ...a, favicon: value } : a)),
  });
  return true;
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

/**
 * Every app the sidebar shows.
 *
 * This used to return the built-in catalogue (LAB_APP_ICONS) plus the person's own apps, so the
 * 21 seeded entries -- MarketTrace, TradingView, BTCUSDT, Claude, Cursor and so on -- were always
 * on screen, could not be deleted, and reappeared on every company. The catalogue is still around
 * for resolveLabApp() so an already-saved app keeps a working URL, but it is no longer part of what
 * the person sees: the list starts empty and holds only what they added.
 */
export function allLabApps(state: Level3BrowserState): LabApp[] {
  return [...state.customApps];
}

/**
 * Look an app up by id across the person's own apps and the built-in catalogue.
 * Used for URL/icon resolution of apps saved before the list became empty-by-default, so those
 * keep working without reappearing in the sidebar.
 */
export function resolveLabApp(
  state: Level3BrowserState,
  appId: string = state.activeTool,
): LabApp | undefined {
  const own = state.customApps.find((a) => a.id === appId);
  if (own) return own;
  return LAB_APP_ICONS.find((a) => a.id === appId);
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

function withProtocol(url: string): string {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export function addCustomLabApp(
  companyId: string,
  input: {
    kind?: LabAppKind;
    label: string;
    url: string;
    /** Split-Link: right URL (kind "split"). */
    url2?: string;
    /** simpleicons.org slug, e.g. "notion" (default: googlechrome). */
    icon?: string;
    groupId?: string;
  },
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const label = input.label.trim();
  const url = input.url.trim();
  const split = input.kind === "split";
  if (!label || !url || (split && !input.url2?.trim())) return prev;
  const withProto = withProtocol(url);
  const id = `${split ? "split" : "custom"}-${Date.now().toString(36)}`;
  const app: LabApp = {
    id,
    kind: split ? "split" : "browser",
    label,
    blurb: split ? "Split-Link" : "Eigene App",
    url: withProto,
    ...(split ? { url2: withProtocol(input.url2 ?? "") } : {}),
    icon: input.icon?.trim().toLowerCase() || "googlechrome",
    tint: split ? "#111111" : "#4285F4",
    builtin: false,
  };
  const groups = [...normalizeGroups(prev.tabGroups)];
  const targetId = input.groupId ?? groups[0]?.id;
  const nextGroups = groups.map((g) =>
    g.id === targetId ? { ...g, appIds: [...g.appIds, id], collapsed: false } : g,
  );
  // Helium / browser: the new entry is only stored — Connect stays on the current view.
  // Connect Desktop (WPF) keeps the old behaviour and shows the new app right away.
  const showNow = isDesktopApp() && !split;
  return setLevel3Browser(companyId, {
    customApps: [...prev.customApps, app],
    tabGroups: nextGroups,
    ...(showNow
      ? { activeTool: id, customUrl: withProto, browsing: true, starred: false }
      : {}),
  });
}

/** Edit an own app / Split-Link (name, icon, URLs). Built-in apps are not editable. */
export function updateCustomLabApp(
  companyId: string,
  appId: string,
  patch: { label?: string; url?: string; url2?: string; icon?: string; groupId?: string },
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const current = prev.customApps.find((a) => a.id === appId);
  if (!current) return prev;
  const next: LabApp = {
    ...current,
    ...(patch.label?.trim() ? { label: patch.label.trim() } : {}),
    ...(patch.url?.trim() ? { url: withProtocol(patch.url) } : {}),
    ...(current.kind === "split" && patch.url2?.trim() ? { url2: withProtocol(patch.url2) } : {}),
    ...(patch.icon !== undefined ? { icon: patch.icon.trim().toLowerCase() || "googlechrome" } : {}),
    ...(current.id === SPLIT_EXAMPLE_ID ? { blurb: "Split-Link" } : {}),
  };
  let tabGroups = normalizeGroups(prev.tabGroups);
  if (patch.groupId && tabGroups.some((g) => g.id === patch.groupId)) {
    const already = tabGroups.find((g) => g.id === patch.groupId)?.appIds.includes(appId);
    if (!already) {
      tabGroups = tabGroups.map((g) =>
        g.id === patch.groupId
          ? { ...g, appIds: [...g.appIds, appId] }
          : { ...g, appIds: g.appIds.filter((id) => id !== appId) },
      );
    }
  }
  return setLevel3Browser(companyId, {
    customApps: prev.customApps.map((a) => (a.id === appId ? next : a)),
    tabGroups,
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

/**
 * Make `groupId` a child of `parentId`.
 *
 * Refuses a move that would detach the whole tree into a cycle (moving a folder into one of its
 * own descendants) and refuses to make a folder a child of itself, so the sidebar tree can never
 * stop rendering the group.
 */
export function moveTabGroupIntoGroup(
  companyId: string,
  groupId: string,
  parentId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const groups = normalizeGroups(prev.tabGroups);
  if (groupId === parentId) return prev;
  if (!groups.some((g) => g.id === groupId)) return prev;
  if (!groups.some((g) => g.id === parentId)) return prev;

  const byId = new Map(groups.map((g) => [g.id, g]));
  // Walk up from the target parent; meeting groupId means the target sits below the folder.
  let cursor: LabTabGroup | undefined = byId.get(parentId);
  while (cursor) {
    if (cursor.id === groupId) return prev;
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  const dragged = byId.get(groupId);
  if (!dragged) return prev;

  // The flat array is the display order for every level, so the folder is re-inserted
  // behind the last existing child of its new parent. Without that it would keep its old
  // slot and could appear before the children it was dropped next to.
  const without = groups.filter((g) => g.id !== groupId);
  let insertAt = without.findIndex((g) => g.id === parentId) + 1;
  for (let i = 0; i < without.length; i += 1) {
    if (without[i].parentId === parentId) insertAt = i + 1;
  }
  without.splice(insertAt, 0, { ...dragged, parentId, collapsed: false });

  return setLevel3Browser(companyId, { tabGroups: without });
}

/**
 * Move `groupId` next to `targetId` -- as a sibling, not as a child.
 *
 * The dragged folder keeps the target's parent, so dragging a subfolder onto the edge of
 * another subfolder swaps it inside that parent instead of lifting it to the top level.
 */
export function moveTabGroupAsSibling(
  companyId: string,
  groupId: string,
  targetId: string,
  placeAfter: boolean,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const groups = normalizeGroups(prev.tabGroups);
  if (groupId === targetId) return prev;
  const dragged = groups.find((g) => g.id === groupId);
  const target = groups.find((g) => g.id === targetId);
  if (!dragged || !target) return prev;

  const without = groups.filter((g) => g.id !== groupId);
  const at = without.findIndex((g) => g.id === targetId);
  if (at < 0) return prev;
  const moved: LabTabGroup = { ...dragged, parentId: target.parentId };
  without.splice(placeAfter ? at + 1 : at, 0, moved);

  return setLevel3Browser(companyId, { tabGroups: without });
}

/**
 * Detach a folder from its parent and put it at the end of the top level.
 *
 * This is the "drop below the last folder" case: a folder that lives inside another one
 * becomes a top-level folder again and stays where it was dropped.
 */
export function moveTabGroupToRootEnd(
  companyId: string,
  groupId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const groups = normalizeGroups(prev.tabGroups);
  const dragged = groups.find((g) => g.id === groupId);
  if (!dragged) return prev;

  const without = groups.filter((g) => g.id !== groupId);
  without.push({ ...dragged, parentId: undefined });
  return setLevel3Browser(companyId, { tabGroups: without });
}

/**
 * Detach a folder from its parent so it becomes a top-level folder again, keeping its own apps and
 * subfolders.
 *
 * This is the inverse of moveTabGroupIntoGroup and is what a drag out of a folder performs. A
 * folder that is already at the root is left untouched, and the move is refused when the folder
 * does not exist, so callers can pass the id of whatever is under the pointer without pre-checking.
 */
export function moveTabGroupToRoot(
  companyId: string,
  groupId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const groups = normalizeGroups(prev.tabGroups);
  const target = groups.find((g) => g.id === groupId);
  if (!target) return prev;
  if (!target.parentId) return prev;

  return setLevel3Browser(companyId, {
    tabGroups: groups.map((g) =>
      g.id === groupId ? { ...g, parentId: undefined } : g,
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

/**
 * Move a folder within its own level -- up, down, to the top or to the bottom.
 *
 * "Within its own level" means among the folders that share its parent: a folder inside
 * "Tool Stack" moves among the other folders inside "Tool Stack", never out of it and
 * never in front of a top-level folder. The folders of the other levels keep their
 * positions, so nothing else in the tree shifts.
 */
export function reorderTabGroupWithinSiblings(
  companyId: string,
  groupId: string,
  mode: "start" | "up" | "down" | "end",
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const groups = normalizeGroups(prev.tabGroups);
  const target = groups.find((g) => g.id === groupId);
  if (!target) return prev;

  const sameLevel = (g: LabTabGroup) =>
    (g.parentId ?? undefined) === (target.parentId ?? undefined);
  const siblings = groups.filter(sameLevel);
  const index = siblings.findIndex((g) => g.id === groupId);
  if (index < 0) return prev;

  let nextIndex = index;
  if (mode === "start") nextIndex = 0;
  else if (mode === "end") nextIndex = siblings.length - 1;
  else if (mode === "up") nextIndex = Math.max(0, index - 1);
  else if (mode === "down") nextIndex = Math.min(siblings.length - 1, index + 1);
  if (nextIndex === index) return prev;

  const reordered = [...siblings];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(nextIndex, 0, moved);

  // Rebuild the flat list: the slots of this level are filled with the new order,
  // every other level keeps its folders where they were.
  const byId = new Map(groups.map((g) => [g.id, g]));
  let cursor = 0;
  const next = groups.map((g) => {
    if (!sameLevel(g)) return g;
    const replacement = reordered[cursor];
    cursor += 1;
    return byId.get(replacement.id) ?? g;
  });

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

/**
 * Payload of a note dragged out of the notes list.
 *
 * A custom MIME type rather than `text/plain` because this sidebar already drags apps and folders
 * with their own types. Sharing `text/plain` would let an app row be dropped on a folder and be
 * read as a note, silently re-filing instead of moving the app.
 */
export const DND_NOTE = "application/x-connect-note";

/**
 * Folder the dragged note came from, so a drop onto that same folder can be ignored. Empty string
 * stands for "Allgemein", which has no id.
 */
export const DND_NOTE_FROM = "application/x-connect-note-from-folder";

/**
 * Payload of a vault planning note dragged from the planning tree to a group.
 */
export const DND_VAULT_NOTE = "application/x-connect-vault-note";

/**
 * Add a linked reference to a vault planning note into a browser group.
 * The original note file on disk remains untouched.
 */
export function linkVaultNoteToGroup(
  companyId: string,
  notePath: string,
  label: string,
  groupId: string,
): Level3BrowserState {
  const prev = getLevel3Browser(companyId);
  const cleanLabel = label.replace(/\.md$/i, "").trim() || "Notiz";
  const existing = prev.customApps.find(
    (a) => (a.kind === "note" || !!a.notePath) && a.notePath === notePath,
  );
  let appId: string;
  let customApps = [...prev.customApps];
  if (existing) {
    appId = existing.id;
  } else {
    appId = `note-link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newApp: LabApp = {
      id: appId,
      kind: "note",
      label: cleanLabel,
      blurb: "Planung Notiz",
      icon: "note",
      tint: "#0ea5e9",
      notePath,
      builtin: false,
    };
    customApps.push(newApp);
  }

  const groups = normalizeGroups(prev.tabGroups);
  const nextGroups = groups.map((g) => {
    if (g.id === groupId) {
      if (!g.appIds.includes(appId)) {
        return { ...g, appIds: [...g.appIds, appId], collapsed: false };
      }
      return { ...g, collapsed: false };
    }
    return g;
  });

  return setLevel3Browser(companyId, {
    customApps,
    tabGroups: nextGroups,
  });
}

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

/**
 * The ids of `groupId` and all of its descendants.
 *
 * Used to grey out the folders a folder cannot be dropped into -- a folder cannot become
 * a child of itself, and it cannot become a child of one of its own subfolders, because
 * that would detach the subtree from the tree and the sidebar would stop showing it.
 */
export function tabGroupDescendantIds(
  state: Level3BrowserState,
  groupId: string,
): string[] {
  const groups = normalizeGroups(state.tabGroups);
  const childrenOf = new Map<string, string[]>();
  for (const g of groups) {
    if (!g.parentId) continue;
    const list = childrenOf.get(g.parentId) ?? [];
    list.push(g.id);
    childrenOf.set(g.parentId, list);
  }
  const out: string[] = [];
  const walk = (id: string) => {
    for (const child of childrenOf.get(id) ?? []) {
      if (out.includes(child)) continue;
      out.push(child);
      walk(child);
    }
  };
  walk(groupId);
  return out;
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

/**
 * cdn.simpleicons.org liefert 404 für Slugs, die Simple Icons nicht (mehr) führt –
 * u. a. "chart", "activity", "calendar", "category", "mail", "device-desktop",
 * "flame" und "openai" (Logo 2024 auf Wunsch des Herstellers entfernt).
 * Diese Namen werden auf einen existierenden, verifizierten Brand-Slug umgeschrieben.
 * Unbekannte Namen bleiben unverändert; die Aufrufer (ToolGlyph, McpServerLogo)
 * rendern dann über ihr onError einen lokalen Platzhalter.
 */
const ICON_SLUG_ALIASES: Record<string, string> = {
  openai: "claude", // OpenAI-Slug entfernt -> neutraler AI-Slug.
  mail: "gmail",
  calendar: "googlecalendar",
  category: "coinmarketcap",
  chart: "tradingview",
  activity: "tradingview",
  "device-desktop": "ubuntu",
  flame: "cryptopanic",
};

export function toolIconUrl(icon: string): string {
  return `https://cdn.simpleicons.org/${ICON_SLUG_ALIASES[icon] ?? icon}`;
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

// ---------------------------------------------------------------------------
// Bookmark import / export
//
// The sidebar nests folders arbitrarily deep and the user has to be able to move that structure
// between browsers and machines. The native Netscape bookmark HTML is the only interchange every
// major browser consumes, so export writes that and import parses it. Folders stay folders, so a
// round-trip loses nothing.
//
// Our own extras (icon, tint, split-URL, blurb) do not exist in that format. They are preserved as
// ADD_DATE-style custom attributes, which browsers ignore -- so the file still imports cleanly
// elsewhere, while a return trip into Connect restores the original look.
// ---------------------------------------------------------------------------

export const BOOKMARK_FORMAT = "connect-level3-bookmarks";

export type LabBookmarkNode = {
  label: string;
  /** Child folders of this folder. */
  folders: LabBookmarkNode[];
  /** Bookmarks in this folder. */
  items: LabBookmarkItem[];
};

export type LabBookmarkItem = {
  label: string;
  url?: string;
  url2?: string;
  blurb?: string;
  /** Icon slug of the source app, so a round-trip keeps the look. */
  icon?: string;
  tint?: string;
  /** Set when the entry was a "computer"/"split" app rather than a plain bookmark. */
  kind?: LabAppKind;
};

/** Escape the XML entities so a folder or app name can never break the file. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Undo `xmlEscape`; also decodes the numeric spellings other exporters emit. */
function xmlUnescape(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&amp;/g, "&");
}

function indentOf(depth: number): string {
  return "    ".repeat(depth);
}

function renderNodes(nodes: LabBookmarkNode[], depth: number): string {
  const pad = indentOf(depth);
  return nodes
    .map((node) => {
      const lines: string[] = [`${pad}<DT><H3>${xmlEscape(node.label)}</H3>`];
      const body: string[] = [];
      for (const item of node.items) {
        // A bookmark with no URL cannot be a link; it is still written so nothing is silently
        // dropped, and import reads it back as a plain entry.
        const extra: string[] = [];
        if (item.icon) extra.push(`DATA-ICON="${xmlEscape(item.icon)}"`);
        if (item.tint) extra.push(`DATA-TINT="${xmlEscape(item.tint)}"`);
        if (item.url2) extra.push(`DATA-URL2="${xmlEscape(item.url2)}"`);
        if (item.blurb) extra.push(`DATA-BLURB="${xmlEscape(item.blurb)}"`);
        if (item.kind && item.kind !== "browser") {
          extra.push(`DATA-KIND="${xmlEscape(item.kind)}"`);
        }
        const attrs = item.url
          ? `HREF="${xmlEscape(item.url)}"${extra.length ? ` ${extra.join(" ")}` : ""}`
          : extra.join(" ");
        body.push(
          `${pad}    <DT><A ${attrs}>${xmlEscape(item.label)}</A>`,
        );
      }
      if (node.folders.length > 0) {
        body.push(renderNodes(node.folders, depth + 1));
      }
      lines.push(`${pad}<DL><p>`, ...body, `${pad}</DL><p>`);
      return lines.join("\n");
    })
    .join("\n");
}

/** Build the full Netscape bookmark file for a folder tree. */
export function buildBookmarkHtml(
  tree: LabBookmarkNode[],
  meta: { companyId: string; companyName?: string },
): string {
  const title = meta.companyName?.trim() || "Connect";
  return [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    `<!-- This is an automatically generated file.`,
    `     Exported from Connect · ${title}.`,
    "     It opens in Chrome, Edge, Firefox and Safari; re-importing it in Connect restores",
    "     the folders, the nesting and the icons. -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
    renderNodes(tree, 1),
    "</DL><p>",
    "",
  ].join("\n");
}

export type LabBookmarkParseResult = {
  tree: LabBookmarkNode[];
  /** Number of bookmarks read, for the confirmation dialog. */
  count: number;
  /** How many folders were read, for the confirmation dialog. */
  folderCount: number;
  /** Non-fatal problems, surfaced before the user commits the import. */
  warnings: string[];
};

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z0-9_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag)) !== null) {
    attrs[match[1]!.toUpperCase()] = match[3] ?? match[4] ?? match[5] ?? "";
  }
  return attrs;
}

type MarkupToken =
  | { kind: "tag"; value: string }
  | { kind: "text"; value: string };

/**
 * Split markup into tags and text runs, treating a ">" inside a quoted attribute value as literal
 * text rather than the end of the tag. A regex like /<[^>]*>/ cannot do this, and bookmark files
 * really do contain such URLs (e.g. HREF="https://x.example/?a=1>0").
 */
function tokenizeMarkup(input: string): MarkupToken[] {
  const tokens: MarkupToken[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] !== "<") {
      let end = input.indexOf("<", i);
      if (end === -1) end = input.length;
      const value = input.slice(i, end);
      if (value.trim()) tokens.push({ kind: "text", value });
      i = end;
      continue;
    }
    let j = i + 1;
    let quote: string | null = null;
    while (j < input.length) {
      const ch = input[j]!;
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        break;
      }
      j += 1;
    }
    // An unterminated tag runs to the end of the input; taking the rest is the safe reading.
    tokens.push({ kind: "tag", value: input.slice(i, j + 1) });
    i = j + 1;
  }
  return tokens;
}

/**
 * Parse Netscape bookmark HTML.
 *
 * Written as a small tag scanner rather than DOMParser so it stays dependency-free and can run
 * against a pasted string as well as a file. It is deliberately lenient: unknown attributes are
 * ignored, and a malformed line is skipped instead of failing the whole import. A folder is
 * `<DT><H3>name</H3>` followed by `<DL>`; `</DL>` closes it. That is the whole grammar that matters,
 * and everything else in the file is noise to us.
 */
export function parseBookmarkHtml(html: string): LabBookmarkParseResult {
  const warnings: string[] = [];
  const root: LabBookmarkNode = { label: "", folders: [], items: [] };
  // Nodes whose <DL> is currently open. The root is always at the bottom.
  const stack: LabBookmarkNode[] = [root];
  const current = () => stack[stack.length - 1]!;

  // Comments carry no structure and can contain arbitrary text, so drop them first.
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, "");
  // Two things a naive /<[^>]*>/ regex gets wrong, and both occur in real files:
  //   1. A label is the TEXT between <H3> and </H3> (or <A> and </A>), not part of the tag, so the
  //      scanner has to yield text runs too -- otherwise every folder and bookmark loses its name.
  //   2. A quoted attribute may legally contain ">" (a URL with a query string, for one), so a tag
  //      only ends at a ">" outside quotes. Hence a manual walk.
  const tokens = tokenizeMarkup(cleaned);

  // Label of the element being read, and the attributes of an <A> waiting for its text.
  let text = "";
  let anchor: Record<string, string> | null = null;
  /** Folder whose name is still being collected, committed on </H3>. */
  let openFolder: LabBookmarkNode | null = null;

  const flushAnchor = () => {
    if (!anchor) return;
    const attrs = anchor;
    const url = attrs.HREF ? xmlUnescape(attrs.HREF).trim() : "";
    const label = xmlUnescape(text.trim());
    const item: LabBookmarkItem = {
      label: label || url || "Ohne Titel",
      url: url || undefined,
      url2: attrs["DATA-URL2"] ? xmlUnescape(attrs["DATA-URL2"]) : undefined,
      blurb: attrs["DATA-BLURB"] ? xmlUnescape(attrs["DATA-BLURB"]) : undefined,
      icon: attrs["DATA-ICON"] ? xmlUnescape(attrs["DATA-ICON"]) : undefined,
      tint: attrs["DATA-TINT"] ? xmlUnescape(attrs["DATA-TINT"]) : undefined,
      kind:
        attrs["DATA-KIND"] === "computer" || attrs["DATA-KIND"] === "split"
          ? (attrs["DATA-KIND"] as LabAppKind)
          : undefined,
    };
    if (!item.url) {
      warnings.push(`"${item.label}" hat keine URL und wird ohne Klickfunktion angelegt.`);
    }
    current().items.push(item);
    anchor = null;
    text = "";
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      if (anchor || openFolder) text += token.value;
      continue;
    }
    const tag = token.value;
    const upper = tag.toUpperCase();

    if (upper.startsWith("</")) {
      if (upper.startsWith("</A")) {
        flushAnchor();
        continue;
      }
      if (upper.startsWith("</H3")) {
        if (openFolder) openFolder.label = xmlUnescape(text.trim()) || "Ohne Titel";
        openFolder = null;
        text = "";
        continue;
      }
      if (upper.startsWith("</DL") && stack.length > 1) {
        stack.pop();
      }
      continue;
    }

    if (upper.startsWith("<A")) {
      // Defensive: a file that leaves an <A> unclosed must not swallow the next bookmark.
      flushAnchor();
      anchor = parseAttributes(tag);
      text = "";
      continue;
    }

    if (upper.startsWith("<H3")) {
      const node: LabBookmarkNode = { label: "", folders: [], items: [] };
      current().folders.push(node);
      // Pushed immediately: the matching </DL> closes the folder, so bookmarks read before that
      // land in `node`. A file that omits the final </DL> still keeps everything to the end.
      stack.push(node);
      openFolder = node;
      text = "";
      continue;
    }

    // <DL>, <DT>, <META>, <TITLE>, <H1>, <BODY> … carry no information for us.
  }
  // Tolerate a file that ends without closing the last <A> or </H3>.
  flushAnchor();
  if (openFolder) openFolder.label = xmlUnescape(text.trim()) || "Ohne Titel";

  // Bookmarks that sat outside any folder still belong to the user, so they are collected in one
  // extra folder instead of being dropped.
  const tree: LabBookmarkNode[] = [...root.folders];
  if (root.items.length > 0) {
    tree.push({ label: "Importierte Lesezeichen", folders: [], items: root.items });
  }

  let count = 0;
  let folderCount = 0;
  const walk = (nodes: LabBookmarkNode[]) => {
    for (const node of nodes) {
      folderCount += 1;
      count += node.items.length;
      walk(node.folders);
    }
  };
  walk(tree);

  if (tree.length === 0) {
    warnings.push("In der Datei wurden keine Lesezeichen gefunden.");
  }

  return { tree, count, folderCount, warnings };
}

/** Read a user-picked file as text, rejecting anything that is not a bookmark file. */
export async function readBookmarkFile(file: File): Promise<string> {
  const text = await file.text();
  if (!/<A[\s>]/i.test(text) && !/<H3[\s>]/i.test(text)) {
    throw new Error(
      "Das ist keine gültige Lesezeichen-Datei. Bitte eine exportierte HTML-Datei wählen.",
    );
  }
  return text;
}

/** Trigger a browser download of the bookmark file. */
export function downloadBookmarkFile(
  filename: string,
  html: string,
): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next tick so Safari has read the blob before it is released.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Turn one parsed bookmark into an app. Built-ins are skipped: their id must stay stable. */
function appFromBookmark(
  node: LabBookmarkNode,
  item: LabBookmarkItem,
  builtinIds: Set<string>,
): LabApp | null {
  // Built-in apps are identified by id, and the export writes the icon, not the id. Matching on
  // the URL keeps an exported built-in from being duplicated as a second custom app.
  const id = `bm-${hashString(`${item.url ?? ""}|${item.label}`)}`;
  if (builtinIds.has(id)) return null;
  return {
    id,
    kind: item.kind ?? "browser",
    label: item.label,
    blurb: item.blurb?.trim() || "Aus Lesezeichen importiert",
    url: item.url,
    url2: item.url2,
    icon: item.icon?.trim() || "globe",
    tint: item.tint?.trim() || "#64748B",
  };
}

/** Small, stable, collision-tolerant id hash. */
function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export type LabImportPreview = {
  /** Next state with everything imported, for the user to confirm. */
  next: Level3BrowserState;
  addedApps: number;
  addedFolders: number;
  /** Bookmarks that matched an existing app and were skipped. */
  skippedDuplicates: number;
  warnings: string[];
};

/**
 * Build the state that results from importing `tree`, without writing anything.
 *
 * Returning the next state instead of mutating in place lets the caller show a preview and let the
 * user cancel. Import only ever adds: an existing folder or app is left exactly as it is, so a
 * double import cannot destroy work.
 */
export function buildImportState(
  state: Level3BrowserState,
  tree: LabBookmarkNode[],
): LabImportPreview {
  const existingApps = allLabApps(state);
  const existingKeys = new Set(
    existingApps.map((a) => `${(a.url ?? "").trim().toLowerCase()}|${a.label.trim().toLowerCase()}`),
  );
  const builtinIds = new Set(
    LAB_APP_ICONS.map((a) => `bm-${hashString(`${a.url ?? ""}|${a.label}`)}`),
  );

  const newApps: LabApp[] = [];
  const newGroups: LabTabGroup[] = [];
  const warnings: string[] = [];
  let addedApps = 0;
  let skippedDuplicates = 0;
  // Ids are unique per import run so a folder never merges with a same-named one from a previous run.
  let seq = 0;

  const addGroup = (
    node: LabBookmarkNode,
    parentId: string | undefined,
  ): void => {
    seq += 1;
    const groupId = `bmg-${Date.now().toString(36)}-${seq}`;
    const appIds: string[] = [];
    for (const item of node.items) {
      const key = `${(item.url ?? "").trim().toLowerCase()}|${item.label.trim().toLowerCase()}`;
      if (existingKeys.has(key)) {
        skippedDuplicates += 1;
        continue;
      }
      const app = appFromBookmark(node, item, builtinIds);
      if (!app) {
        skippedDuplicates += 1;
        continue;
      }
      existingKeys.add(key);
      newApps.push(app);
      appIds.push(app.id);
      addedApps += 1;
    }
    newGroups.push({
      id: groupId,
      label: node.label,
      parentId,
      appIds,
      collapsed: false,
    });
    for (const child of node.folders) {
      addGroup(child, groupId);
    }
  };

  for (const root of tree) {
    addGroup(root, undefined);
  }

  return {
    next: {
      ...state,
      customApps: [...state.customApps, ...newApps],
      tabGroups: [...normalizeGroups(state.tabGroups), ...newGroups],
      updatedAt: new Date().toISOString(),
    },
    addedApps,
    addedFolders: newGroups.length,
    skippedDuplicates,
    warnings,
  };
}

/** Folder tree of a company, shaped for the export file. */
export function toBookmarkTree(state: Level3BrowserState): LabBookmarkNode[] {
  const { roots } = labFolderTree(state);
  const toNode = (node: LabFolderNode): LabBookmarkNode => ({
    label: node.label,
    folders: node.children.map(toNode),
    items: node.apps.map((app) => ({
      label: app.label,
      url: app.url,
      url2: app.url2,
      blurb: app.blurb,
      icon: app.icon,
      tint: app.tint,
      kind: app.kind,
    })),
  });
  return roots.map(toNode);
};
