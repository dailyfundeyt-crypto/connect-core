// Applies apps/server/drizzle to Supabase as the owner role connect_app (from .env.supabase).
// Same algorithm as drizzle-orm's pg migrator (one transaction, journal in drizzle.__drizzle_migrations) minus its
// CREATE SCHEMA precheck (schema "drizzle" is pre-created and owned by connect_app). Works on a temp copy of the
// migrations in which 0010's DROP EXTENSION "vector" is commented out (pgvector lives in schema extensions on Supabase
// and connect_app does not own it).
// Usage: bun migrate-supabase.ts <repoRoot>
import { SQL } from "bun";
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = process.argv[2];
const { readMigrationFiles } = await import(join(root, "apps/server/node_modules/drizzle-orm/migrator.js"));
const env = Object.fromEntries(readFileSync(join(root, ".env.supabase"), "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const dir = mkdtempSync(join(tmpdir(), "drizzle-supabase-"));
cpSync(join(root, "apps/server/drizzle"), dir, { recursive: true });
for (const f of readdirSync(dir).filter(f => f.startsWith("0010_") && f.endsWith(".sql"))) {
  const p = join(dir, f);
  writeFileSync(p, readFileSync(p, "utf8").replace(/^(DROP EXTENSION IF EXISTS "vector".*)$/m, "-- $1"));
}
const client = new SQL({ adapter: "postgres", hostname: env.SUPABASE_POOLER_HOST, port: 5432, username: "connect_app." + env.SUPABASE_PROJECT_REF, password: env.SUPABASE_DB_PASSWORD, database: "postgres", tls: true, max: 1 });
try {
  const migrations = readMigrationFiles({ migrationsFolder: dir });
  await client.unsafe('CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
  const last = (await client.unsafe('select id, hash, created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 1'))[0];
  let applied = 0;
  await client.begin(async (tx) => {
    for (const m of migrations) {
      if (!last || Number(last.created_at) < m.folderMillis) {
        for (const stmt of m.sql) { if (stmt.trim()) await tx.unsafe(stmt); }
        await tx.unsafe('insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)', [m.hash, m.folderMillis]);
        applied++;
      }
    }
  });
  const r = await client.unsafe('select count(*)::int as n from "drizzle"."__drizzle_migrations"');
  console.log(`MIGRATED now_applied=${applied} total=${r[0].n} files=${migrations.length}`);
  if (applied) console.log("New tables? Enable RLS on them (no policies) and keep anon/authenticated revoked, see README.");
} finally { await client.close(); }
