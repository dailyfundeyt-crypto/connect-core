import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const NoteUpdateInputSchema = z.object({
  noteId: z.string().min(1, "noteId ist erforderlich"),
  title: z.string().min(1, "Titel darf nicht leer sein").optional(),
  content: z.string().optional(),
  folderId: z
    .string()
    .nullable()
    .optional()
    .describe("Optional: Neuen Ordner zuweisen oder null fuer lose Notiz"),
  companyId: z.string().optional(),
});

export type NoteUpdateInput = z.infer<typeof NoteUpdateInputSchema>;

export const noteUpdateTool = {
  name: "note_update" as const,
  description:
    "DE: Aktualisiert den Titel, Inhalt oder die Ordnerzuordnung einer bestehenden Spark-Notiz. / EN: Updates title, content, or folder association of an existing Spark note.",
  inputSchema: {
    type: "object",
    properties: {
      noteId: { type: "string", description: "ID der zu aktualisierenden Notiz" },
      title: { type: "string", description: "Neuer Titel der Notiz" },
      content: { type: "string", description: "Neuer Inhalt oder Markdown der Notiz" },
      folderId: {
        type: ["string", "null"],
        description: "Neuer Ordner (oder null für Allgemein)",
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
    const parsed = NoteUpdateInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_update",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { noteId, title, content, folderId, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_update",
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
      const updated = await store.updateNote(noteId, {
        title,
        content,
        folderId,
      });

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_update",
        params: parsed.data as Record<string, unknown>,
        status: "success",
      });

      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, note: updated }, null, 2) }],
      };
    } catch (err: any) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_update",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Aktualisieren der Notiz: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default noteUpdateTool;
