/**
 * Sync Connect logos, banners, avatars, companies, groups and sidebar order
 * into local Postgres (`/api/connect/*`) so every localhost on the same DB
 * sees the same files — localStorage alone does not travel.
 */

import { client } from "@/lib/client";

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

/** Push current localStorage workspace into Postgres. */
export async function pushConnectWorkspace(): Promise<void> {
  if (typeof window === "undefined") return;
  const workspace: Record<string, unknown> = {};
  for (const key of WORKSPACE_KEYS) {
    const value = readLocal(key);
    if (value !== undefined) {
      workspace[key] = await rewriteDataUrlsInValue(value);
      writeLocal(key, workspace[key]);
    }
  }
  await client("/api/connect/workspace", {
    method: "PUT",
    body: { workspace },
    fallback: "Could not sync workspace to database",
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

function isEmptyWorkspaceValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function localLooksEmpty(raw: string | null): boolean {
  return raw == null || raw === "" || raw === "[]" || raw === "{}";
}

/** True when local still embeds data: images that belong in Postgres. */
function localStillHasDataUrls(raw: string | null): boolean {
  return typeof raw === "string" && raw.includes("data:");
}

/**
 * Pull workspace from Postgres into localStorage once per session.
 * Non-empty Postgres wins when local is empty or still holds data: URLs
 * (so a fresh localhost inherits logos/order). Otherwise local keeps edits
 * and the trailing push uploads them.
 */
export async function hydrateConnectWorkspace(): Promise<void> {
  if (typeof window === "undefined" || hydrateStarted) return;
  hydrateStarted = true;
  try {
    const workspace = await client<Record<string, unknown>>(
      "/api/connect/workspace",
      "workspace",
      { fallback: "Could not load workspace from database" },
    );
    let changed = false;
    for (const [key, value] of Object.entries(workspace ?? {})) {
      if (!WORKSPACE_KEYS.includes(key as (typeof WORKSPACE_KEYS)[number])) {
        continue;
      }
      if (isEmptyWorkspaceValue(value)) continue;
      const local = window.localStorage.getItem(key);
      if (localLooksEmpty(local) || localStillHasDataUrls(local)) {
        writeLocal(key, value);
        changed = true;
      }
    }
    if (changed) {
      window.dispatchEvent(new Event("connect-companies-changed"));
      window.dispatchEvent(new Event("connect-avatars-changed"));
      window.dispatchEvent(new Event("connect-projects-changed"));
      window.dispatchEvent(new Event("connect-sidebar-order-changed"));
      window.dispatchEvent(new Event("connect-active-company"));
      window.dispatchEvent(new Event("connect-local-profile-changed"));
      window.dispatchEvent(new Event("connect-level3-browser-changed"));
      window.dispatchEvent(new Event("connect-company-site-changed"));
      window.dispatchEvent(new Event("connect-lab-prefs-changed"));
    }
    // Upload any leftover local-only keys / data: URLs into Postgres.
    void pushConnectWorkspace().catch(() => undefined);
  } catch {
    hydrateStarted = false;
  }
}
