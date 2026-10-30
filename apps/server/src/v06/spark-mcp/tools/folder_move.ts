import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const FolderMoveInputSchema = z.object({
  folderId: z.string().min(1, "folderId ist erforderlich"),
  targetParentId: z
    .string()
    .nullable()
    .describe("ID des Ziel-Elternordners oder null fuer die oberste Ebene"),
  companyId: z.string().optional(),
});

export type FolderMoveInput = z.infer<typeof FolderMoveInputSchema>;

export const folderMoveTool = {
  name: "folder_move" as const,
  description:
    "DE: Verschiebt einen Browser-Ordner unter einen neuen Elternordner oder auf die Hauptebene (verhindert Zyklen). / EN: Moves a folder to a new parent folder or root (cycle-protected).",
  inputSchema: {
    type: "object",
    properties: {
      folderId: { type: "string", description: "ID des zu verschiebenden Ordners" },
      targetParentId: {
        type: ["string", "null"],
        description: "Ziel-Elternordner (null für Hauptebene)",
      },
      companyId: { type: "string", description: "Optional: Zielunternehmen" },
    },
    required: ["folderId", "targetParentId"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = FolderMoveInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_move",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { folderId, targetParentId, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_move",
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
      const folder = await store.moveFolder(folderId, targetParentId);

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_move",
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
        toolName: "folder_move",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Verschieben des Ordners: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default folderMoveTool;
