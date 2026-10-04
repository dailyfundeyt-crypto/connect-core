/**
 * Drive-Backup ohne Google: Probelauf und Restore-Test.
 *
 *   bun --env-file=../../.env src/drive-backup/cli.ts dry-run <out.cbk>
 *       exportiert die DB (DATABASE_URL) + Brain, verschluesselt, prueft und schreibt die Datei
 *   bun --env-file=../../.env src/drive-backup/cli.ts restore-test <archiv.cbk> <ziel-db-url>
 *       spielt das Archiv in eine (leere, schon mit Schema angelegte) Test-DB ein und zaehlt Zeilen
 *
 * Gibt nur Zahlen aus, nie Inhalte oder Schluessel.
 */
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createDatabase } from "../db/client";
import { listTables, openArchive, restoreDocument } from "./archive";
import { DriveBackupService } from "./service";

const [command, a, b] = process.argv.slice(2);
const key = process.env.KEY_ENCRYPTION_KEY;
if (!key) throw new Error("KEY_ENCRYPTION_KEY fehlt");

if (command === "dry-run") {
  const url = process.env.DATABASE_URL;
  if (!url || !a) throw new Error("usage: dry-run <out.cbk>  (DATABASE_URL in env)");
  const database = createDatabase(url, { max: 2 });
  const service = new DriveBackupService({ database, encryptionKey: key, port: Number(process.env.PORT ?? 3001), env: { ...process.env, CONNECT_BACKUP_LOCAL_DIR: "off" } });
  const t0 = Date.now();
  const r = await service.dryRun(a);
  console.log(JSON.stringify({ ok: true, ms: Date.now() - t0, file: r.file, tables: r.tables, rows: r.rows, brainFiles: r.files, jsonBytes: r.jsonBytes, gzipBytes: r.gzipBytes, encryptedBytes: r.encryptedBytes, sha256: r.sha256, rowsByTable: r.rowsByTable, oauthConfigured: Boolean(service.client), redirectUri: service.client?.redirectUri ?? null }, null, 1));
  process.exit(0);
}

if (command === "restore-test") {
  if (!a || !b) throw new Error("usage: restore-test <archive.cbk> <target-db-url>");
  const doc = await openArchive(new Uint8Array(await readFile(a)), key);
  const database = createDatabase(b, { max: 2 });
  const result = await restoreDocument(database, doc);
  const counts: Record<string, number> = {};
  for (const t of await listTables(database)) {
    const rows = (await database.execute(sql.raw(`SELECT count(*)::int AS n FROM public."${t.replace(/"/g, '""')}"`))) as unknown as Array<{ n: number }>;
    counts[t] = Number((Array.isArray(rows) ? rows : (rows as { rows: Array<{ n: number }> }).rows)[0]?.n ?? 0);
  }
  const mismatches = Object.entries(doc.tables)
    .filter(([t, rows]) => t in counts && counts[t] !== rows.length)
    .map(([t, rows]) => `${t}: Archiv ${rows.length}, DB ${counts[t]}`);
  console.log(JSON.stringify({ ok: mismatches.length === 0, restoredTables: result.tables, restoredRows: result.rows, skippedTables: result.skippedTables, mismatches, brainFiles: Object.keys(doc.files ?? {}).length }, null, 1));
  process.exit(mismatches.length ? 1 : 0);
}

console.error("usage: cli.ts dry-run <out.cbk> | restore-test <archive.cbk> <target-db-url>");
process.exit(2);
