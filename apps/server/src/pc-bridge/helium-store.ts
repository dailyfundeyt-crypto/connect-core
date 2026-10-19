/**
 * „Mein Helium“: Tabs von Stefans Helium (PC) aufs Handy und Befehle vom Handy zurück.
 *
 * Gleiches Muster wie die Handy-Brücke (store.ts): zwei additive Tabellen in der Online-Datenbank mit
 * RLS an und ohne Policies, nur per Postgres erreichbar. Der PC-Worker schreibt den Tab-Stand und holt
 * Befehle über seine AUSGEHENDE Verbindung ab (alle ~1 s), kein Port, kein Tunnel.
 *
 * Jeder Befehl ist an den angemeldeten Nutzer gebunden (owner_user_id kommt aus der Sitzung, nie aus
 * dem Body) und mit HMAC-SHA256 signiert. Der Schlüssel wird aus dem Datenbank-Passwort abgeleitet,
 * das nur der Vercel-Server und der PC kennen; der PC prüft Signatur, Besitzer und Alter (< 2 min).
 */
import type { Q } from "./store";

export const HELIUM_ACTIONS = ["open", "close", "activate", "reload", "navigate", "focusWindow", "screenshot"] as const;
export type HeliumAction = (typeof HELIUM_ACTIONS)[number];
export const isHeliumAction = (value: unknown): value is HeliumAction => typeof value === "string" && (HELIUM_ACTIONS as readonly string[]).includes(value);

export type HeliumTab = {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  pinned?: boolean;
  audible?: boolean;
};
export type HeliumWindow = { id: number; focused: boolean; type?: string };
export type HeliumArgs = { url?: string; tabId?: number; windowId?: number };
export type HeliumCommand = { id: string; owner_user_id: string; action: HeliumAction; args: HeliumArgs; issued_at: string; sig: string };
export type HeliumResult = { ok: boolean; result?: unknown; error?: string };

/** An extension that has not called in for this long counts as gone. */
export const HELIUM_ONLINE_SECONDS = 45;
/** A command older than this is not executed any more (the phone has given up on it). */
export const HELIUM_MAX_AGE_MS = 120_000;

const DDL = [
  `CREATE TABLE IF NOT EXISTS connect_pc_browser (
    owner_user_id text PRIMARY KEY,
    worker_id text NOT NULL,
    ext_connected boolean NOT NULL DEFAULT false,
    ext_seen timestamptz,
    browser text,
    windows jsonb NOT NULL DEFAULT '[]'::jsonb,
    tabs jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS connect_pc_browser_cmds (
    id text PRIMARY KEY,
    owner_user_id text NOT NULL,
    action text NOT NULL,
    args jsonb NOT NULL DEFAULT '{}'::jsonb,
    issued_at text NOT NULL,
    sig text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    result jsonb,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS connect_pc_browser_cmds_queue_idx ON connect_pc_browser_cmds (owner_user_id, status, created_at)`,
  `ALTER TABLE connect_pc_browser ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE connect_pc_browser_cmds ENABLE ROW LEVEL SECURITY`,
];

const ready = new WeakMap<Q, Promise<void>>();
export function ensureHeliumTables(q: Q): Promise<void> {
  let promise = ready.get(q);
  if (!promise) {
    promise = (async () => {
      for (const statement of DDL) await q(statement);
    })();
    promise.catch(() => ready.delete(q));
    ready.set(q, promise);
  }
  return promise;
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value ?? fallback) as T;
}

// ------------------------------------------------------------------ signing

/** The password of a postgres URL: the shared secret both sides already hold. */
export function secretFromDatabaseUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const password = decodeURIComponent(new URL(url).password);
    return password || null;
  } catch {
    return null;
  }
}

const encoder = new TextEncoder();
async function hmacHex(secret: string, message: string): Promise<string> {
  const subtle = (globalThis.crypto as Crypto).subtle;
  const key = await subtle.importKey("raw", encoder.encode(`connect-helium-sync-v1|${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const canonical = (command: Omit<HeliumCommand, "sig">) =>
  [command.id, command.owner_user_id, command.action, stableJson(command.args ?? {}), command.issued_at].join("\n");

/** Sorted keys: Postgres jsonb reorders object keys, the signature must not depend on that. */
function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
}

export const signCommand = (secret: string, command: Omit<HeliumCommand, "sig">) => hmacHex(secret, canonical(command));

export async function verifyCommand(secret: string, command: HeliumCommand, ownerUserId: string): Promise<string | null> {
  if (command.owner_user_id !== ownerUserId) return "Befehl gehört einem anderen Nutzer.";
  if (!isHeliumAction(command.action)) return "Unbekannte Aktion.";
  const issued = Date.parse(command.issued_at);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > HELIUM_MAX_AGE_MS) return "Befehl ist abgelaufen.";
  const expected = await hmacHex(secret, canonical(command));
  if (expected.length !== command.sig.length) return "Signatur ungültig.";
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ command.sig.charCodeAt(i);
  return diff === 0 ? null : "Signatur ungültig.";
}

// ------------------------------------------------------------------ validation (both sides)

const MAX_URL = 2048;
export function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > MAX_URL) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const isId = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 2 ** 31;

/** Validated arguments for an action, or an error text. */
export function cleanArgs(action: HeliumAction, raw: unknown): { args: HeliumArgs } | { error: string } {
  const input = (raw ?? {}) as Record<string, unknown>;
  switch (action) {
    case "open": {
      const url = cleanUrl(input.url);
      if (!url) return { error: "Nur http(s)-Adressen." };
      return { args: { url, ...(isId(input.windowId) ? { windowId: input.windowId } : {}) } };
    }
    case "navigate": {
      const url = cleanUrl(input.url);
      if (!url) return { error: "Nur http(s)-Adressen." };
      if (!isId(input.tabId)) return { error: "Tab fehlt." };
      return { args: { url, tabId: input.tabId } };
    }
    case "close":
    case "activate":
    case "reload":
      if (!isId(input.tabId)) return { error: "Tab fehlt." };
      return { args: { tabId: input.tabId } };
    case "focusWindow":
      if (!isId(input.windowId)) return { error: "Fenster fehlt." };
      return { args: { windowId: input.windowId } };
    case "screenshot":
      return { args: isId(input.windowId) ? { windowId: input.windowId } : {} };
  }
}

// ------------------------------------------------------------------ PC side

export async function pushBrowser(
  q: Q,
  input: { ownerUserId: string; workerId: string; extConnected: boolean; extSeen: string | null; browser: string | null; windows: HeliumWindow[]; tabs: HeliumTab[] },
) {
  await ensureHeliumTables(q);
  await q(
    `INSERT INTO connect_pc_browser (owner_user_id, worker_id, ext_connected, ext_seen, browser, windows, tabs, updated_at)
     VALUES ($1, $2, $3, $4::timestamptz, $5, $6::text::jsonb, $7::text::jsonb, now())
     ON CONFLICT (owner_user_id) DO UPDATE SET worker_id = EXCLUDED.worker_id, ext_connected = EXCLUDED.ext_connected,
       ext_seen = EXCLUDED.ext_seen, browser = EXCLUDED.browser, windows = EXCLUDED.windows, tabs = EXCLUDED.tabs, updated_at = now()`,
    [input.ownerUserId, input.workerId, input.extConnected, input.extSeen, input.browser, JSON.stringify(input.windows), JSON.stringify(input.tabs)],
  );
}

export async function claimHeliumCommand(q: Q, ownerUserId: string): Promise<HeliumCommand | null> {
  const rows = await q(
    `UPDATE connect_pc_browser_cmds SET status = 'running'
     WHERE id = (
       SELECT id FROM connect_pc_browser_cmds
       WHERE owner_user_id = $1 AND status = 'queued' AND created_at > now() - interval '2 minutes'
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     RETURNING id, owner_user_id, action, args, issued_at, sig`,
    [ownerUserId],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...(row as unknown as HeliumCommand), args: json<HeliumArgs>(row.args, {}) };
}

export async function finishHeliumCommand(q: Q, id: string, result: HeliumResult) {
  await q(
    `UPDATE connect_pc_browser_cmds SET status = $2, result = $3::text::jsonb, error = $4, finished_at = now() WHERE id = $1`,
    [id, result.ok ? "done" : "error", result.result === undefined ? null : JSON.stringify(result.result), result.ok ? null : (result.error ?? "Fehler").slice(0, 500)],
  );
}

export async function pruneHeliumCommands(q: Q, ownerUserId: string) {
  await q(`DELETE FROM connect_pc_browser_cmds WHERE owner_user_id = $1 AND created_at < now() - interval '1 day'`, [ownerUserId]);
}

// ------------------------------------------------------------------ phone side (Vercel)

export type HeliumBrowserRow = {
  extConnected: boolean;
  extSeen: string | null;
  browser: string | null;
  windows: HeliumWindow[];
  tabs: HeliumTab[];
  updatedAt: string;
};

export async function readBrowser(q: Q, ownerUserId: string): Promise<HeliumBrowserRow | null> {
  await ensureHeliumTables(q);
  const rows = await q(
    `SELECT ext_seen, browser, windows, tabs, updated_at,
            (ext_connected AND ext_seen > now() - make_interval(secs => $2::int)) AS live
     FROM connect_pc_browser WHERE owner_user_id = $1`,
    [ownerUserId, HELIUM_ONLINE_SECONDS],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    extConnected: row.live === true || row.live === "t",
    extSeen: row.ext_seen ? new Date(row.ext_seen as string).toISOString() : null,
    browser: (row.browser as string | null) ?? null,
    windows: json<HeliumWindow[]>(row.windows, []),
    tabs: json<HeliumTab[]>(row.tabs, []),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function enqueueHeliumCommand(q: Q, command: HeliumCommand) {
  await ensureHeliumTables(q);
  await q(
    `INSERT INTO connect_pc_browser_cmds (id, owner_user_id, action, args, issued_at, sig) VALUES ($1, $2, $3, $4::text::jsonb, $5, $6)`,
    [command.id, command.owner_user_id, command.action, JSON.stringify(command.args), command.issued_at, command.sig],
  );
}

export async function readHeliumCommand(q: Q, id: string, ownerUserId: string) {
  const rows = await q(`SELECT status, result, error FROM connect_pc_browser_cmds WHERE id = $1 AND owner_user_id = $2`, [id, ownerUserId]);
  const row = rows[0];
  if (!row) return null;
  return { status: String(row.status), result: json<unknown>(row.result, null), error: (row.error as string | null) ?? null };
}

export async function cancelHeliumCommand(q: Q, id: string) {
  await q(`UPDATE connect_pc_browser_cmds SET status = 'cancelled', finished_at = now() WHERE id = $1 AND status = 'queued'`, [id]);
}
