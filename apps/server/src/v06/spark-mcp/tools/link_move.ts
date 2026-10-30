import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const LinkMoveInputSchema = z.object({
  linkId: z.string().min(1, "linkId ist erforderlich"),
  targetFolderId: z.string().min(1, "targetFolderId ist erforderlich"),
  companyId: z.string().optional(),
});

export type LinkMoveInput = z.infer<typeof LinkMoveInputSchema>;

export const linkMoveTool = {
  name: "link_move" as const,
  description:
    "DE: Verschiebt einen Link von seinem aktuellen Ordner in einen anderen Zielordner. / EN: Moves a link from its current folder to another target folder.",
  inputSchema: {
    type: "object",
    properties: {
      linkId: { type: "string", description: "ID des zu verschiebenden Links" },
      targetFolderId: { type: "string", description: "ID des Zielordners" },
      companyId: { type: "string", description: "Optional: Zielunternehmen" },
    },
    required: ["linkId", "targetFolderId"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = LinkMoveInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "link_move",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { linkId, targetFolderId, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "link_move",
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
      const link = await store.moveLink(linkId, targetFolderId);

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "link_move",
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
        toolName: "link_move",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Verschieben des Links: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default linkMoveTool;
