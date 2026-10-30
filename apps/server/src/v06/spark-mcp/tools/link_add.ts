import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const LinkAddInputSchema = z.object({
  folderId: z.string().min(1, "folderId ist erforderlich"),
  url: z.string().url("Muss eine gueltige URL sein (z.B. https://example.com)"),
  title: z.string().min(1, "Titel darf nicht leer sein"),
  noteId: z.string().nullable().optional(),
  companyId: z.string().optional(),
});

export type LinkAddInput = z.infer<typeof LinkAddInputSchema>;

export const linkAddTool = {
  name: "link_add" as const,
  description:
    "DE: Fügt einen URL-Link zu einem Browser-Ordner hinzu, optional mit zugehöriger Notiz-ID. / EN: Adds a URL link to a browser folder, optionally with an associated note ID.",
  inputSchema: {
    type: "object",
    properties: {
      folderId: { type: "string", description: "Zielordner-ID" },
      url: { type: "string", description: "Gültige URL (http/https)" },
      title: { type: "string", description: "Titel oder Name des Links" },
      noteId: {
        type: ["string", "null"],
        description: "Optional: Notiz-ID, die Instruktionen für diesen Link enthält",
      },
      companyId: { type: "string", description: "Optional: Zielunternehmen" },
    },
    required: ["folderId", "url", "title"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = LinkAddInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "link_add",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { folderId, url, title, noteId, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "link_add",
        params: parsed.data as Record<string, unknown>,
        status: "denied",
        detail: `Agent ${context.agent.agentName} hat keinen Zugriff auf Firma "${targetCompanyId}"`,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `403 Forbidden: Kein Zugriff auf Firma "${targetCompanyId}".` }],
      };
    }

    try {
      const link = await store.addLink({
        folderId,
        url,
        title,
        noteId: noteId ?? null,
      });

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "link_add",
        params: parsed.data as Record<string, unknown>,
        status: "success",
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, link }, null, 2) }],
      };
    } catch (err: any) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "link_add",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Hinzufügen des Links: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default linkAddTool;
