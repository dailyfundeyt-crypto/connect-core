/**
 * Swarm-Grants & Berechtigungsprüfung (v06 / Wave 2 / A18).
 *
 * Verwaltet Freigaben (SwarmGrants) pro Firma und Principal.
 * Standard-Regel: Zugriff wird standardmäßig VERWEIGERT (Deny by Default).
 *
 * Unterstützte Scopes (gemäß contracts/v06/connect-mcp.ts):
 * - read:         Lesender Zugriff auf Status, Firmen, Schwärme, Health
 * - operate:      Ausführen und Steuern von Schwarm-Aufgaben (impliziert read)
 * - create_swarm: Erstellen neuer dynamischer Schwärme
 * - brain_write:  Schreibender Zugriff auf das Connect Brain / Notizen
 * - open_ui:      Generieren mobiler QR-Kopplungs-Links und UI-Aufruf
 * - use_agents:   Nutzung bestehender Connect-Agenten (Perplexity/Codex/Claude/etc.)
 */

import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import type { SwarmScope, SwarmGrantWithMeta } from "./types";

// In-Memory-Speicher für lokale Ausführung und Unittests
const inMemoryGrants = new Map<string, SwarmGrantWithMeta>();

let tableInitPromise: Promise<void> | null = null;

export async function ensureSwarmGrantsTables(database: Database): Promise<void> {
  tableInitPromise ??= (async () => {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS swarm_grants (
        id text PRIMARY KEY,
        principal text NOT NULL,
        company_id text NOT NULL,
        swarm_id text,
        scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz
      )
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS swarm_grants_principal_idx ON swarm_grants (principal)
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS swarm_grants_company_id_idx ON swarm_grants (company_id)
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS swarm_grants_revoked_at_idx ON swarm_grants (revoked_at)
    `);
  })().catch((err) => {
    tableInitPromise = null;
    throw err;
  });
  return tableInitPromise;
}

/**
 * Standard-Prüffunktion: check(principal, companyId, scope, swarmId?)
 *
 * REGEL: Default: VERWEIGERN!
 * Ein Zugriff wird NUR gewährt, wenn:
 * 1. Ein aktiver (nicht widerrufener) Grant für den Principal existiert.
 * 2. Die Firma übereinstimmt (oder der Grant firmenübergreifend '*' ist).
 * 3. Falls im Grant eine swarmId spezifiziert ist, diese mit der Ziel-swarmId übereinstimmt.
 * 4. Der erforderliche Scope in den freigegebenen Scopes enthalten ist.
 *    (Hinweis: 'operate' schließt lesenden Zugriff 'read' auf Schwärme ein).
 */
export function check(
  principal: string,
  companyId: string,
  scope: SwarmScope,
  swarmId?: string,
): { allowed: boolean; reason?: string; grant?: SwarmGrantWithMeta } {
  if (!principal || typeof principal !== "string") {
    return { allowed: false, reason: "Kein Principal angegeben. Zugriff verweigert." };
  }

  // Suche alle Grants für diesen Principal
  const matchingGrants = Array.from(inMemoryGrants.values()).filter(
    (g) => g.principal.toLowerCase() === principal.trim().toLowerCase(),
  );

  if (matchingGrants.length === 0) {
    return {
      allowed: false,
      reason: `Kein SwarmGrant für Principal "${principal}" gefunden. Zugriff standardmäßig verweigert.`,
    };
  }

  // Filtere widerrufene Grants heraus (revoked_at)
  const activeGrants = matchingGrants.filter((g) => !g.revokedAt);
  if (activeGrants.length === 0) {
    return {
      allowed: false,
      reason: `Alle SwarmGrants für Principal "${principal}" wurden widerrufen. Zugriff verweigert.`,
    };
  }

  // Prüfe Firmen-Übereinstimmung
  const companyGrants = activeGrants.filter(
    (g) => g.companyId === "*" || g.companyId === companyId,
  );

  if (companyGrants.length === 0) {
    const allowedCompanies = Array.from(new Set(activeGrants.map((g) => g.companyId))).join(", ");
    return {
      allowed: false,
      reason: `Keine Berechtigung für Firma "${companyId}". Principal "${principal}" besitzt nur Grants für: [${allowedCompanies}].`,
    };
  }

  // Prüfe optionale Swarm-ID-Einschränkung und Scope
  for (const grant of companyGrants) {
    if (grant.swarmId && swarmId && grant.swarmId !== swarmId) {
      continue;
    }

    const scopes = grant.scopes || [];
    let scopeAllowed = false;

    if (scopes.includes(scope)) {
      scopeAllowed = true;
    } else if (scope === "read" && scopes.includes("operate")) {
      // 'operate' schließt 'read' ein
      scopeAllowed = true;
    }

    if (scopeAllowed) {
      return { allowed: true, grant };
    }
  }

  return {
    allowed: false,
    reason: `403 Forbidden: Scope "${scope}" ist für Principal "${principal}" in Firma "${companyId}" nicht freigegeben.`,
  };
}

/**
 * Erstellt einen neuen SwarmGrant.
 */
export async function createSwarmGrant(
  params: {
    principal: string;
    companyId: string;
    swarmId?: string;
    scopes: SwarmScope[];
  },
  database?: Database,
): Promise<SwarmGrantWithMeta> {
  const id = `grant_${randomBytes(10).toString("hex")}`;
  const now = new Date().toISOString();

  const grant: SwarmGrantWithMeta = {
    id,
    principal: params.principal.trim(),
    companyId: params.companyId.trim(),
    swarmId: params.swarmId?.trim() || undefined,
    scopes: params.scopes,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
  };

  inMemoryGrants.set(id, grant);

  if (database) {
    try {
      await ensureSwarmGrantsTables(database);
      await database.execute(sql`
        INSERT INTO swarm_grants (id, principal, company_id, swarm_id, scopes, created_at, updated_at, revoked_at)
        VALUES (
          ${grant.id},
          ${grant.principal},
          ${grant.companyId},
          ${grant.swarmId ?? null},
          ${JSON.stringify(grant.scopes)}::jsonb,
          ${new Date(grant.createdAt)},
          ${new Date(grant.updatedAt ?? Date.now())},
          null
        )
      `);
    } catch (err) {
      console.warn("[SwarmGrants] DB Insert fallback to in-memory:", err);
    }
  }

  return grant;
}

/**
 * Listet SwarmGrants auf. Standardmäßig werden widerrufene Grants ausgeschlossen.
 */
export async function listSwarmGrants(
  filter?: { principal?: string; companyId?: string; includeRevoked?: boolean },
  database?: Database,
): Promise<SwarmGrantWithMeta[]> {
  if (database) {
    try {
      await ensureSwarmGrantsTables(database);
      const res = await database.execute(sql`
        SELECT id, principal, company_id, swarm_id, scopes, created_at, updated_at, revoked_at
        FROM swarm_grants
        ORDER BY created_at DESC
      `);

      if (Array.isArray(res)) {
        for (const r of res as any[]) {
          const grant: SwarmGrantWithMeta = {
            id: String(r.id),
            principal: String(r.principal),
            companyId: String(r.company_id),
            swarmId: r.swarm_id ? String(r.swarm_id) : undefined,
            scopes: Array.isArray(r.scopes)
              ? r.scopes
              : typeof r.scopes === "string"
              ? JSON.parse(r.scopes)
              : [],
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
            revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
          };
          inMemoryGrants.set(grant.id, grant);
        }
      }
    } catch (err) {
      console.warn("[SwarmGrants] DB list fallback to in-memory:", err);
    }
  }

  let list = Array.from(inMemoryGrants.values());

  if (!filter?.includeRevoked) {
    list = list.filter((g) => !g.revokedAt);
  }
  if (filter?.principal) {
    list = list.filter((g) => g.principal.toLowerCase() === filter.principal!.toLowerCase());
  }
  if (filter?.companyId && filter.companyId !== "*") {
    list = list.filter((g) => g.companyId === "*" || g.companyId === filter.companyId);
  }

  return list;
}

/**
 * Ruft einen Grant anhand seiner ID ab.
 */
export async function getSwarmGrant(
  id: string,
  database?: Database,
): Promise<SwarmGrantWithMeta | null> {
  const mem = inMemoryGrants.get(id);
  if (mem) return mem;

  if (database) {
    try {
      await ensureSwarmGrantsTables(database);
      const res = await database.execute(sql`
        SELECT id, principal, company_id, swarm_id, scopes, created_at, updated_at, revoked_at
        FROM swarm_grants
        WHERE id = ${id}
        LIMIT 1
      `);
      if (Array.isArray(res) && res.length > 0) {
        const r: any = res[0];
        const grant: SwarmGrantWithMeta = {
          id: String(r.id),
          principal: String(r.principal),
          companyId: String(r.company_id),
          swarmId: r.swarm_id ? String(r.swarm_id) : undefined,
          scopes: Array.isArray(r.scopes)
            ? r.scopes
            : typeof r.scopes === "string"
            ? JSON.parse(r.scopes)
            : [],
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
          revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
        };
        inMemoryGrants.set(grant.id, grant);
        return grant;
      }
    } catch (err) {
      console.warn("[SwarmGrants] DB get error:", err);
    }
  }

  return null;
}

/**
 * Widerruft einen SwarmGrant (Soft-Delete über revoked_at).
 * Wichtig: Niemals Zeilen löschen!
 */
export async function revokeSwarmGrant(
  id: string,
  database?: Database,
): Promise<boolean> {
  const existing = inMemoryGrants.get(id);
  const now = new Date().toISOString();

  if (existing) {
    existing.revokedAt = now;
    existing.updatedAt = now;
  }

  if (database) {
    try {
      await ensureSwarmGrantsTables(database);
      await database.execute(sql`
        UPDATE swarm_grants
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE id = ${id}
      `);
      return true;
    } catch (err) {
      console.warn("[SwarmGrants] DB revoke error:", err);
    }
  }

  return Boolean(existing);
}

/**
 * Hilfsfunktion zum Leeren für Unittests.
 */
export function clearGrantsForTests(): void {
  inMemoryGrants.clear();
}
