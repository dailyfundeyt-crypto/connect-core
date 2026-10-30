/**
 * Connect-MCP Tools fuer E-Mail-Agenten v06 (A19).
 *
 * Zwei Tools zum Einhaengen in den Connect-MCP (Wiring durch den
 * Integrations-Agenten A22 in der Teilnehmer-Registry):
 * - list_email_agents: Verzeichnis externer E-Mail-Bots (Adresse, Name,
 *   Beschreibung was er tut, Faehigkeiten, Firmen).
 * - request_email: Auftrag an einen Bot. Erzeugt IMMER einen Eintrag mit
 *   status pending_approval. Es wird nichts versendet und der Versand-Adapter
 *   wird nicht angerufen - Freigabe nur durch Stefan (UI /approve).
 *
 * Eigene Tool-Definitionen (keine Annahme ueber die Registry des Connect-MCP),
 * damit A22 sie anhaengen kann, ohne dieses Modul zu beruehren.
 */

import type { Database } from "../../db/client";
import type { McpToolDef } from "../../connect-mcp/router";
import { EmailAgentRepository } from "./repo";
import { Outbox } from "./outbox";
import { createMailSender } from "./sender";

export interface EmailAgentMcpToolOptions {
  database?: Database;
  repo?: EmailAgentRepository;
  outbox?: Outbox;
}

export function buildEmailAgentMcpTools(options: EmailAgentMcpToolOptions = {}): McpToolDef[] {
  const agents =
    options.repo ?? new EmailAgentRepository(options.database);
  const outbox =
    options.outbox ?? new Outbox(agents, createMailSender(), options.database);

  const listTool: McpToolDef = {
    name: "list_email_agents",
    description:
      "Listet das Verzeichnis externer E-Mail-Bots mit Adresse, Name, Beschreibung (was der Bot tut), Faehigkeiten und Firmen.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      readOnly: true,
      idempotentHint: true,
    },
    handler: async () => {
      const list = await agents.listAgents();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              list.map((a) => ({
                id: a.id,
                address: a.address,
                name: a.name,
                description: a.description,
                capabilities: a.capabilities,
                companyIds: a.companyIds,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  };

  const requestTool: McpToolDef = {
    name: "request_email",
    description:
      "Beauftragt einen externen E-Mail-Bot per E-Mail. Erzeugt einen Entwurf mit Status 'pending_approval'; Versand nur nach menschlicher Freigabe durch Stefan. Nie direkt versendet.",
    inputSchema: {
      type: "object",
      properties: {
        requestedByAgentId: {
          type: "string",
          description: "ID des anfragenden Connect-Agenten.",
        },
        to: {
          type: "string",
          description: "E-Mail-Adresse des Bots (muss im Verzeichnis stehen).",
        },
        subject: { type: "string", description: "Betreff der E-Mail." },
        body: { type: "string", description: "Auftrag/Text der E-Mail." },
      },
      required: ["requestedByAgentId", "to", "subject", "body"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      readOnly: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    handler: async (args) => {
      try {
        const email = await outbox.requestEmail({
          requestedByAgentId: String(args.requestedByAgentId ?? ""),
          to: String(args.to ?? ""),
          subject: String(args.subject ?? ""),
          body: String(args.body ?? ""),
        });
        return {
          content: [
            {
              type: "text",
              text: `Auftrag an ${email.to} erfasst (Outbound-ID: ${email.id}). Status: ${email.status}. Der Versand erfolgt erst, nachdem Stefan die E-Mail in der E-Mail-Agenten-Seite freigibt.`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Auftrag abgelehnt: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  };

  return [listTool, requestTool];
}
