/**
 * Test-Doppel: Fake-DB fuer die Firmenquelle (`connect_workspace_kv`) und die
 * Zuordnungstabelle (`company_profile_agent_assignments`).
 *
 * Nur ERFUNDENE Daten: fiktive Nutzer, fiktive Firmen, fiktive Agent-IDs.
 * Kein echter Postgres, keine echten Tokens.
 */

import type { Database } from "../src/db/client";

type FakeRow = Record<string, unknown>;

/**
 * Zerlegt ein drizzle-`sql`-Objekt in seine Chunks.
 *
 * Ein Chunk ist entweder ein `StringChunk` (der SQL-Text steckt in `.value` als
 * Array) oder ein Wert (String/Number/null). Verschachtelte `sql.join(...)`
 * erscheint als `SQL`-Chunk mit eigenen Chunks — der wird rekursiv
 * aufgeloest, sonst ginge die Parameterzahl verloren.
 */
function flattenChunks(chunks: unknown[]): Array<{ text?: string; value?: unknown }> {
  const out: Array<{ text?: string; value?: unknown }> = [];
  for (const c of chunks) {
    if (!c || typeof c !== "object") {
      out.push({ value: c });
      continue;
    }
    const value = (c as { value?: unknown }).value;
    if (Array.isArray(value)) {
      out.push({ text: value.join("") });
      continue;
    }
    const nested = (c as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(nested)) {
      out.push(...flattenChunks(nested));
      continue;
    }
    out.push({ value: c });
  }
  return out;
}

/**
 * Rekonstruiert den SQL-Text eines drizzle-`sql`-Objekts (Parameter → "?").
 */
export function sqlText(q: unknown): string {
  const chunks = (q as { queryChunks?: unknown[] })?.queryChunks ?? [];
  return flattenChunks(chunks)
    .map((c) => (c.text === undefined ? "?" : c.text))
    .join("");
}

/**
 * Rekonstruiert die Parameter eines drizzle-`sql`-Objekts (in Reihenfolge).
 * Parameter-Chunks sind die Rohwerte (`String`/`Number`/`null`); `StringChunk`
 * traegt den SQL-Text als Array und wird uebersprungen.
 */
export function sqlParams(q: unknown): unknown[] {
  const chunks = (q as { queryChunks?: unknown[] })?.queryChunks ?? [];
  return flattenChunks(chunks)
    .filter((c) => c.text === undefined)
    .map((c) => c.value);
}

/** Eine erfundene Firma im Workspace-Format. */
export type FakeCompany = {
  id: string;
  name: string;
  description: string;
  handle: string;
  agentIds: string[];
  accent?: string;
};

/**
 * Fake-Workspace: pro Nutzer eine Zeile `u:<userId>:connect.companies.custom`.
 * Der Wert wird als JSON-Text gespeichert (so liegt er auch in Postgres).
 */
export class FakeWorkspace {
  /** key -> JSON-Text (So liegen die Werte in `connect_workspace_kv`.) */
  readonly kv = new Map<string, string>();
  readonly agents = new Map<string, { name: string; headline: string | null }>();
  readonly agentProfiles = new Map<
    string,
    { owner_user_id: string | null; visibility: string; deleted_at: string | null }
  >();
  readonly assignments: FakeRow[] = [];

  constructor() {
    this.kv.set(
      "u:fake-user-a:connect.companies.custom",
      JSON.stringify([
        {
          id: "alpha",
          name: "Fake Alpha",
          description: "Erste erfundene Firma",
          handle: "alpha",
          agentIds: ["agent-alpha-1", "agent-alpha-2"],
          accent: "#123456",
        },
        {
          id: "beta",
          name: "Fake Beta",
          description: "Zweite erfundene Firma",
          handle: "beta",
          agentIds: [],
          accent: "#654321",
        },
        {
          id: "gamma",
          name: "Fake Gamma",
          description: "Dritte erfundene Firma",
          handle: "gamma",
          agentIds: ["agent-gamma-1"],
          accent: "#abcdef",
        },
      ]),
    );
    this.kv.set(
      "u:fake-user-b:connect.companies.custom",
      JSON.stringify([
        {
          id: "delta",
          name: "Fake Delta",
          description: "Fremde Firma",
          handle: "delta",
          agentIds: ["agent-delta-1"],
          accent: "#111111",
        },
      ]),
    );

    this.agents.set("agent-alpha-1", { name: "Alpha Bot 1", headline: "Erster" });
    this.agents.set("agent-alpha-2", { name: "Alpha Bot 2", headline: "Zweiter" });
    this.agents.set("agent-gamma-1", { name: "Gamma Bot", headline: null });
    this.agents.set("agent-delta-1", { name: "Delta Bot", headline: null });

    this.agentProfiles.set("agent-alpha-1", {
      owner_user_id: "fake-user-a",
      visibility: "private",
      deleted_at: null,
    });
    this.agentProfiles.set("agent-alpha-2", {
      owner_user_id: "fake-user-a",
      visibility: "private",
      deleted_at: null,
    });
    this.agentProfiles.set("agent-gamma-1", {
      owner_user_id: "fake-user-a",
      visibility: "private",
      deleted_at: null,
    });
    this.agentProfiles.set("agent-delta-1", {
      owner_user_id: "fake-user-b",
      visibility: "private",
      deleted_at: null,
    });
  }

  /** Rohe Firmenliste eines Nutzers (wie in der DB gespeichert). */
  rawCompanies(userId: string): FakeCompany[] {
    const raw = this.kv.get(`u:${userId}:connect.companies.custom`);
    if (!raw) return [];
    return JSON.parse(raw) as FakeCompany[];
  }

  private writeCompanies(userId: string, list: FakeCompany[]) {
    this.kv.set(`u:${userId}:connect.companies.custom`, JSON.stringify(list));
  }

  database(): Database {
    const self = this;
    const db = {
      execute: async (q: unknown) => {
        const flat = sqlText(q).replace(/\s+/g, " ").trim();
        const params = sqlParams(q);

        // --- Schema (idempotent, additiv) ---------------------------------
        if (/CREATE TABLE IF NOT EXISTS company_profile_agent_assignments/i.test(flat)) return [];
        if (/CREATE INDEX IF NOT EXISTS company_profile_agent_assignments/i.test(flat)) return [];
        if (/ALTER TABLE company_profile_agent_assignments ADD COLUMN/i.test(flat)) return [];

        // --- Zuordnungen ---------------------------------------------------
        if (/INSERT INTO company_profile_agent_assignments/.test(flat)) {
          const [id, userId, profileId, companyId, agentId, agentName] = params as string[];
          const existing = self.assignments.find(
            (r) => r.user_id === userId && r.external_agent_id === agentId,
          );
          if (existing) {
            existing.profile_id = profileId;
            existing.company_id = companyId ?? existing.company_id;
            existing.external_agent_name = agentName ?? null;
            existing.updated_at = new Date().toISOString();
            return [existing];
          }
          const created: FakeRow = {
            id,
            user_id: userId,
            profile_id: profileId,
            company_id: companyId ?? null,
            external_agent_id: agentId,
            external_agent_name: agentName ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          self.assignments.push(created);
          return [created];
        }

        if (/FROM company_profile_agent_assignments WHERE user_id/.test(flat)) {
          const userId = params[0];
          return self.assignments.filter((r) => r.user_id === userId);
        }

        // --- Workspace ------------------------------------------------------
        if (/SELECT key, value FROM connect_workspace_kv WHERE key = /.test(flat)) {
          const key = String(params[0]);
          if (!self.kv.has(key)) return [];
          return [{ key, value: self.kv.get(key) }];
        }

        if (/UPDATE connect_workspace_kv SET value =/.test(flat)) {
          const [rawValue, key] = params as string[];
          const stored = JSON.parse(rawValue) as string;
          self.kv.set(String(key), stored);
          return [];
        }

        // --- Agenten ---------------------------------------------------------
        if (/SELECT a.id FROM agents a/.test(flat)) {
          const [agentId, userId] = params as string[];
          if (!self.agents.has(agentId)) return [];
          const profile = self.agentProfiles.get(agentId);
          if (!profile) return [{ id: agentId }];
          if (profile.deleted_at) return [];
          const owned = profile.owner_user_id === userId;
          const visible = profile.visibility === "public" || owned || !profile.owner_user_id;
          return visible ? [{ id: agentId }] : [];
        }

        if (/SELECT a.id, a.name, a.headline, p.visibility, p.owner_user_id/.test(flat)) {
          const ids = params.map((p) => String(p));
          return ids
            .filter((id) => self.agents.has(id))
            .map((id) => {
              const agent = self.agents.get(id)!;
              const profile = self.agentProfiles.get(id);
              return {
                id,
                name: agent.name,
                headline: agent.headline,
                visibility: profile?.visibility ?? null,
                owner_user_id: profile?.owner_user_id ?? null,
              };
            });
        }

        return [];
      },
    };
    return db as unknown as Database;
  }

  /** Setzt eine Zuordnung direkt (fuer Ausgangslagen). */
  seedAssignment(row: FakeRow) {
    this.assignments.push(row);
  }
}
