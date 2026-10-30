import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const FolderCreateInputSchema = z.object({
  name: z.string().min(1, "Name darf nicht leer sein"),
  parentId: z.string().nullable().optional(),
  kind: z.enum(["normal", "settings"]).default("normal").optional(),
  companyId: z.string().optional(),
  instructionNoteId: z.string().nullable().optional(),
});

export type FolderCreateInput = z.infer<typeof FolderCreateInputSchema>;

export const folderCreateTool = {
  name: "folder_create" as const,
  description:
    "DE: Erstellt einen neuen Browser-Ordner für Recherche, Bookmarks oder Workspaces. / EN: Creates a new browser folder for bookmarks, research, or workspaces.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name des Ordners" },
      parentId: { type: ["string", "null"], description: "Optional: ID des Elternordners" },
      kind: {
        type: "string",
        enum: ["normal", "settings"],
        default: "normal",
        description: "'normal' fuer Browser-Ordner oder 'settings' fuer Einstellungs-Ordner",
      },
      companyId: { type: "string", description: "Optional: Zielunternehmen (Standard: Firmenkontext des Agenten)" },
      instructionNoteId: { type: ["string", "null"], description: "Optional: ID der Instruktionsnotiz" },
    },
    required: ["name"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = FolderCreateInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_create",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { name, parentId, kind, companyId, instructionNoteId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_create",
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
      const folder = await store.createFolder({
        name,
        parentId: parentId ?? null,
        kind: kind ?? "normal",
        companyId: targetCompanyId,
        instructionNoteId: instructionNoteId ?? null,
      });

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_create",
        params: parsed.data as Record<string, unknown>,
        status: "success",
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, folder }, null, 2) }],
      };
    } catch (err: any) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_create",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Erstellen des Ordners: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default folderCreateTool;
