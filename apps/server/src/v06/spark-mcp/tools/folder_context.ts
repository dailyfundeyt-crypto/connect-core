import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult, FolderContext } from "../types";

export const FolderContextInputSchema = z.object({
  folderId: z.string().min(1, "folderId ist erforderlich"),
  companyId: z.string().optional(),
});

export type FolderContextInput = z.infer<typeof FolderContextInputSchema>;

export const folderContextTool = {
  name: "folder_context" as const,
  description:
    "DE: Liefert Links und Notizen eines Ordners. Regel: Notiz(en) im selben Ordner wie Links werden als 'instructions' (Arbeitsanweisungen fuer diese Links) zusammengefasst. / EN: Returns links and notes of a folder. Notes in the same folder serve as work instructions for the links.",
  inputSchema: {
    type: "object",
    properties: {
      folderId: { type: "string", description: "ID des Ordners" },
      companyId: { type: "string", description: "Optional: Zielunternehmen" },
    },
    required: ["folderId"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = FolderContextInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_context",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { folderId, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_context",
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
      const folderContext: FolderContext = await store.getFolderContext(folderId);

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_context",
        params: parsed.data as Record<string, unknown>,
        status: "success",
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                context: folderContext,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err: any) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_context",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Abrufen des Ordner-Kontexts: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default folderContextTool;
