/**
 * State of the Drive backup: one row per deployment. Own table, created lazily (IF NOT EXISTS) like
 * agent-hub/db.ts, so this needs no drizzle migration and cannot collide with other migrations.
 * The Google refresh token is stored ONLY as an AES-256-GCM envelope (encryptSecret with
 * KEY_ENCRYPTION_KEY); it is never returned by any route.
 */
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

export type BackupSettings = {
  enabled: boolean;
  /** Newest versions kept on Drive. */
  keep: number;
  /** Plus the newest version of each day, for this many days. */
  keepDays: number;
  /** A changed workspace is backed up at most this often (minutes). */
  minIntervalMinutes: number;
  /** Without changes, still one backup per this many hours. */
  maxAgeHours: number;
};

export const DEFAULT_SETTINGS: BackupSettings = {
  enabled: true,
  keep: 24,
  keepDays: 30,
  minIntervalMinutes: 15,
  maxAgeHours: 24,
};

export type BackupRow = {
  ownerUserId: string | null;
  email: string | null;
  refreshTokenEnc: string | null;
  scope: string | null;
  folderId: string | null;
  connectedAt: string | null;
  settings: BackupSettings;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFileId: string | null;
  lastFileName: string | null;
  lastSize: number | null;
  lastRows: number | null;
  lastTrigger: string | null;
  lastFingerprint: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastRestoreAt: string | null;
  lastRestoreInfo: string | null;
};

let ready: Promise<void> | null = null;

export function ensureTable(database: Pick<Database, "execute">): Promise<void> {
  ready ??= (async () => {
    await database.execute(sql`CREATE TABLE IF NOT EXISTS connect_drive_backup (
      id text PRIMARY KEY,
      owner_user_id text,
      email text,
      refresh_token_enc text,
      scope text,
      folder_id text,
      connected_at timestamptz,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      last_attempt_at timestamptz,
      last_success_at timestamptz,
      last_file_id text,
      last_file_name text,
      last_size bigint,
      last_rows bigint,
      last_trigger text,
      last_fingerprint text,
      last_error text,
      last_error_at timestamptz,
      last_restore_at timestamptz,
      last_restore_info text,
      lease_until timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await database.execute(sql`ALTER TABLE connect_drive_backup ADD COLUMN IF NOT EXISTS lease_until timestamptz`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

function rowsOf<T>(result: unknown): T[] {
  const raw = Array.isArray(result) ? result : (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(raw) ? (raw as T[]) : [];
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === "string" ? new Date(v).toISOString() : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function normaliseSettings(raw: unknown): BackupSettings {
  const value = (typeof raw === "string" ? safeJson(raw) : raw) as Partial<BackupSettings> | null;
  const int = (v: unknown, min: number, max: number, d: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;
  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    keep: int(value?.keep, 3, 500, DEFAULT_SETTINGS.keep),
    keepDays: int(value?.keepDays, 0, 365, DEFAULT_SETTINGS.keepDays),
    minIntervalMinutes: int(value?.minIntervalMinutes, 5, 24 * 60, DEFAULT_SETTINGS.minIntervalMinutes),
    maxAgeHours: int(value?.maxAgeHours, 1, 24 * 14, DEFAULT_SETTINGS.maxAgeHours),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function readRow(database: Pick<Database, "execute">): Promise<BackupRow | null> {
  await ensureTable(database);
  const [r] = rowsOf<Record<string, unknown>>(await database.execute(sql`SELECT * FROM connect_drive_backup WHERE id = 'default'`));
  if (!r) return null;
  return {
    ownerUserId: (r.owner_user_id as string) ?? null,
    email: (r.email as string) ?? null,
    refreshTokenEnc: (r.refresh_token_enc as string) ?? null,
    scope: (r.scope as string) ?? null,
    folderId: (r.folder_id as string) ?? null,
    connectedAt: iso(r.connected_at),
    settings: normaliseSettings(r.settings),
    lastAttemptAt: iso(r.last_attempt_at),
    lastSuccessAt: iso(r.last_success_at),
    lastFileId: (r.last_file_id as string) ?? null,
    lastFileName: (r.last_file_name as string) ?? null,
    lastSize: num(r.last_size),
    lastRows: num(r.last_rows),
    lastTrigger: (r.last_trigger as string) ?? null,
    lastFingerprint: (r.last_fingerprint as string) ?? null,
    lastError: (r.last_error as string) ?? null,
    lastErrorAt: iso(r.last_error_at),
    lastRestoreAt: iso(r.last_restore_at),
    lastRestoreInfo: (r.last_restore_info as string) ?? null,
  };
}

const COLUMN: Record<keyof BackupRow, string> = {
  ownerUserId: "owner_user_id",
  email: "email",
  refreshTokenEnc: "refresh_token_enc",
  scope: "scope",
  folderId: "folder_id",
  connectedAt: "connected_at",
  settings: "settings",
  lastAttemptAt: "last_attempt_at",
  lastSuccessAt: "last_success_at",
  lastFileId: "last_file_id",
  lastFileName: "last_file_name",
  lastSize: "last_size",
  lastRows: "last_rows",
  lastTrigger: "last_trigger",
  lastFingerprint: "last_fingerprint",
  lastError: "last_error",
  lastErrorAt: "last_error_at",
  lastRestoreAt: "last_restore_at",
  lastRestoreInfo: "last_restore_info",
};

/** Upsert of the given fields only. */
export async function writeRow(database: Pick<Database, "execute">, patch: Partial<BackupRow>): Promise<void> {
  await ensureTable(database);
  await database.execute(sql`INSERT INTO connect_drive_backup (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`);
  const entries = Object.entries(patch) as Array<[keyof BackupRow, unknown]>;
  if (!entries.length) return;
  const sets = entries.map(([key, value]) => {
    const column = sql.raw(COLUMN[key]);
    if (key === "settings") return sql`${column} = ${JSON.stringify(value ?? {})}::text::jsonb`;
    if (value === null || value === undefined) return sql`${column} = NULL`;
    if (key.endsWith("At")) return sql`${column} = ${String(value)}::timestamptz`;
    if (key === "lastSize" || key === "lastRows") return sql`${column} = ${String(value)}::bigint`;
    return sql`${column} = ${String(value)}`;
  });
  await database.execute(sql`UPDATE connect_drive_backup SET ${sql.join(sets, sql`, `)}, updated_at = now() WHERE id = 'default'`);
}
