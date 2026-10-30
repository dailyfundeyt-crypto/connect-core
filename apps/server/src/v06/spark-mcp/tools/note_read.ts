import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const NoteReadInputSchema = z.object({
  noteId: z.string().min(1, "noteId ist erforderlich"),
  includeTrashed: z
    .boolean()
    .default(false)
    .optional()
    .describe("true liefert auch Notizen aus dem Papierkorb zurueck"),
  companyId: z.string().optional(),
});

export type NoteReadInput = z.infer<typeof NoteReadInputSchema>;

export const noteReadTool = {
  name: "note_read" as const,
  description:
    "DE: Liest den Inhalt und die Metadaten einer Spark-Notiz anhand ihrer noteId. / EN: Reads the content and metadata of a Spark note by noteId.",
  inputSchema: {
    type: "object",
    properties: {
      noteId: { type: "string", description: "ID der zu lesenden Notiz" },
      includeTrashed: {
        type: "boolean",
        default: false,
        description: "Auch im Papierkorb liegende Notizen einbeziehen",
      },
      companyId: { type: "string", description: "Optional: Zielunternehmen" },
    },
    required: ["noteId"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = NoteReadInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_read",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { noteId, includeTrashed, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_read",
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
      const note = await store.readNote(noteId, includeTrashed);

      if (!note) {
        await logSparkMcpCall(context.database, {
          agentId: context.agent.agentId,
          agentName: context.agent.agentName,
          toolName: "note_read",
          params: parsed.data as Record<string, unknown>,
          status: "error",
          detail: `Notiz mit ID "${noteId}" nicht gefunden oder im Papierkorb`,
        });
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Notiz mit ID "${noteId}" nicht gefunden (oder befindet sich im Papierkorb).`,
            },
          ],
        };
      }

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_read",
        params: parsed.data as Record<string, unknown>,
        status: "success",
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, note }, null, 2) }],
      };
    } catch (err: any) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_read",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Lesen der Notiz: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default noteReadTool;
