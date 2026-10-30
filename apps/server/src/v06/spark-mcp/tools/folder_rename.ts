import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const FolderRenameInputSchema = z.object({
  folderId: z.string().min(1, "folderId ist erforderlich"),
  name: z.string().min(1, "Neuer Name darf nicht leer sein"),
  companyId: z.string().optional(),
});

export type FolderRenameInput = z.infer<typeof FolderRenameInputSchema>;

export const folderRenameTool = {
  name: "folder_rename" as const,
  description:
    "DE: Benennt einen bestehenden Browser-Ordner um. / EN: Renames an existing browser folder.",
  inputSchema: {
    type: "object",
    properties: {
      folderId: { type: "string", description: "ID des umzubenennenden Ordners" },
      name: { type: "string", description: "Neuer Name des Ordners" },
      companyId: { type: "string", description: "Optional: Zielunternehmen zur Zugriffskontrolle" },
    },
    required: ["folderId", "name"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = FolderRenameInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_rename",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { folderId, name, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_rename",
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
      const folder = await store.renameFolder(folderId, name);

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_rename",
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
        toolName: "folder_rename",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Umbenennen: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default folderRenameTool;
