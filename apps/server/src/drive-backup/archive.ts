/**
 * The backup archive: every relevant table of this deployment as JSON, gzip-compressed and sealed
 * with AES-256-GCM under a key derived from KEY_ENCRYPTION_KEY.
 *
 * Why JSON and not pg_dump: the server has no pg_dump binary on Vercel or inside the Connect App
 * runtime, and a JSON export restores into a schema that gained columns since (missing columns take
 * their defaults). bytea becomes Postgres' own "\x…" hex text, which jsonb_populate_recordset reads
 * back unchanged.
 *
 * What is left out: live login sessions and verification codes (worthless after a restore, and
 * bearer secrets), Google login tokens on `accounts` (raw OAuth tokens), and this feature's own
 * table (it holds the Drive refresh token). The vault (`credentials`) is included as stored, i.e.
 * already AES-GCM encrypted with KEY_ENCRYPTION_KEY; it stays unreadable without that key.
 */
import { createHash, createHmac } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { notifyChatStoreRestored } from "../chat-store/store";
import type { Database } from "../db/client";

export const BACKUP_FORMAT = "connect-backup";
export const BACKUP_VERSION = 1;
const MAGIC = new TextEncoder().encode("CNCTBK01");

/** Never exported and never touched by a restore. */
export const EXCLUDED_TABLES = new Set(["sessions", "verifications", "connect_drive_backup"]);
/** Columns blanked on export because they are raw secrets. */
export const REDACTED_COLUMNS: Record<string, string[]> = {
  accounts: ["access_token", "refresh_token", "id_token"],
};
/** Restored by adding what is missing, never by replacing: wiping them would log everybody out. */
export const MERGE_ONLY_TABLES = new Set(["users", "accounts"]);

export type BackupDocument = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  source: { host?: string; app?: string };
  tables: Record<string, Array<Record<string, unknown>>>;
  /** Brain folder (Markdown), relative path -> base64 content. */
  files?: Record<string, string>;
};

export type BackupSummary = {
  tables: number;
  rows: number;
  rowsByTable: Record<string, number>;
  files: number;
  jsonBytes: number;
  gzipBytes: number;
  encryptedBytes: number;
  sha256: string;
};

function rowsOf<T>(result: unknown): T[] {
  const raw = Array.isArray(result) ? result : (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(raw) ? (raw as T[]) : [];
}

type Executor = Pick<Database, "execute">;

export async function listTables(db: Executor): Promise<string[]> {
  const rows = rowsOf<{ name: string }>(
    await db.execute(sql`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY c.relname`),
  );
  return rows.map((r) => r.name).filter((name) => !EXCLUDED_TABLES.has(name));
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** One table as a JSON array text, secrets removed in SQL so they never reach this process. */
async function exportTable(db: Executor, table: string): Promise<string> {
  const redacted = REDACTED_COLUMNS[table];
  const minus = redacted?.length ? ` - ARRAY[${redacted.map(quoteLiteral).join(",")}]::text[]` : "";
  const rows = rowsOf<{ data: string }>(
    await db.execute(
      sql.raw(`SELECT coalesce(jsonb_agg(to_jsonb(t)${minus}), '[]'::jsonb)::text AS data FROM public."${table.replace(/"/g, '""')}" t`),
    ),
  );
  return rows[0]?.data ?? "[]";
}

/** Every file under the Brain folder except .git, capped so a stray video cannot bloat every backup. */
export async function collectFiles(root: string | null, maxBytes = 50 * 1024 * 1024): Promise<Record<string, string>> {
  if (!root) return {};
  const { readdir, readFile, stat } = await import("node:fs/promises");
  const path = await import("node:path");
  const out: Record<string, string> = {};
  let total = 0;
  const walk = async (dir: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const size = (await stat(full)).size;
        if (total + size > maxBytes) continue;
        total += size;
        out[path.relative(root, full).split(path.sep).join("/")] = (await readFile(full)).toString("base64");
      }
    }
  };
  await walk(root);
  return out;
}

export async function exportDocument(
  db: Executor,
  source: BackupDocument["source"] = {},
  now: Date = new Date(),
  files: Record<string, string> = {},
): Promise<{ json: string; rowsByTable: Record<string, number>; fileCount: number }> {
  const tables = await listTables(db);
  const parts: string[] = [];
  const rowsByTable: Record<string, number> = {};
  for (const table of tables) {
    const data = await exportTable(db, table);
    rowsByTable[table] = data === "[]" ? 0 : (JSON.parse(data) as unknown[]).length;
    parts.push(`${JSON.stringify(table)}:${data}`);
  }
  const head = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now.toISOString(), source });
  // Built as text so a large table is never parsed and re-serialised just to be written out.
  const json = `${head.slice(0, -1)},"tables":{${parts.join(",")}},"files":${JSON.stringify(files)}}`;
  return { json, rowsByTable, fileCount: Object.keys(files).length };
}

/** HKDF-style derivation so the backup key is never the vault key itself. */
export function backupKey(keyEncryptionKey: string): Buffer {
  const ikm = Buffer.from(keyEncryptionKey, "base64");
  const prk = createHmac("sha256", "connect-drive-backup/v1").update(ikm).digest();
  return createHmac("sha256", prk).update(Buffer.from("backup-archive\x01")).digest();
}

/** Short, public fingerprint of the backup key: tells a restore "wrong key" apart from "damaged". */
export function keyFingerprint(keyEncryptionKey: string): string {
  return createHash("sha256").update(backupKey(keyEncryptionKey)).digest("hex").slice(0, 12);
}

async function aes(keyEncryptionKey: string) {
  return crypto.subtle.importKey("raw", new Uint8Array(backupKey(keyEncryptionKey)), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function sealArchive(json: string, keyEncryptionKey: string): Promise<{ bytes: Uint8Array; gzipBytes: number }> {
  const gz = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: MAGIC }, await aes(keyEncryptionKey), gz));
  const out = new Uint8Array(MAGIC.length + iv.length + cipher.length);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(cipher, MAGIC.length + iv.length);
  return { bytes: out, gzipBytes: gz.length };
}

export class ArchiveError extends Error {}

export async function openArchive(bytes: Uint8Array, keyEncryptionKey: string): Promise<BackupDocument> {
  const magic = bytes.subarray(0, MAGIC.length);
  if (bytes.length < MAGIC.length + 12 + 16 || Buffer.compare(Buffer.from(magic), Buffer.from(MAGIC)) !== 0) {
    throw new ArchiveError("Das ist keine Connect-Sicherung (Kennung fehlt).");
  }
  const iv = new Uint8Array(bytes.subarray(MAGIC.length, MAGIC.length + 12));
  let gz: ArrayBuffer;
  try {
    gz = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: MAGIC }, await aes(keyEncryptionKey), new Uint8Array(bytes.subarray(MAGIC.length + 12)));
  } catch {
    throw new ArchiveError(
      "Die Sicherung lässt sich nicht entschlüsseln: anderer KEY_ENCRYPTION_KEY (andere Installation) oder beschädigte Datei.",
    );
  }
  const doc = JSON.parse(gunzipSync(Buffer.from(gz)).toString("utf8")) as BackupDocument;
  if (doc.format !== BACKUP_FORMAT || typeof doc.tables !== "object" || doc.tables === null) {
    throw new ArchiveError("Unbekanntes Sicherungsformat.");
  }
  if (doc.version > BACKUP_VERSION) throw new ArchiveError(`Sicherung aus einer neueren Connect-Version (v${doc.version}).`);
  return doc;
}

export async function buildArchive(
  db: Executor,
  keyEncryptionKey: string,
  source: BackupDocument["source"] = {},
  now: Date = new Date(),
  files: Record<string, string> = {},
): Promise<{ bytes: Uint8Array; summary: BackupSummary }> {
  const { json, rowsByTable, fileCount } = await exportDocument(db, source, now, files);
  const { bytes, gzipBytes } = await sealArchive(json, keyEncryptionKey);
  // Prove the file opens before anybody relies on it.
  const check = await openArchive(bytes, keyEncryptionKey);
  for (const [table, count] of Object.entries(rowsByTable)) {
    if ((check.tables[table]?.length ?? 0) !== count) throw new ArchiveError(`Prüfung fehlgeschlagen: ${table}`);
  }
  if (Object.keys(check.files ?? {}).length !== fileCount) throw new ArchiveError("Prüfung fehlgeschlagen: Brain-Dateien");
  return {
    bytes,
    summary: {
      tables: Object.keys(rowsByTable).length,
      rows: Object.values(rowsByTable).reduce((a, b) => a + b, 0),
      rowsByTable,
      files: fileCount,
      jsonBytes: Buffer.byteLength(json, "utf8"),
      gzipBytes,
      encryptedBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

/** Cheap "did anything change" signal: write counters of every table that is backed up. */
export async function changeFingerprint(db: Executor): Promise<string> {
  const rows = rowsOf<{ fp: string | null }>(
    await db.execute(sql`SELECT coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0)::text || ':' || count(*)::text AS fp
      FROM pg_stat_user_tables WHERE schemaname = 'public'
      AND relname NOT IN ('sessions', 'verifications', 'connect_drive_backup')`),
  );
  return rows[0]?.fp ?? "";
}

/** Insert order: referenced tables before the tables pointing at them (cycles fall back to name). */
export async function insertOrder(db: Executor, tables: string[]): Promise<string[]> {
  const edges = rowsOf<{ child: string; parent: string }>(
    await db.execute(sql`SELECT c.relname AS child, p.relname AS parent FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class p ON p.oid = k.confrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE k.contype = 'f' AND n.nspname = 'public' AND c.oid <> p.oid`),
  );
  const set = new Set(tables);
  const deps = new Map<string, Set<string>>(tables.map((t) => [t, new Set()]));
  for (const e of edges) if (set.has(e.child) && set.has(e.parent)) deps.get(e.child)?.add(e.parent);
  const out: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (t: string) => {
    if (done.has(t) || visiting.has(t)) return;
    visiting.add(t);
    for (const d of [...(deps.get(t) ?? [])].sort()) visit(d);
    visiting.delete(t);
    done.add(t);
    out.push(t);
  };
  for (const t of [...tables].sort()) visit(t);
  return out;
}

/** Restored Brain files go NEXT to the Brain folder, never over it: the live notes are not overwritten. */
export async function restoreFiles(files: Record<string, string> | undefined, targetDir: string): Promise<number> {
  if (!files) return 0;
  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  let count = 0;
  for (const [rel, b64] of Object.entries(files)) {
    const clean = path.normalize(rel).replace(/^([/\\])+/, "");
    if (clean.startsWith("..") || path.isAbsolute(clean)) continue;
    const full = path.join(targetDir, clean);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, Buffer.from(b64, "base64"));
    count += 1;
  }
  return count;
}

export type RestoreResult = {
  tables: number;
  rows: number;
  rowsByTable: Record<string, number>;
  skippedTables: string[];
};

const CHUNK = 500;

/**
 * Replace this deployment's data with a backup's, in ONE transaction: either everything is the
 * backup's afterwards or nothing changed. `users`/`accounts` are merged (missing rows added) so the
 * person restoring stays signed in.
 */
export async function restoreDocument(database: Database, doc: BackupDocument): Promise<RestoreResult> {
  const current = new Set(await listTables(database));
  const wanted = Object.keys(doc.tables).filter((t) => !EXCLUDED_TABLES.has(t));
  const skippedTables = wanted.filter((t) => !current.has(t));
  const tables = await insertOrder(database, wanted.filter((t) => current.has(t)));
  const ident = (t: string) => `public."${t.replace(/"/g, '""')}"`;
  const rowsByTable: Record<string, number> = {};

  await database.transaction(async (tx) => {
    const superuser = rowsOf<{ s: boolean }>(await tx.execute(sql`SELECT rolsuper AS s FROM pg_roles WHERE rolname = current_user`))[0]?.s;
    if (superuser) await tx.execute(sql`SET LOCAL session_replication_role = replica`);

    const replace = tables.filter((t) => !MERGE_ONLY_TABLES.has(t));
    if (replace.length) await tx.execute(sql.raw(`TRUNCATE ${replace.map(ident).join(", ")} CASCADE`));

    for (const table of tables) {
      const rows = doc.tables[table] ?? [];
      rowsByTable[table] = rows.length;
      if (!rows.length) continue;
      const columns = rowsOf<{ name: string; generated: string }>(
        await tx.execute(sql`SELECT column_name AS name, coalesce(is_generated, 'NEVER') AS generated FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${table}`),
      );
      const inBackup = new Set(rows.flatMap((r) => Object.keys(r)));
      const cols = columns.filter((c) => c.generated === "NEVER" && inBackup.has(c.name)).map((c) => `"${c.name.replace(/"/g, '""')}"`);
      if (!cols.length) continue;
      const list = cols.join(", ");
      const conflict = MERGE_ONLY_TABLES.has(table) ? " ON CONFLICT DO NOTHING" : "";
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = JSON.stringify(rows.slice(i, i + CHUNK));
        await tx.execute(
          sql`${sql.raw(`INSERT INTO ${ident(table)} (${list}) SELECT ${list} FROM jsonb_populate_recordset(NULL::${ident(table)}, `)}${chunk}::text::jsonb${sql.raw(`)${conflict}`)}`,
        );
      }
    }

    // Serial/identity sequences follow the restored ids.
    const seqs = rowsOf<{ t: string; c: string; s: string }>(
      await tx.execute(sql`SELECT table_name AS t, column_name AS c, pg_get_serial_sequence('public.' || quote_ident(table_name), column_name) AS s
        FROM information_schema.columns WHERE table_schema = 'public'
        AND pg_get_serial_sequence('public.' || quote_ident(table_name), column_name) IS NOT NULL`),
    );
    for (const q of seqs) {
      if (!tables.includes(q.t)) continue;
      await tx.execute(
        sql.raw(`SELECT setval(${quoteLiteral(q.s)}, coalesce((SELECT max("${q.c.replace(/"/g, '""')}") FROM ${ident(q.t)}), 0) + 1, false)`),
      );
    }
  });
  // Chats (connect_chat_threads/-messages) came back with everything else; the runtime's in-memory
  // copy of them is now stale and is reloaded from Postgres on next use.
  notifyChatStoreRestored();

  return {
    tables: tables.length,
    rows: Object.values(rowsByTable).reduce((a, b) => a + b, 0),
    rowsByTable,
    skippedTables,
  };
}
