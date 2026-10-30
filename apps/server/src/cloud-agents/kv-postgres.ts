import { eq, like, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { connectWorkspaceKv } from "../db/schema";
import type { KvBackend } from "./store";

/** Gleiche Cast-Begründung wie in connect/routes.ts (`asJsonb`). */
function asJsonb(value: unknown) {
  return sql`${JSON.stringify(value ?? null)}::jsonb`;
}

/** Cloud-Agent-Daten in `connect_workspace_kv`, ausschließlich unter `server:`-Schlüsseln. */
export function postgresKv(database: Database): KvBackend {
  return {
    async get(key) {
      const [row] = await database
        .select()
        .from(connectWorkspaceKv)
        .where(eq(connectWorkspaceKv.key, key))
        .limit(1);
      return row?.value ?? null;
    },
    async set(key, value) {
      const now = new Date();
      await database
        .insert(connectWorkspaceKv)
        .values({ key, value: asJsonb(value), updatedAt: now })
        .onConflictDoUpdate({
          target: connectWorkspaceKv.key,
          set: { value: asJsonb(value), updatedAt: now },
        });
    },
    async list(prefix) {
      const escaped = prefix.replace(/[\\%_]/g, (c) => `\\${c}`);
      const rows = await database
        .select()
        .from(connectWorkspaceKv)
        .where(like(connectWorkspaceKv.key, `${escaped}%`));
      return rows.map((row) => ({ key: row.key, value: row.value }));
    },
  };
}
