/**
 * Storage keys — the single source of truth for every `localStorage` /
 * `window.localStorage` key the app touches.
 *
 * Add a new key here, in the section that fits what it stores. Naming rule:
 * `<area>.<thing>` (e.g. `connect.activeCompanyId`, `connect.shortcuts`).
 * Two areas today (`connect.*` for the Connect app, `connect.*` for legacy
 * keys that pre-date the rename — keep them until a migration removes them).
 *
 * Why centralise:
 *   - one grep finds every key the app reads or writes
 *   - a rename is one edit, not thirty
 *   - new contributors don't sprinkle raw string keys into components
 *
 * If you find a raw string key in the code that is not listed here, that is a
 * bug — add the constant here and import it where the string lived.
 */
export const STORAGE_KEYS = {
  /** Which company the user is currently working in. Read in 4+ places. */
  activeCompanyId: "connect.activeCompanyId",

  /** Persisted dark / light theme. Owned by theme-provider.tsx. */
  theme: "connect.theme",

  /** i18n locale (`de`, `en`). Owned by lib/i18n/locale.ts. */
  locale: "connect.locale",

  /** Lab (level-3 browser) preferences: tabs, recent URLs, layout. */
  labPrefs: "connect.lab.prefs",

  /** Per-agent API keys, per-agent identity, etc. See lib/agents/*.ts. */
  agentIdentity: "connect.agent-identity",
  agentApiKeys: "connect.agent-api-keys",
  agentGlobalApiKeys: "connect.global-api-keys",
  agentBrowserTabs: "connect.agent-browser-tabs",
  agentComputer: "connect.agent-computer",
  agentComputerLegacyMode: "connect.agent-computer.legacy-mode",
  codexApiKeySource: "connect.codex.api-key-source",
  zgptProfiles: "connect.zgpt-profiles",
  shellDispatchPending: "connect.shell-dispatch.pending",
  connectAvatars: "connect.avatars",
  modelProviderPrefs: "connect.model-provider",

  /** Companies: list cache, site overrides, sidebar order, workspace sync. */
  companySite: "connect.company-site",
  sidebarOrder: "connect.sidebar-order",
  posts: "connect.posts",
  siteMark: "connect.site-mark",
  workspaceSyncPrefix: "connect.workspace-sync.",

  /** Local-profile (name, avatar) — used in every user menu. */
  localProfile: "connect.local-profile",

  /** Local auth — email + PIN hash + unlock flag. See lib/auth/local-security.ts. */
  localAuthEmail: "connect.local-auth.email",
  localAuthPinHash: "connect.local-auth.pin-hash",
  localAuthPinUnlocked: "connect.local-auth.pin-unlocked",

  /** Email-style aliases for the Manus mail integration. */
  manusMail: "connect.manus-mail",
  manusAliases: "connect.manus-aliases",

  /** Focus-timer (sidebar footer). */
  focusTimer: "connect.focus-timer",

  /** Floating chat panel position. */
  floatingPanelPos: "connect.floating-panel.pos",

  /** MCP local servers registry. */
  mcpLocalServers: "connect.mcp.local-servers",

  /** Bot thread storage key (template — resolved at call-site per agentId). */
  botThreadPrefix: "connect.bot-thread.",

  /** Per-company workspace state (template — resolved with companyId). */
  siteWorkspacePrefix: "connect.site-workspace.",

  /** Legacy / connect.* keys kept for backwards compatibility. */
  shortcuts: "connect.shortcuts",
  shortcutsBridge: "connect.shortcuts.bridge",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** True if the given key belongs to our app's storage namespace. */
export function isAppStorageKey(key: string): boolean {
  return (
    key.startsWith("connect.") ||
    key.startsWith("connect.") ||
    Object.values(STORAGE_KEYS).some(
      (k) => k === key || (k.endsWith(".") && key.startsWith(k)),
    )
  );
}

/** Keys that should NOT survive a `clear()` (kept across workspace resets). */
export const PERSISTENT_KEYS: readonly string[] = [
  STORAGE_KEYS.activeCompanyId,
  STORAGE_KEYS.theme,
  STORAGE_KEYS.locale,
  STORAGE_KEYS.localAuthEmail,
];
