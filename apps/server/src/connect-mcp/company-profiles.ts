/**
 * Connect-MCP: Unternehmensprofile + Zuordnung zu externen Agenten (Grok Bot).
 *
 * Zwei Datenquellen, sauber getrennt:
 *
 *  1. **Profile** liegen in der zentralen Social-DB (Supabase, `connect_social_profiles`).
 *     Gelesen wird über den bestehenden Social-Zugang (`Q`), der die E-Mail des
 *     angemeldeten Nutzers auf die Supabase-User-ID abbildet. Es werden nur
 *     `id` und `name` gelesen — keine Profilinhalte (Bio, Logo, Beiträge …).
 *
 *  2. **Zuordnungen** liegen in der lokalen Connect-DB neben den MCP-Tokens
 *     (`company_profile_agent_assignments`). Das Schema wird idempotent beim
 *     ersten Zugriff angelegt (`CREATE TABLE IF NOT EXISTS`), genau wie
 *     `connect_mcp_tokens` — additiv, keine DROP/ALTER.
 *
 * Sicherheitsregeln:
 *  - Ein Tool sieht ausschließlich Profile, die dem Nutzer gehören
 *    (`owner_user_id = <userId>`).
 *  - `assign` schlägt fehl, wenn das Zielprofil nicht dem Nutzer gehört.
 *  - Read-Token dürfen `list`, aber nicht `assign` (Scope-Gate im Router).
 */

import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

/** Minimaler Query-Zugang (Supabase/Social). */
export type ProfileQuery = (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

export type CompanyProfileSummary = {
  id: string;
  name: string;
};

export type CompanyProfileAssignment = {
  id: string;
  userId: string;
  profileId: string;
  externalAgentId: string;
  externalAgentName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanyProfileAgentDeps = {
  /** Lokale Connect-DB (Zuordnungen). */
  database?: Database;
  /** Social-/Supabase-Zugang (Profile). */
  query?: ProfileQuery | null;
};

// ============================================================================
// Schema (lokal, idempotent)
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
  })().catch((error) => {
    ensured = null;
    throw error;
  });
  return ensured;
}

/** Nur für Tests: Schema-Cache zurücksetzen. */
export function resetCompanyProfileAssignmentSchemaForTests(): void {
  ensured = null;
}

// ============================================================================
// Profile lesen (nur id + name)
// ============================================================================

const PROFILE_COLS = "id, name";

/**
 * Löst den Profil-Besitzer auf.
 *
 * Reihenfolge:
 *  1. Die Actor-ID besitzt direkt Profile → die Actor-ID ist der Besitzer.
 *     (Bei Connect-MCP-Tokens ist `user_id` die zentrale User-ID.)
 *  2. Sonst über die E-Mail in der zentralen `users`-Tabelle (gleiche Abbildung
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
    /* Tabelle/Verbindung nicht verfügbar → nächster Versuch */
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

/** Alle Profile des Nutzers — nur `id` und `name`. */
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
 * Ein Profil des Nutzers auflösen: zuerst nach ID, dann nach Name (case-insensitive),
 * zuletzt nach local_id. Fremde Profile werden nie gefunden.
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

// ============================================================================
// Zuordnungen (lokal)
// ============================================================================

function mapAssignment(row: Record<string, unknown>): CompanyProfileAssignment {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    profileId: String(row.profile_id),
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
    sql`SELECT id, user_id, profile_id, external_agent_id, external_agent_name, created_at, updated_at
        FROM company_profile_agent_assignments WHERE user_id = ${userId} ORDER BY created_at`,
  )) as Array<Record<string, unknown>>;
  return rows.map(mapAssignment);
}

/**
 * Upsert der Zuordnung. Idempotent: ein (user_id, external_agent_id)-Paar existiert
 * höchstens einmal; ein erneuter Aufruf aktualisiert nur Profil/Name.
 */
export async function upsertCompanyProfileAssignment(
  database: Database,
  input: {
    userId: string;
    profileId: string;
    externalAgentId: string;
    externalAgentName?: string | null;
  },
): Promise<CompanyProfileAssignment> {
  await ensureCompanyProfileAssignmentTable(database);
  const id = `cpa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const rows = (await database.execute(
    sql`INSERT INTO company_profile_agent_assignments
        (id, user_id, profile_id, external_agent_id, external_agent_name, created_at, updated_at)
        VALUES (${id}, ${input.userId}, ${input.profileId}, ${input.externalAgentId},
                ${input.externalAgentName ?? null}, now(), now())
        ON CONFLICT (user_id, external_agent_id) DO UPDATE
          SET profile_id = EXCLUDED.profile_id,
              external_agent_name = EXCLUDED.external_agent_name,
              updated_at = now()
        RETURNING id, user_id, profile_id, external_agent_id, external_agent_name, created_at, updated_at`,
  )) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) throw new Error("Zuordnung konnte nicht gespeichert werden.");
  return mapAssignment(row);
}
