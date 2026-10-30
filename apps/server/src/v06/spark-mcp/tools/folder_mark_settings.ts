import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const FolderMarkSettingsInputSchema = z.object({
  folderId: z.string().min(1, "folderId ist erforderlich"),
  isSettings: z
    .boolean()
    .optional()
    .describe("true markiert als Einstellungs-Ordner, false als normaler Browser-Ordner"),
  kind: z
    .enum(["normal", "settings"])
    .optional()
    .describe("Alternativ direkte Angabe von 'normal' oder 'settings'"),
  companyId: z.string().optional(),
});

export type FolderMarkSettingsInput = z.infer<typeof FolderMarkSettingsInputSchema>;

export const folderMarkSettingsTool = {
  name: "folder_mark_settings" as const,
  description:
    "DE: Markiert einen Ordner als 'settings' (erscheint in den Einstellungen) oder als 'normal' (erscheint im Browser). / EN: Marks a folder as 'settings' (appears in settings) or 'normal' (appears in browser).",
  inputSchema: {
    type: "object",
    properties: {
      folderId: { type: "string", description: "ID des Ordners" },
      isSettings: {
        type: "boolean",
        description: "true fuer Einstellungen-Ordner, false fuer normalen Browser-Ordner",
      },
      kind: {
        type: "string",
        enum: ["normal", "settings"],
        description: "Expliziter Typ ('normal' oder 'settings')",
      },
      companyId: { type: "string", description: "Optional: Zielunternehmen" },
    },
    required: ["folderId"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = FolderMarkSettingsInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_mark_settings",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { folderId, isSettings, kind, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_mark_settings",
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
      const folder = await store.markSettings(folderId, isSettings, kind);

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "folder_mark_settings",
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
                folderId: folder.id,
                kind: folder.kind,
                isSettings: folder.kind === "settings",
                folder,
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
        toolName: "folder_mark_settings",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Setzen des Einstellungs-Flags: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default folderMarkSettingsTool;
