import { SQL } from "bun";

const url = "postgres://connect:f1691e59c1531553fd6002595803b1792d1aedf0201833fb@127.0.0.1:5544/connect";
const sql = new SQL(url);
try {
  // Check if it exists
  const exists = await sql`SELECT to_regclass('public.agent_browser_tabs') as tbl`;
  console.log("Exists:", exists);
  // Try to create it
  await sql`CREATE TABLE IF NOT EXISTS "agent_browser_tabs" (
    "tab_id" text PRIMARY KEY NOT NULL,
    "agent_id" text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
    "url" text,
    "title" text,
    "profile_dir" text NOT NULL,
    "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
    "closed_at" timestamp with time zone
  )`;
  await sql`CREATE INDEX IF NOT EXISTS "agent_browser_tabs_agent_idx" ON "agent_browser_tabs" ("agent_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "agent_browser_tabs_open_idx" ON "agent_browser_tabs" ("agent_id") WHERE "closed_at" IS NULL`;
  // Verify
  const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'agent_browser_tabs' ORDER BY ordinal_position`;
  console.log("Columns:", cols);
  const idx = await sql`SELECT indexname FROM pg_indexes WHERE tablename = 'agent_browser_tabs'`;
  console.log("Indexes:", idx.map(i => i.indexname).join(", "));
} catch (e) {
  console.error("FAIL", e instanceof Error ? e.message : String(e));
}
await sql.close();







