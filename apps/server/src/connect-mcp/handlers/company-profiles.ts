/**
 * Connect-MCP-Tools fuer Firmen (Grok-Bot-Agenten) und ihre Agenten-Roster.
 *
 *   - company_profiles.list           (readOnly): alle Firmen des Nutzers + Zuordnungen
 *   - company_profiles.assign         (schreibend): Firma ↔ externer Agent (Upsert)
 *   - company_profiles.rename         (schreibend): eigene Firma umbenennen
 *   - companies.list                  (readOnly): Alias zu company_profiles.list
 *   - companies.agents                (readOnly): nur Agenten einer Firma
 *   - companies.assign_agent          (schreibend): Agent → Firma (idempotent)
 *   - companies.unassign_agent        (schreibend): Agent aus Firma entfernen (idempotent)
 *
 * DIE QUELLE
 *
 * Alle Firmen kommen aus `connect_workspace_kv` unter `u:<userId>:connect.companies.custom`
 * (siehe `companies.ts`). `connect_social_profiles` wird nur noch genutzt, um
 * Alt-Zuordnungen weiterhin der richtigen Firma zuzuordnen.
 *
 * Sicherheit:
 *  - Nur der Nutzer, dem das Token gehoert, sieht/seine Zuordnungen.
 *  - `assign` prueft, dass die Zielfirma diesem Nutzer gehoert.
 *  - Ein Read-Token darf lesen, aber nicht schreiben — das Gate sitzt im Router
 *    (`isReadOnlyTool`), die Schreibtools tragen bewusst keine readOnly-Markierung.
 */

import type { McpToolDef } from "../router";
import {
  assignAgentToCompany,
  findWorkspaceCompany,
  isAgentAccessible,
  listWorkspaceCompanies,
  loadAgentsByIds,
  renameWorkspaceCompany,
  unassignAgentFromCompany,
  type CompanySummary,
  type WorkspaceCompany,
} from "../companies";
import {
  listCompanyProfileAssignments,
  mapSocialProfileIdsToCompanies,
  resolveProfileOwnerId,
  upsertCompanyProfileAssignment,
  type ProfileQuery,
} from "../company-profiles";
import type { Database } from "../../db/client";

export type CompanyProfileToolDeps = {
  /** Lokale Connect-DB (Zuordnungen + Workspace-KV). */
  database?: Database;
  /** Social-/Supabase-Zugang. Nur lokal in der App verfuegbar. */
  query?: ProfileQuery | null;
};

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Eindeutiger Besitzer-ID fuer den Zugriff. */
async function ownerIdOf(
  query: ProfileQuery,
  actorId: string,
  actorEmail?: string | null,
): Promise<string> {
  return resolveProfileOwnerId(query, actorId, actorEmail ?? null);
}

type CompanyListPayload = {
  owner_user_id: string;
  companies: CompanySummary[];
  assignments: Array<{
    company_id: string | null;
    profile_id: string;
    external_agent_id: string;
    external_agent_name: string | null;
  }>;
};

/**
 * Die Firmen des Nutzers mit Agentenanzahl und Zuordnungen. Das ist die
 * gemeinsame Basis fuer `company_profiles.list` und `companies.list` — es gibt
 * bewusst keine zweite Quelle.
 */
async function buildCompanyList(
  deps: CompanyProfileToolDeps,
  actorId: string,
  actorEmail?: string | null,
): Promise<CompanyListPayload> {
  if (!deps.database) {
    throw new Error("Keine Datenbank verfuegbar — Firmen sind nicht abrufbar.");
  }
  const database = deps.database;
  const companies = await listWorkspaceCompanies(database, actorId);

  const owner = deps.query
    ? await ownerIdOf(deps.query, actorId, actorEmail ?? null)
    : actorId;

  const assignments = await listCompanyProfileAssignments(database, actorId);
  const byCompany = new Map<string, number>();
  for (const assignment of assignments) {
    const companyId = assignment.companyId;
    if (!companyId) continue;
    byCompany.set(companyId, (byCompany.get(companyId) ?? 0) + 1);
  }

  return {
    owner_user_id: owner,
    companies: companies.map((company) => ({
      id: company.id,
      name: company.name,
      description: company.description,
      handle: company.handle,
      agent_count: company.agentIds.length,
      assigned_external_agent_count: byCompany.get(company.id) ?? 0,
    })),
    assignments: assignments.map((assignment) => ({
      company_id: assignment.companyId,
      profile_id: assignment.profileId,
      external_agent_id: assignment.externalAgentId,
      external_agent_name: assignment.externalAgentName,
    })),
  };
}

export function buildCompanyProfileTools(deps: CompanyProfileToolDeps): McpToolDef[] {
  const list: McpToolDef = {
    name: "company_profiles.list",
    description:
      "Listet die Firmen des eingeloggten Nutzers aus der echten Firmenquelle " +
      "(Workspace des Nutzers) mit Name, ID, Handle, Anzahl zugeordneter Agenten " +
      "und den aktuellen Zuordnungen zu externen Agenten (Grok Bot).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnly: true, readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (_args, ctx) => {
      try {
        const payload = await buildCompanyList(deps, ctx.actorId, ctx.actorEmail);
        return text(JSON.stringify(payload, null, 2));
      } catch (error) {
        return errorResult(
          `Firmen konnten nicht geladen werden: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };

  const assign: McpToolDef = {
    name: "company_profiles.assign",
    description:
      "Ordnet einer eigenen Firma einen externen Agenten (Grok Bot) zu (Upsert). " +
      "Parameter: profile (ID oder Name der Firma), external_agent_id, optional external_agent_name.",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", description: "ID oder Name der Firma" },
        external_agent_id: { type: "string", description: "ID des externen Agenten (Grok Bot)" },
        external_agent_name: {
          type: "string",
          description: "Optionaler Anzeigename des externen Agenten",
        },
      },
      required: ["profile", "external_agent_id"],
      additionalProperties: false,
    },
    // Bewusst KEINE readOnly-Markierung: ein Read-Token wird vom Router mit -32003 abgewiesen.
    annotations: { readOnly: false, readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: async (args, ctx) => {
      if (!deps.database) {
        return errorResult("Keine Datenbank verfuegbar — Zuordnung nicht moeglich.");
      }
      const profile = typeof args.profile === "string" ? args.profile.trim() : "";
      const externalAgentId =
        typeof args.external_agent_id === "string" ? args.external_agent_id.trim() : "";
      const externalAgentName =
        typeof args.external_agent_name === "string" && args.external_agent_name.trim()
          ? args.external_agent_name.trim()
          : null;
      if (!profile) return errorResult("Parameter \"profile\" fehlt (ID oder Name der Firma).");
      if (!externalAgentId) return errorResult("Parameter \"external_agent_id\" fehlt.");

      const company = await findWorkspaceCompany(deps.database, ctx.actorId, profile);
      if (!company) {
        return errorResult(
          `Firma "${profile}" wurde nicht gefunden oder gehoert nicht dir. Es sind nur eigene Firmen zuordenbar.`,
        );
      }

      // Die Social-Profil-ID wird nur gesetzt, wenn die Firma dort veroeffentlicht
      // ist. Sonst traegt `profile_id` die Firmen-ID selbst (additive Spalte
      // `company_id` traegt in jedem Fall die Firmen-ID).
      let profileId = company.id;
      if (deps.query) {
        const owner = await ownerIdOf(deps.query, ctx.actorId, ctx.actorEmail ?? null);
        const socialIds = await mapSocialProfileIdsToCompanies(deps.query, owner, [company]);
        profileId = socialIds.get(company.id) ?? company.id;
      }

      const saved = await upsertCompanyProfileAssignment(deps.database, {
        userId: ctx.actorId,
        profileId,
        companyId: company.id,
        externalAgentId,
        externalAgentName,
      });
      return text(
        JSON.stringify(
          {
            ok: true,
            company_id: saved.companyId,
            profile_id: saved.profileId,
            company_name: company.name,
            external_agent_id: saved.externalAgentId,
            external_agent_name: saved.externalAgentName,
          },
          null,
          2,
        ),
      );
    },
  };

  const rename: McpToolDef = {
    name: "company_profiles.rename",
    description:
      "Benennt eine eigene Firma um. Der neue Name darf nicht leer sein und darf " +
      "nicht bereits von einer anderen eigenen Firma belegt werden. " +
      "Parameter: profile (ID oder Name der Firma), new_name.",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", description: "ID oder Name der Firma" },
        new_name: { type: "string", description: "Neuer Name der Firma" },
      },
      required: ["profile", "new_name"],
      additionalProperties: false,
    },
    annotations: { readOnly: false, readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: async (args, ctx) => {
      if (!deps.database) {
        return errorResult("Keine Datenbank verfuegbar — Umbenennung nicht moeglich.");
      }
      const profile = typeof args.profile === "string" ? args.profile.trim() : "";
      const newName = typeof args.new_name === "string" ? args.new_name : "";
      if (!profile) return errorResult("Parameter \"profile\" fehlt (ID oder Name der Firma).");

      const result = await renameWorkspaceCompany(deps.database, ctx.actorId, profile, newName);
      if (!result.ok) {
        if (result.reason === "empty_name") {
          return errorResult("Der neue Name darf nicht leer sein.");
        }
        if (result.reason === "duplicate") {
          return errorResult(
            `Der Name "${newName.trim()}" ist bereits von einer anderen deiner Firmen belegt.`,
          );
        }
        return errorResult(
          `Firma "${profile}" wurde nicht gefunden oder gehoert nicht dir. Es sind nur eigene Firmen umbenennbar.`,
        );
      }
      return text(
        JSON.stringify(
          {
            ok: true,
            company_id: result.company.id,
            previous_name: profile,
            new_name: result.company.name,
          },
          null,
          2,
        ),
      );
    },
  };

  // --------------------------------------------------------------------------
  // companies.* — gleiche Quelle, andere Sicht (Agenten-Roster)
  // --------------------------------------------------------------------------

  const companiesList: McpToolDef = {
    name: "companies.list",
    description:
      "Listet die Firmen des eingeloggten Nutzers mit der Anzahl zugeordneter Agenten. " +
      "Alias von company_profiles.list (gleiche Quelle, keine Doppelhaltung).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnly: true, readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (_args, ctx) => {
      try {
        const payload = await buildCompanyList(deps, ctx.actorId, ctx.actorEmail);
        return text(
          JSON.stringify(
            {
              owner_user_id: payload.owner_user_id,
              count: payload.companies.length,
              companies: payload.companies,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        return errorResult(
          `Firmen konnten nicht geladen werden: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };

  const companiesAgents: McpToolDef = {
    name: "companies.agents",
    description:
      "Listet nur die Agenten, die einer bestimmten Firma zugeordnet sind. " +
      "Parameter: company (ID oder Name der Firma).",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "ID oder Name der Firma" },
      },
      required: ["company"],
      additionalProperties: false,
    },
    annotations: { readOnly: true, readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args, ctx) => {
      if (!deps.database) {
        return errorResult("Keine Datenbank verfuegbar — Agenten sind nicht abrufbar.");
      }
      const reference = typeof args.company === "string" ? args.company.trim() : "";
      if (!reference) return errorResult("Parameter \"company\" fehlt (ID oder Name der Firma).");

      const company = await findWorkspaceCompany(deps.database, ctx.actorId, reference);
      if (!company) {
        return errorResult(
          `Firma "${reference}" wurde nicht gefunden oder gehoert nicht dir.`,
        );
      }
      const rows = await loadAgentsByIds(deps.database, company.agentIds);
      const agents = company.agentIds.map((id) => {
        const row = rows.get(id);
        return {
          id,
          name: row?.name ?? null,
          headline: row?.headline ?? null,
          visibility: row?.visibility ?? null,
          exists_in_agents: row !== undefined,
        };
      });
      return text(
        JSON.stringify(
          {
            company_id: company.id,
            company_name: company.name,
            count: agents.length,
            agents,
          },
          null,
          2,
        ),
      );
    },
  };

  const assignAgent: McpToolDef = {
    name: "companies.assign_agent",
    description:
      "Ordnet einen Agenten einer eigenen Firma zu (idempotent). Ein Agent gehoert " +
      "zu genau einer Firma und wird aus anderen Firmen entfernt. " +
      "Parameter: company (ID oder Name), agent_id.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "ID oder Name der Firma" },
        agent_id: { type: "string", description: "ID des Agenten (agents-Tabelle)" },
      },
      required: ["company", "agent_id"],
      additionalProperties: false,
    },
    annotations: { readOnly: false, readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: async (args, ctx) => {
      if (!deps.database) {
        return errorResult("Keine Datenbank verfuegbar — Zuordnung nicht moeglich.");
      }
      const company = typeof args.company === "string" ? args.company.trim() : "";
      const agentId = typeof args.agent_id === "string" ? args.agent_id.trim() : "";
      if (!company) return errorResult("Parameter \"company\" fehlt (ID oder Name der Firma).");
      if (!agentId) return errorResult("Parameter \"agent_id\" fehlt.");

      const target = await findWorkspaceCompany(deps.database, ctx.actorId, company);
      if (!target) {
        return errorResult(`Firma "${company}" wurde nicht gefunden oder gehoert nicht dir.`);
      }
      if (!(await isAgentAccessible(deps.database, ctx.actorId, agentId))) {
        return errorResult(
          `Agent "${agentId}" existiert nicht oder gehoert nicht dir und ist nicht oeffentlich.`,
        );
      }

      const result = await assignAgentToCompany(deps.database, ctx.actorId, company, agentId);
      if (!result) {
        return errorResult(`Firma "${company}" wurde nicht gefunden oder gehoert nicht dir.`);
      }
      return text(
        JSON.stringify(
          {
            ok: true,
            company_id: result.company.id,
            company_name: result.company.name,
            agent_id: agentId,
            already_assigned: result.alreadyAssigned,
            agent_count: result.company.agentIds.length,
          },
          null,
          2,
        ),
      );
    },
  };

  const unassignAgent: McpToolDef = {
    name: "companies.unassign_agent",
    description:
      "Entfernt einen Agenten aus einer eigenen Firma (idempotent: ein nicht " +
      "zugeordneter Agent ist kein Fehler). Parameter: company (ID oder Name), agent_id.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "ID oder Name der Firma" },
        agent_id: { type: "string", description: "ID des Agenten (agents-Tabelle)" },
      },
      required: ["company", "agent_id"],
      additionalProperties: false,
    },
    annotations: { readOnly: false, readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: async (args, ctx) => {
      if (!deps.database) {
        return errorResult("Keine Datenbank verfuegbar — Zuordnung nicht moeglich.");
      }
      const company = typeof args.company === "string" ? args.company.trim() : "";
      const agentId = typeof args.agent_id === "string" ? args.agent_id.trim() : "";
      if (!company) return errorResult("Parameter \"company\" fehlt (ID oder Name der Firma).");
      if (!agentId) return errorResult("Parameter \"agent_id\" fehlt.");

      const target = await findWorkspaceCompany(deps.database, ctx.actorId, company);
      if (!target) {
        return errorResult(`Firma "${company}" wurde nicht gefunden oder gehoert nicht dir.`);
      }

      const result = await unassignAgentFromCompany(deps.database, ctx.actorId, company, agentId);
      if (!result) {
        return errorResult(`Firma "${company}" wurde nicht gefunden oder gehoert nicht dir.`);
      }
      return text(
        JSON.stringify(
          {
            ok: true,
            company_id: result.company.id,
            company_name: result.company.name,
            agent_id: agentId,
            was_assigned: result.wasAssigned,
            agent_count: result.company.agentIds.length,
          },
          null,
          2,
        ),
      );
    },
  };

  return [list, assign, rename, companiesList, companiesAgents, assignAgent, unassignAgent];
}

export type { WorkspaceCompany };
