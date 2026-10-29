/**
 * Connect-MCP: Unternehmensprofile + Zuordnung zu externen Agenten (Grok Bot).
 *
 * DIE ECHTE FIRMENQUELLE
 *
 * Die Firmen des Nutzers liegen in `connect_workspace_kv` unter dem
 * nutzer-praefizierten Schluessel `u:<userId>:connect.companies.custom` — das
 * ist die Zeile, aus der der Firmen-Umschalter der App liest (siehe
 * `apps/app/src/lib/companies/store.ts` + `connect/routes.ts`). Die Lese- und
 * Schreiblogik fuer diese Quelle steht in `companies.ts`.
 *
 * `connect_social_profiles` (zentrale Supabase) ist eine ANDERE Quelle: dort
 * liegen nur die ueber Connect Sozial veroeffentlichten Firmen — 5 statt 7.
 * `company_profiles.list` las dort und lieferte deshalb nur 5, und
 * `assign('Nexus')` schlug mit "nicht gefunden" fehl: Nexus und Consensus
 * existieren nur in der Workspace-Zeile.
 *
 * ZUORDNUNGEN
 *
 * Die Zuordnungen liegen in der lokalen Connect-DB neben den MCP-Tokens
 * (`company_profile_agent_assignments`). Das Schema wird idempotent beim
 * ersten Zugriff angelegt (`CREATE TABLE IF NOT EXISTS`), genau wie
 * `connect_mcp_tokens` — additiv, keine DROP/ALTER von Altbestand.
 *
 * Additive Erweiterung: die Spalte `company_id` (nullable) verweist auf die
 * Firmen-ID der echten Quelle. Die alte Spalte `profile_id` bleibt
 * unangetastet: sie zeigt weiterhin auf die Social-Profil-ID, wo es eine
 * gibt, und sonst auf die Firmen-ID.
 *
 * Sicherheitsregeln:
 *  - Ein Tool sieht ausschliesslich Firmen, die dem Nutzer gehoeren
 *    (`u:<userId>:`-Praefix im Workspace-Schluessel).
 *  - `assign` schlaegt fehl, wenn die Zielfirma nicht dem Nutzer gehoert.
 *  - Read-Token duerfen `list`, aber nicht `assign` (Scope-Gate im Router).
 */

import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  findWorkspaceCompany,
  listWorkspaceCompanies,
  renameWorkspaceCompany,
  type WorkspaceCompany,
} from "./companies";

/** Minimaler Query-Zugang (Supabase/Social). */
export type ProfileQuery = (
  text: string,
  params?: unknown[],
) => Promise<Array<Record<string, unknown>>>;

export type CompanyProfileSummary = {
  id: string;
  name: string;
};

export type CompanyProfileAssignment = {
  id: string;
  userId: string;
  profileId: string;
  /** Firmen-ID der echten Quelle (nullable: Altzeilen haben sie noch nicht). */
  companyId: string | null;
  externalAgentId: string;
  externalAgentName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanyProfileAgentDeps = {
  /** Lokale Connect-DB (Zuordnungen). */
  database?: Database;
  /** Social-/Supabase-Zugang (Profile). Nur lokal in der App verfuegbar. */
  query?: ProfileQuery | null;
};

// ============================================================================
// Schema (lokal, idempotent, additiv)
// ============================================================================

let ensured: Promise<void> | null = null;

export function ensureCompanyProfileAssignmentTable(database: Database): Promise<void> {
  ensured ??= (async () => {
    await database.execute(sql`CREATE TABLE IF NOT EXISTS company_profile_agent_assignments (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      profile_id text NOT NULL,
      external_agent_id text NOT NULL,
      external_agent_name text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT company_profile_agent_assignments_user_agent_key UNIQUE (user_id, external_agent_id)
    )`);
    await database.execute(
      sql`CREATE INDEX IF NOT EXISTS company_profile_agent_assignments_user_idx
          ON company_profile_agent_assignments (user_id)`,
    );
    /*
     * Additive Spalte: die Firmen-ID der echten Quelle. `ADD COLUMN IF NOT
     * EXISTS` laesst vorhandene Zeilen unangetastet (die Spalte bleibt NULL,
     * bis eine Zuordnung neu geschrieben wird) und ist damit kein Datenverlust.
     */
    await database.execute(
      sql`ALTER TABLE company_profile_agent_assignments
          ADD COLUMN IF NOT EXISTS company_id text`,
    );
    await database.execute(
      sql`CREATE INDEX IF NOT EXISTS company_profile_agent_assignments_company_idx
          ON company_profile_agent_assignments (user_id, company_id)`,
    );
  })().catch((error) => {
    ensured = null;
    throw error;
  });
  return ensured;
}

/** Nur fuer Tests: Schema-Cache zuruecksetzen. */
export function resetCompanyProfileAssignmentSchemaForTests(): void {
  ensured = null;
}

// ============================================================================
// Profile lesen (nur id + name)
// ============================================================================

const PROFILE_COLS = "id, name";

/**
 * Loest den Profil-Besitzer auf.
 *
 * Reihenfolge:
 *  1. Die Actor-ID besitzt direkt Profile → die Actor-ID ist der Besitzer.
 *     (Bei Connect-MCP-Tokens ist `user_id` die zentrale User-ID.)
 *  2. Sonst ueber die E-Mail in der zentralen `users`-Tabelle (gleiche Abbildung
 *     wie der Social-Zugang in `social/local.ts`).
 *  3. Sonst die Actor-ID.
 */
export async function resolveProfileOwnerId(
  query: ProfileQuery,
  actorId: string,
  actorEmail?: string | null,
): Promise<string> {
  try {
    const direct = await query(
      `SELECT 1 FROM connect_social_profiles WHERE owner_user_id = $1 LIMIT 1`,
      [actorId],
    );
    if (direct.length > 0) return actorId;
  } catch {
    /* Tabelle/Verbindung nicht verfuegbar → naechster Versuch */
  }
  if (actorEmail) {
    try {
      const rows = await query(`SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [
        actorEmail,
      ]);
      const id = rows[0]?.id;
      if (typeof id === "string" && id) return id;
    } catch {
      /* Fallback auf actorId */
    }
  }
  return actorId;
}

/** Alle Social-Profile des Nutzers — nur `id` und `name`. */
export async function listCompanyProfiles(
  query: ProfileQuery,
  ownerUserId: string,
): Promise<CompanyProfileSummary[]> {
  const rows = await query(
    `SELECT ${PROFILE_COLS} FROM connect_social_profiles WHERE owner_user_id = $1 ORDER BY created_at`,
    [ownerUserId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
  }));
}

/**
 * Ein Social-Profil des Nutzers aufloesen: zuerst nach ID, dann nach Name
 * (case-insensitive), zuletzt nach local_id. Fremde Profile werden nie gefunden.
 */
export async function findOwnedCompanyProfile(
  query: ProfileQuery,
  ownerUserId: string,
  profile: string,
): Promise<CompanyProfileSummary | null> {
  const wanted = profile.trim();
  if (!wanted) return null;

  const byId = await query(
    `SELECT ${PROFILE_COLS} FROM connect_social_profiles WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [wanted, ownerUserId],
  );
  if (byId[0]) return { id: String(byId[0].id), name: String(byId[0].name ?? "") };

  const byName = await query(
    `SELECT ${PROFILE_COLS} FROM connect_social_profiles WHERE owner_user_id = $1 AND lower(name) = lower($2) LIMIT 1`,
    [ownerUserId, wanted],
  );
  if (byName[0]) return { id: String(byName[0].id), name: String(byName[0].name ?? "") };

  const byLocalId = await query(
    `SELECT ${PROFILE_COLS} FROM connect_social_profiles WHERE owner_user_id = $1 AND local_id = $2 LIMIT 1`,
    [ownerUserId, wanted],
  );
  if (byLocalId[0]) return { id: String(byLocalId[0].id), name: String(byLocalId[0].name ?? "") };

  return null;
}

/**
 * Die Social-Profil-ID je Firma, falls die Firma ueber Connect Sozial
 * veroeffentlicht wurde. Alt-Zuordnungen (`profile_id` = Social-Profil-ID)
 * werden dadurch weiterhin der richtigen Firma zugeordnet.
 */
export async function mapSocialProfileIdsToCompanies(
  query: ProfileQuery | null | undefined,
  ownerUserId: string,
  companies: WorkspaceCompany[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!query) return map;
  let profiles: CompanyProfileSummary[];
  try {
    profiles = await listCompanyProfiles(query, ownerUserId);
  } catch {
    return map;
  }
  for (const company of companies) {
    const lower = company.name.trim().toLowerCase();
    const hit = profiles.find(
      (p) => p.name.trim().toLowerCase() === lower || p.id === company.id,
    );
    if (hit) map.set(company.id, hit.id);
  }
  return map;
}

// ============================================================================
// Zuordnungen (lokal)
// ============================================================================

function mapAssignment(row: Record<string, unknown>): CompanyProfileAssignment {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    profileId: String(row.profile_id),
    companyId:
      row.company_id === null || row.company_id === undefined
        ? null
        : String(row.company_id),
    externalAgentId: String(row.external_agent_id),
    externalAgentName:
      row.external_agent_name === null || row.external_agent_name === undefined
        ? null
        : String(row.external_agent_name),
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : "",
  };
}

export async function listCompanyProfileAssignments(
  database: Database,
  userId: string,
): Promise<CompanyProfileAssignment[]> {
  await ensureCompanyProfileAssignmentTable(database);
  const rows = (await database.execute(
    sql`SELECT id, user_id, profile_id, company_id, external_agent_id, external_agent_name, created_at, updated_at
        FROM company_profile_agent_assignments WHERE user_id = ${userId} ORDER BY created_at`,
  )) as Array<Record<string, unknown>>;
  return rows.map(mapAssignment);
}

/**
 * Upsert der Zuordnung. Idempotent: ein (user_id, external_agent_id)-Paar existiert
 * hoechstens einmal; ein erneuter Aufruf aktualisiert nur Profil/Firma/Name.
 */
export async function upsertCompanyProfileAssignment(
  database: Database,
  input: {
    userId: string;
    profileId: string;
    companyId?: string | null;
    externalAgentId: string;
    externalAgentName?: string | null;
  },
): Promise<CompanyProfileAssignment> {
  await ensureCompanyProfileAssignmentTable(database);
  const id = `cpa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const rows = (await database.execute(
    sql`INSERT INTO company_profile_agent_assignments
        (id, user_id, profile_id, company_id, external_agent_id, external_agent_name, created_at, updated_at)
        VALUES (${id}, ${input.userId}, ${input.profileId}, ${input.companyId ?? null},
                ${input.externalAgentId}, ${input.externalAgentName ?? null}, now(), now())
        ON CONFLICT (user_id, external_agent_id) DO UPDATE
          SET profile_id = EXCLUDED.profile_id,
              company_id = COALESCE(EXCLUDED.company_id, company_profile_agent_assignments.company_id),
              external_agent_name = EXCLUDED.external_agent_name,
              updated_at = now()
        RETURNING id, user_id, profile_id, company_id, external_agent_id, external_agent_name, created_at, updated_at`,
  )) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) throw new Error("Zuordnung konnte nicht gespeichert werden.");
  return mapAssignment(row);
}

// ============================================================================
// Firmen der echten Quelle (Weiterleitung an `companies.ts`)
// ============================================================================

export { findWorkspaceCompany, listWorkspaceCompanies, renameWorkspaceCompany };
export type { WorkspaceCompany };
