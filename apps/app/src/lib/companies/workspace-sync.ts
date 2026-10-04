/**
 * Sync Connect logos, banners, avatars, companies, groups and sidebar order
 * into local Postgres (`/api/connect/*`) so every localhost on the same DB
 * sees the same files — localStorage alone does not travel.
 */

import { client } from "@/lib/client";
import { mergeWorkspaceValue } from "./workspace-merge";

const WORKSPACE_KEYS = [
  "connect.companies.custom",
  "connect.projects",
  "connect.projects.seeded.v1",
  "connect.avatar.overrides",
  "connect.sidebar.agentOrder.v1",
  "connect.activeCompanyId",
  "connect.activeLevel",
  "connect.company-posts",
  "connect.company-connections",
  "connect.local-profile",
  /** Lab Browser: tab groups, apps, connections — per account via API. */
  "connect.level3.browser",
  "connect.company.siteUrl",
  "connect.lab.prefs",
  "connect.account",
  /** Theme: Light/Dark mode persists across sign-in/sign-out. */
  "connect-theme",
] as const;

let hydrateStarted = false;
let pushTimer: number | null = null;

/*
 * Sync bookkeeping (stays in this browser profile only):
 *   connect.workspace-sync.base.<key>  value of <key> as last synced with Postgres
 *   connect.workspace-sync.owner       userId that local workspace belongs to
 * With the baseline a client can tell "I changed it" from "another client changed it", so a stale
 * window no longer overwrites newer data, and a push only sends keys that really changed locally.
 * The push sends the base along; the server three-way merges (workspace-merge.ts) instead of
 * overwriting and returns the merged value.
 */
const SYNC_BASE_PREFIX = "connect.workspace-sync.base.";
const SYNC_OWNER_KEY = "connect.workspace-sync.owner";

function rawLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function serialize(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parseLoose(raw: string | null): unknown {
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/** Order-independent comparison (jsonb reorders object keys). */
function canonical(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (typeof v === "string") {
      const t = v.trim();
      if (t.startsWith("{") || t.startsWith("[")) {
        try {
          return norm(JSON.parse(t));
        } catch {
          return v;
        }
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = norm((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value) ?? null);
}

function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function getBase(key: string): string | null {
  return rawLocal(SYNC_BASE_PREFIX + key);
}

function setBase(key: string, value: unknown) {
  try {
    if (value === undefined || value === null) {
      window.localStorage.removeItem(SYNC_BASE_PREFIX + key);
    } else {
      window.localStorage.setItem(SYNC_BASE_PREFIX + key, serialize(value));
    }
  } catch {
    /* quota */
  }
}

function accountUserId(value: unknown): string | null {
  const v = typeof value === "string" ? parseLoose(value) : value;
  if (v && typeof v === "object" && typeof (v as Record<string, unknown>).userId === "string") {
    return (v as Record<string, string>).userId;
  }
  return null;
}

function readLocal(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  } catch {
    return undefined;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    if (value === undefined || value === null) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  } catch {
    /* quota / private mode */
  }
}

/** Upload a data-URL image; returns a durable `/api/connect/media/…` URL. */
export async function persistConnectDataUrl(
  dataUrl: string,
  preferredId?: string,
): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  return client<string>("/api/connect/media", "url", {
    method: "POST",
    body: { dataUrl, id: preferredId },
    fallback: "Could not store image in database",
  });
}

async function rewriteDataUrlsInValue(value: unknown): Promise<unknown> {
  if (typeof value === "string" && value.startsWith("data:")) {
    try {
      return await persistConnectDataUrl(value);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    const next = [];
    for (const item of value) {
      next.push(await rewriteDataUrlsInValue(item));
    }
    return next;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await rewriteDataUrlsInValue(v);
    }
    return out;
  }
  return value;
}

/** Notify the UI that workspace values were replaced from the database. */
function announceWorkspaceChange() {
  for (const name of [
    "connect-companies-changed",
    "connect-avatars-changed",
    "connect-projects-changed",
    "connect-sidebar-order-changed",
    "connect-active-company",
    "connect-local-profile-changed",
    "connect-level3-browser-changed",
    "connect-company-site-changed",
    "connect-lab-prefs-changed",
  ]) {
    window.dispatchEvent(new Event(name));
  }
}

/** Serialise push/pull so a refresh never interleaves with an upload. */
let syncChain: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = syncChain.then(task, task);
  syncChain = run.catch(() => undefined);
  return run;
}

function changedKeys(): string[] {
  const keys: string[] = [];
  for (const key of WORKSPACE_KEYS) {
    const value = readLocal(key);
    if (value === undefined) continue;
    const base = getBase(key);
    if (base !== null && sameValue(parseLoose(base), value) && !rawLocal(key)?.includes("data:")) continue;
    keys.push(key);
  }
  return keys;
}

function basesFor(keys: string[]): Record<string, unknown> {
  const bases: Record<string, unknown> = {};
  for (const key of keys) {
    const base = getBase(key);
    if (base !== null) bases[key] = parseLoose(base);
  }
  return bases;
}

/**
 * Push locally changed workspace keys. The server three-way merges each key against the base this
 * browser last saw (never a blind overwrite) and answers with the merged value, which becomes the
 * local value (when nothing changed meanwhile) and the new base.
 */
export function pushConnectWorkspace(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return exclusive(async () => {
    const keys = changedKeys();
    if (keys.length === 0) return;
    const workspace: Record<string, unknown> = {};
    const sentRaw: Record<string, string | null> = {};
    for (const key of keys) {
      workspace[key] = await rewriteDataUrlsInValue(readLocal(key));
      writeLocal(key, workspace[key]);
      sentRaw[key] = rawLocal(key);
    }
    const response = await client("/api/connect/workspace", {
      method: "PUT",
      body: { workspace, bases: basesFor(keys) },
      fallback: "Could not sync workspace to database",
    });
    const result = (await response.json().catch(() => null)) as { workspace?: Record<string, unknown> } | null;
    // Older servers answer without `workspace`: then what was sent is what is stored.
    const merged = result && typeof result.workspace === "object" ? result.workspace : undefined;
    let changed = false;
    let again = false;
    for (const key of keys) {
      const serverValue = merged && key in merged ? merged[key] : workspace[key];
      if (rawLocal(key) === sentRaw[key]) {
        if (!sameValue(parseLoose(rawLocal(key)), serverValue)) {
          writeLocal(key, serverValue);
          changed = true;
        }
      } else {
        again = true; // edited while the request was in flight: push that edit next
      }
      setBase(key, serverValue);
    }
    if (changed) announceWorkspaceChange();
    if (again) scheduleConnectWorkspacePush();
  });
}

/** Schedule a debounced push after local edits. */
export function scheduleConnectWorkspacePush() {
  if (typeof window === "undefined") return;
  if (pushTimer != null) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void pushConnectWorkspace().catch(() => {
      /* offline / unauthenticated — keep localStorage */
    });
  }, 600);
}

/**
 * Flush a pending (debounced) push when the page is hidden or closed, so a sidebar change made just
 * before closing the Connect window still reaches Postgres. Uses `keepalive` (works during unload).
 * Values are sent as they are; data: URLs are uploaded by the next regular push.
 */
function flushPendingPushOnHide() {
  if (pushTimer == null) return;
  window.clearTimeout(pushTimer);
  pushTimer = null;
  const keys = changedKeys().filter((key) => !rawLocal(key)?.includes("data:"));
  if (keys.length === 0) return;
  const workspace: Record<string, unknown> = {};
  for (const key of keys) workspace[key] = readLocal(key);
  try {
    void fetch("/api/connect/workspace", {
      method: "PUT",
      credentials: "include",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace, bases: basesFor(keys) }),
    }).catch(() => undefined);
  } catch {
    /* body too large for keepalive / offline — localStorage still has it, next start pushes it */
  }
}

function isEmptyWorkspaceValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * Pull the workspace from Postgres into localStorage (on start, every minute while visible and when
 * the window gets focus, so edits from other devices / the Supabase sync show up).
 * Per key: unchanged here -> database value; changed only here -> keep and push; changed on both
 * sides -> three-way merge (deletions only where the other side did not edit), then push.
 * After switching account the database value of the signed-in account wins.
 */
async function pullConnectWorkspace(): Promise<void> {
  const workspace = await client<Record<string, unknown>>("/api/connect/workspace", "workspace", {
    fallback: "Could not load workspace from database",
  });
  let changed = false;
  const serverUser = accountUserId(workspace?.["connect.account"]);
  const storedOwner = rawLocal(SYNC_OWNER_KEY) ?? accountUserId(rawLocal("connect.account"));
  const ownerChanged = Boolean(serverUser && storedOwner && serverUser !== storedOwner);
  if (ownerChanged) {
    for (const key of WORKSPACE_KEYS) {
      const value = workspace?.[key];
      if (value === undefined || isEmptyWorkspaceValue(value)) {
        if (rawLocal(key) != null) {
          writeLocal(key, undefined);
          changed = true;
        }
        setBase(key, undefined);
      } else {
        writeLocal(key, value);
        setBase(key, value);
        changed = true;
      }
    }
  } else {
    for (const [key, value] of Object.entries(workspace ?? {})) {
      if (!WORKSPACE_KEYS.includes(key as (typeof WORKSPACE_KEYS)[number])) continue;
      if (value === undefined || value === null) continue;
      const local = rawLocal(key);
      const base = getBase(key);
      if (local == null || (base === null && localLooksEmpty(local))) {
        if (!isEmptyWorkspaceValue(value)) {
          writeLocal(key, value); // nothing local yet: take the database value
          changed = true;
        }
        setBase(key, value);
      } else if (sameValue(parseLoose(local), value)) {
        setBase(key, value); // already in sync
      } else if (base !== null && sameValue(parseLoose(local), parseLoose(base))) {
        writeLocal(key, value); // unchanged here, changed elsewhere: take it
        setBase(key, value);
        changed = true;
      } else if (base !== null && sameValue(value, parseLoose(base))) {
        // changed only here: keep local, the push below uploads it
      } else {
        // changed on both sides (or first sync of this profile): merge, nothing newer gets lost
        const merged = mergeWorkspaceValue(base === null ? undefined : parseLoose(base), value, parseLoose(local)).value;
        writeLocal(key, merged);
        setBase(key, value);
        changed = true;
      }
    }
  }
  if (serverUser) {
    try {
      window.localStorage.setItem(SYNC_OWNER_KEY, serverUser);
    } catch {
      /* quota */
    }
  }
  if (changed) announceWorkspaceChange();
}

function localLooksEmpty(raw: string | null): boolean {
  return raw == null || raw === "" || raw === "[]" || raw === "{}";
}

let lastPull = 0;
const REFRESH_MS = 60_000;

/** Pull (unless an edit is waiting to be pushed), then push what changed locally. */
export function refreshConnectWorkspace(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (pushTimer != null) return Promise.resolve();
  lastPull = Date.now();
  return exclusive(pullConnectWorkspace).then(() => pushConnectWorkspace());
}

export async function hydrateConnectWorkspace(): Promise<void> {
  if (typeof window === "undefined" || hydrateStarted) return;
  hydrateStarted = true;
  try {
    await refreshConnectWorkspace();
  } catch {
    hydrateStarted = false;
    return;
  }
  window.setInterval(() => {
    if (document.visibilityState === "visible" && Date.now() - lastPull >= REFRESH_MS - 1000) {
      void refreshConnectWorkspace().catch(() => undefined);
    }
  }, REFRESH_MS);
  window.addEventListener("focus", () => {
    if (Date.now() - lastPull > 10_000) void refreshConnectWorkspace().catch(() => undefined);
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingPushOnHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingPushOnHide();
  });
}
