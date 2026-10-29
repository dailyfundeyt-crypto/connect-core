/**
 * Connect-MCP-Tools für Unternehmensprofile (Grok-Bot-Agenten).
 *
 *   - company_profiles.list   (readOnly): eigene Profile (id, name) + Zuordnungen
 *   - company_profiles.assign (schreibend): Profil ↔ externer Agent (Upsert)
 *
 * Sicherheit:
 *  - Nur der Nutzer, dem das Token gehört, sieht/seine Zuordnungen.
 *  - `assign` prüft, dass das Zielprofil diesem Nutzer gehört.
 *  - Ein Read-Token darf `list`, aber nicht `assign` — das Gate sitzt im Router
 *    (`isReadOnlyTool`), `assign` trägt bewusst keine readOnly-Markierung.
 */

import type { McpToolDef } from "../router";
import {
  findOwnedCompanyProfile,
  listCompanyProfileAssignments,
  listCompanyProfiles,
  resolveProfileOwnerId,
  upsertCompanyProfileAssignment,
  type ProfileQuery,
} from "../company-profiles";
import type { Database } from "../../db/client";

export type CompanyProfileToolDeps = {
  /** Lokale Connect-DB (Zuordnungen). */
  database?: Database;
  /** Social-/Supabase-Zugang (Profile). Nur lokal in der App verfügbar. */
  query?: ProfileQuery | null;
};

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Eindeutiger Besitzer-ID für den Zugriff. */
async function ownerIdOf(
  query: ProfileQuery,
  actorId: string,
  actorEmail?: string | null,
): Promise<string> {
  return resolveProfileOwnerId(query, actorId, actorEmail ?? null);
}

export function buildCompanyProfileTools(deps: CompanyProfileToolDeps): McpToolDef[] {
  const list: McpToolDef = {
    name: "company_profiles.list",
    description:
      "Listet die Unternehmensprofile des eingeloggten Nutzers (nur id und name) sowie die " +
      "aktuellen Zuordnungen zu externen Agenten.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnly: true, readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (_args, ctx) => {
      const query = deps.query;
      if (!query) {
        return errorResult(
          "Unternehmensprofile sind auf diesem Server nicht verfügbar (kein Social-Backend).",
        );
      }
      const owner = await ownerIdOf(query, ctx.actorId, ctx.actorEmail);
      const profiles = await listCompanyProfiles(query, owner);
      const assignments = deps.database
        ? await listCompanyProfileAssignments(deps.database, ctx.actorId)
        : [];
      return text(
        JSON.stringify(
          {
            owner_user_id: owner,
            profiles,
            assignments: assignments.map((a) => ({
              profile_id: a.profileId,
              external_agent_id: a.externalAgentId,
              external_agent_name: a.externalAgentName,
            })),
          },
          null,
          2,
        ),
      );
    },
  };

  const assign: McpToolDef = {
    name: "company_profiles.assign",
    description:
      "Ordnet einem Unternehmensprofil einen externen Agenten zu (Upsert). " +
      "Parameter: profile (ID oder Name), external_agent_id, optional external_agent_name.",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", description: "ID oder Name des Unternehmensprofils" },
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
      const query = deps.query;
      if (!query) {
        return errorResult(
          "Unternehmensprofile sind auf diesem Server nicht verfügbar (kein Social-Backend).",
        );
      }
      if (!deps.database) {
        return errorResult("Keine Datenbank verfügbar — Zuordnung nicht möglich.");
      }
      const profile = typeof args.profile === "string" ? args.profile.trim() : "";
      const externalAgentId =
        typeof args.external_agent_id === "string" ? args.external_agent_id.trim() : "";
      const externalAgentName =
        typeof args.external_agent_name === "string" && args.external_agent_name.trim()
          ? args.external_agent_name.trim()
          : null;
      if (!profile) return errorResult("Parameter \"profile\" fehlt (ID oder Name des Profils).");
      if (!externalAgentId) return errorResult("Parameter \"external_agent_id\" fehlt.");

      const owner = await ownerIdOf(query, ctx.actorId, ctx.actorEmail);
      const owned = await findOwnedCompanyProfile(query, owner, profile);
      if (!owned) {
        return errorResult(
          `Profil "${profile}" wurde nicht gefunden oder gehört nicht dir. Es sind nur eigene Profile zuordenbar.`,
        );
      }

      const saved = await upsertCompanyProfileAssignment(deps.database, {
        userId: ctx.actorId,
        profileId: owned.id,
        externalAgentId,
        externalAgentName,
      });
      return text(
        JSON.stringify(
          {
            ok: true,
            profile_id: saved.profileId,
            profile_name: owned.name,
            external_agent_id: saved.externalAgentId,
            external_agent_name: saved.externalAgentName,
          },
          null,
          2,
        ),
      );
    },
  };

  return [list, assign];
}
