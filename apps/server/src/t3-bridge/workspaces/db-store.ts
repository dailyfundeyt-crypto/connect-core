/**
 * T3-Bridge — Workspace-Manager: Datenbank-Spiegelung (A05).
 *
 * Lane: A07 (Welle W1).
 *
 * Die Tabelle `agent_workspace` (A05, Migration 0570) hat genau vier Spalten:
 * `agent_id`, `path`, `created_at`, `updated_at`. Slug, Art und Status kennt
 * sie nicht — deshalb führt die Registry-Datei und die Datenbank spiegelt nur
 * den Pfad. Wunsch an A05 steht im Bericht A07 (Spalten `slug`, `kind`,
 * `archived_at`).
 *
 * Benutzung in der Verdrahtung (A37):
 *
 * ```ts
 * const manager = createAgentWorkspaceManager({
 *   dbStore: createDrizzleWorkspaceStore(getDatabase()),
 * });
 * ```
 */

import type { Database } from "../../db/client";
import { agentWorkspace } from "../../db/schema/t3";
import type { WorkspaceDbRow, WorkspaceDbStore } from "./types";

/** Drizzle-Implementierung von `WorkspaceDbStore`. */
export function createDrizzleWorkspaceStore(db: Database): WorkspaceDbStore {
  return {
    async loadAll(): Promise<WorkspaceDbRow[]> {
      const rows = await db
        .select({
          agentId: agentWorkspace.agentId,
          path: agentWorkspace.path,
          updatedAt: agentWorkspace.updatedAt,
        })
        .from(agentWorkspace);

      return rows.map((row) => ({
        agentId: row.agentId,
        path: row.path,
        updatedAt:
          row.updatedAt instanceof Date
            ? row.updatedAt.toISOString()
            : String(row.updatedAt),
      }));
    },

    async upsert(row: { agentId: string; path: string }): Promise<void> {
      await db
        .insert(agentWorkspace)
        .values({ agentId: row.agentId, path: row.path })
        .onConflictDoUpdate({
          target: agentWorkspace.agentId,
          set: { path: row.path, updatedAt: new Date() },
        });
    },
  };
}
