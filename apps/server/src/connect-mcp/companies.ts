/**
 * Connect-MCP: ECHTE Firmenquelle + Agenten-Zuordnung.
 *
 * DIE ECHTE FIRMENQUELLE
 *
 * Der Firmen-Umschalter in der App liest `listCompanies()` aus
 * `apps/app/src/lib/companies/store.ts`. Die Firmen liegen als JSON-Array im
 * localStorage-Schluessel `connect.companies.custom`, und der Workspace-Sync
 * spiegelt diesen Schluessel pro Konto in die lokale Postgres-Tabelle
 * `connect_workspace_kv` unter dem nutzer-praefizierten Schluessel
 * `u:<userId>:connect.companies.custom` (siehe `connect/routes.ts`).
 *
 * Genau diese Zeile ist die Quelle. `connect_social_profiles` (zentrale
 * Supabase) ist eine ANDERE Quelle: dort liegen nur die Firmen, die ueber
 * Connect Sozial veroeffentlicht wurden — 5 statt 7. Deshalb lieferte
 * `company_profiles.list` nur 5 Firmen, und `assign('Nexus')` schlug fehl:
 * "Nexus" und "Consensus" existieren nur in der Workspace-Zeile.
 *
 * EIGENTUMSLOGIK
 *
 * Der Workspace-Schluessel ist pro Konto (`u:<userId>:`). Der MCP-Aufrufer ist
 * der Besitzer des Bearer-Tokens, also genau der Nutzer, dessen Zeile
 * gelesen wird. Fremde Firmen sind damit unsichtbar.
 *
 * AGENTEN-ZUORDNUNG
 *
 * Die Zuordnung Agent→Firma existiert bereits: jede Firma im Workspace traegt
 * ihre `agentIds`-Liste (das ist die Roster-Ansicht der App, siehe
 * `moveAgentToCompany` in `apps/app/src/lib/companies/store.ts`). Deshalb wird
 * hier KEINE neue Zuordnungstabelle angelegt — das waere eine zweite Quelle
 * fuer dieselbe Sache. `assign_agent` schreibt in genau diese Liste.
 *
 * Alle Schreibzugriffe sind additiv: bestehende Zeilen und Werte werden
 * gelesen, geaendert und zurueckgeschrieben, nichts wird geloescht. Unbekannte
 * Felder eines Firmen-Objekts (accent, logo, admin, …) bleiben unveraendert.
 */

import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

/** Logischer Workspace-Schluessel (der Nutzer-Praefix wird davor gesetzt). */
export const COMPANIES_WORKSPACE_KEY = "connect.companies.custom";

export type WorkspaceCompany = {
  id: string;
  name: string;
  description: string | null;
  handle: string | null;
  /** Agenten-Roster der Firma (IDs aus der `agents`-Tabelle plus Bot-IDs). */
  agentIds: string[];
};

export type CompanyAgentRow = {
  id: string;
  name: string | null;
  headline: string | null;
  visibility: string | null;
  owner_user_id: string | null;
};

export type CompanySummary = {
  id: string;
  name: string;
  description: string | null;
  handle: string | null;
  /** Anzahl Agenten im Roster der Firma. */
  agent_count: number;
  /** Anzahl externer (Grok-Bot-)Agenten, die per `company_profiles.assign` zugeordnet sind. */
  assigned_external_agent_count: number;
};

// ============================================================================
// Lesen
// ============================================================================

/** Der Wert kann als JSON-Text in einer jsonb-Spalte stehen (doppelt kodiert). */
function decode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}

/** Ein Roh-Objekt aus der Firmenliste (mit allen unbekannten Feldern). */
type RawCompany = Record<string, unknown> & {
  id: string;
  name?: string;
  agentIds?: unknown;
};

function rawCompanyId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = (raw as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id : null;
}

function rawAgentIds(raw: RawCompany): string[] {
  if (!Array.isArray(raw.agentIds)) return [];
  return [
    ...new Set(
      raw.agentIds.filter(
        (a): a is string => typeof a === "string" && a.trim().length > 0,
      ),
    ),
  ];
}

function toWorkspaceCompany(raw: RawCompany): WorkspaceCompany {
  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : raw.id,
    description: typeof raw.description === "string" ? raw.description : null,
    handle: typeof raw.handle === "string" ? raw.handle : null,
    agentIds: rawAgentIds(raw),
  };
}

/** Die Zeile, aus der die Firmen dieses Nutzers gelesen werden. */
type CompaniesRow = { key: string; value: unknown };

async function readCompaniesRow(
  database: Database,
  userId: string,
): Promise<CompaniesRow | null> {
  const scopedKey = `u:${userId}:${COMPANIES_WORKSPACE_KEY}`;
  const rows = (await database.execute(
    sql`SELECT key, value FROM connect_workspace_kv WHERE key = ${scopedKey}`,
  )) as Array<Record<string, unknown>>;
  const scoped = rows.find((r) => String(r.key) === scopedKey);
  if (!scoped) return null;
  return { key: scopedKey, value: scoped.value };
}

/** Die rohen Firmen-Objekte dieses Nutzers (unveraenderte Felder). */
async function readRawCompanies(
  database: Database,
  userId: string,
): Promise<{ key: string; list: RawCompany[]; storedAsText: boolean } | null> {
  const row = await readCompaniesRow(database, userId);
  if (!row) return null;
  const decoded = decode(row.value);
  if (!Array.isArray(decoded)) return null;
  const list = decoded.filter(
    (raw): raw is RawCompany => rawCompanyId(raw) !== null,
  );
  return {
    key: row.key,
    list,
    storedAsText: typeof row.value === "string",
  };
}

/** Alle Firmen des Nutzers, in der Reihenfolge der Quelle. */
export async function listWorkspaceCompanies(
  database: Database,
  userId: string,
): Promise<WorkspaceCompany[]> {
  const raw = await readRawCompanies(database, userId);
  if (!raw) return [];
  return raw.list.map(toWorkspaceCompany);
}

/**
 * Eine eigene Firma aufloesen: erst ID, dann Name (case-insensitive), dann
 * Handle. Fremde Firmen werden nie gefunden — es werden nur die Firmen des
 * aufrufenden Nutzers durchsucht.
 */
export async function findWorkspaceCompany(
  database: Database,
  userId: string,
  reference: string,
): Promise<WorkspaceCompany | null> {
  const wanted = reference.trim();
  if (!wanted) return null;
  const companies = await listWorkspaceCompanies(database, userId);

  const lower = wanted.toLowerCase();
  const byId = companies.find((c) => c.id.toLowerCase() === lower);
  if (byId) return byId;
  const byName = companies.find((c) => c.name.trim().toLowerCase() === lower);
  if (byName) return byName;
  const byHandle = companies.find((c) => (c.handle ?? "").toLowerCase() === lower);
  if (byHandle) return byHandle;
  return null;
}

/** Die Agenten-Zeilen (id/name/…) fuer eine Liste von Agent-IDs. */
export async function loadAgentsByIds(
  database: Database,
  agentIds: string[],
): Promise<Map<string, CompanyAgentRow>> {
  const out = new Map<string, CompanyAgentRow>();
  if (agentIds.length === 0) return out;
  const rows = (await database.execute(
    sql`SELECT a.id, a.name, a.headline, p.visibility, p.owner_user_id
        FROM agents a
        LEFT JOIN agent_profiles p ON p.agent_id = a.id
        WHERE a.id IN (${sql.join(agentIds.map((id) => sql`${id}`), sql`, `)})`,
  )) as Array<Record<string, unknown>>;
  for (const row of rows) {
    out.set(String(row.id), {
      id: String(row.id),
      name: row.name === null || row.name === undefined ? null : String(row.name),
      headline:
        row.headline === null || row.headline === undefined
          ? null
          : String(row.headline),
      visibility:
        row.visibility === null || row.visibility === undefined
          ? null
          : String(row.visibility),
      owner_user_id:
        row.owner_user_id === null || row.owner_user_id === undefined
          ? null
          : String(row.owner_user_id),
    });
  }
  return out;
}

/**
 * Gehoert der Agent dem Nutzer? Ein Agent ist zuordenbar, wenn er existiert
 * und entweder dem Nutzer gehoert oder oeffentlich ist. Private Agenten
 * fremder Nutzer sind nicht zuordenbar.
 */
export async function isAgentAccessible(
  database: Database,
  userId: string,
  agentId: string,
): Promise<boolean> {
  const rows = (await database.execute(
    sql`SELECT a.id FROM agents a
        LEFT JOIN agent_profiles p ON p.agent_id = a.id
        WHERE a.id = ${agentId}
          AND (p.agent_id IS NULL
               OR p.deleted_at IS NULL
               OR p.owner_user_id = ${userId})
          AND (p.agent_id IS NULL
               OR p.visibility = 'public'
               OR p.owner_user_id = ${userId}
               OR p.owner_user_id IS NULL)
        LIMIT 1`,
  )) as Array<Record<string, unknown>>;
  return rows.length > 0;
}

// ============================================================================
// Schreiben (additiv: die Liste wird gelesen, geaendert, zurueckgeschrieben)
// ============================================================================

async function writeCompaniesRow(
  database: Database,
  row: { key: string; list: RawCompany[]; storedAsText: boolean },
): Promise<void> {
  // Die Spalte haelt je nach Schreibweg JSON-Text oder ein Array. Die Form
  // bleibt erhalten, damit der Browser (workspace-sync.ts) denselben Wert
  // wiedererkennt.
  const stored = row.storedAsText ? JSON.stringify(row.list) : row.list;
  await database.execute(
    sql`UPDATE connect_workspace_kv
        SET value = ${JSON.stringify(stored)}::jsonb, updated_at = now()
        WHERE key = ${row.key}`,
  );
}

/**
 * Eine Firma im Workspace aendern. Der Callback bekommt die Roh-Liste und
 * liefert sie (veraendert) zurueck. Unbekannte Felder bleiben erhalten.
 */
async function updateWorkspaceCompanies(
  database: Database,
  userId: string,
  mutate: (list: RawCompany[]) => RawCompany[] | null,
): Promise<{ changed: boolean; list: RawCompany[] }> {
  const row = await readRawCompanies(database, userId);
  if (!row) return { changed: false, list: [] };

  const next = mutate(row.list);
  if (!next) return { changed: false, list: row.list };

  await writeCompaniesRow(database, { ...row, list: next });
  return { changed: true, list: next };
}

/**
 * Einen Agenten der Firma zuordnen. Idempotent: ein Agent, der schon im
 * Roster steht, aendert nichts.
 *
 * Wie in der App (`moveAgentToCompany`) gehoert ein Agent zu genau einer
 * Firma: aus den anderen Firmen dieses Nutzers wird er entfernt.
 */
export async function assignAgentToCompany(
  database: Database,
  userId: string,
  companyReference: string,
  agentId: string,
): Promise<{ company: WorkspaceCompany; alreadyAssigned: boolean } | null> {
  const target = await findWorkspaceCompany(database, userId, companyReference);
  if (!target) return null;
  if (target.agentIds.includes(agentId)) {
    return { company: target, alreadyAssigned: true };
  }

  let result: WorkspaceCompany | null = null;
  await updateWorkspaceCompanies(database, userId, (list) =>
    list.map((raw) => {
      if (raw.id === target.id) {
        const merged = {
          ...raw,
          agentIds: [...rawAgentIds(raw), agentId],
        };
        result = toWorkspaceCompany(merged);
        return merged;
      }
      if (rawAgentIds(raw).includes(agentId)) {
        // Aus anderen Firmen entfernen (ein Agent gehoert zu genau einer).
        return {
          ...raw,
          agentIds: rawAgentIds(raw).filter((a) => a !== agentId),
        };
      }
      return raw;
    }),
  );

  const final = result ?? target;
  return { company: final, alreadyAssigned: false };
}

/**
 * Einen Agenten aus der Firma entfernen. Idempotent: ist der Agent nicht
 * zugeordnet, passiert nichts (kein Fehler).
 */
export async function unassignAgentFromCompany(
  database: Database,
  userId: string,
  companyReference: string,
  agentId: string,
): Promise<{ company: WorkspaceCompany; wasAssigned: boolean } | null> {
  const target = await findWorkspaceCompany(database, userId, companyReference);
  if (!target) return null;
  if (!target.agentIds.includes(agentId)) {
    return { company: target, wasAssigned: false };
  }

  let result: WorkspaceCompany | null = null;
  await updateWorkspaceCompanies(database, userId, (list) =>
    list.map((raw) => {
      if (raw.id !== target.id) return raw;
      const merged = {
        ...raw,
        agentIds: rawAgentIds(raw).filter((a) => a !== agentId),
      };
      result = toWorkspaceCompany(merged);
      return merged;
    }),
  );

  const final = result ?? target;
  return { company: final, wasAssigned: true };
}

/**
 * Eine eigene Firma umbenennen. Der Name darf nicht leer sein und darf
 * nicht schon einer anderen Firma dieses Nutzers gehoeren.
 */
export async function renameWorkspaceCompany(
  database: Database,
  userId: string,
  companyReference: string,
  newName: string,
): Promise<
  | { ok: true; company: WorkspaceCompany }
  | { ok: false; reason: "not_found" | "empty_name" | "duplicate" }
> {
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, reason: "empty_name" };

  const target = await findWorkspaceCompany(database, userId, companyReference);
  if (!target) return { ok: false, reason: "not_found" };

  const companies = await listWorkspaceCompanies(database, userId);
  const clash = companies.find(
    (c) =>
      c.id !== target.id && c.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) return { ok: false, reason: "duplicate" };

  let renamed: WorkspaceCompany | null = null;
  await updateWorkspaceCompanies(database, userId, (list) =>
    list.map((raw) => {
      if (raw.id !== target.id) return raw;
      const next = { ...raw, name: trimmed };
      renamed = toWorkspaceCompany(next);
      return next;
    }),
  );

  return { ok: true, company: renamed ?? { ...target, name: trimmed } };
}
