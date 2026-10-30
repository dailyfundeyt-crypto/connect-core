import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const NoteTrashInputSchema = z.object({
  noteId: z.string().min(1, "noteId ist erforderlich"),
  companyId: z.string().optional(),
});

export type NoteTrashInput = z.infer<typeof NoteTrashInputSchema>;

export const noteTrashTool = {
  name: "note_trash" as const,
  description:
    "DE: Verschiebt eine Spark-Notiz in den Papierkorb (Soft-Delete). Die Notiz wird NIEMALS hart gelöscht, sondern bleibt archiviert und wiederherstellbar. / EN: Moves a Spark note to the trash (soft-delete). The note is never hard-deleted and remains archived.",
  inputSchema: {
    type: "object",
    properties: {
      noteId: { type: "string", description: "ID der in den Papierkorb zu verschiebenden Notiz" },
      companyId: { type: "string", description: "Optional: Zielunternehmen" },
    },
    required: ["noteId"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = NoteTrashInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_trash",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { noteId, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_trash",
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
      const result = await store.trashNote(noteId);

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_trash",
        params: parsed.data as Record<string, unknown>,
        status: "success",
        detail: `Notiz "${noteId}" erfolgreich in den Papierkorb verschoben (soft-delete).`,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                trashed: true,
                hardDeleted: false,
                noteId: result.note.id,
                trashedAt: result.note.trashedAt,
                message: "Notiz wurde in den Papierkorb verschoben (kein harter Datenverlust).",
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
        toolName: "note_trash",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Verschieben in den Papierkorb: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default noteTrashTool;
