import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const NoteCreateInputSchema = z.object({
  title: z.string().min(1, "Titel darf nicht leer sein"),
  content: z.string().default(""),
  folderId: z
    .string()
    .nullable()
    .optional()
    .describe("Optional: Ordner-ID, an die die Notiz direkt angehaengt wird"),
  noteId: z
    .string()
    .optional()
    .describe("Optional: Spezifische Notiz-ID (Standard: automatisch generiert)"),
  companyId: z.string().optional(),
});

export type NoteCreateInput = z.infer<typeof NoteCreateInputSchema>;

export const noteCreateTool = {
  name: "note_create" as const,
  description:
    "DE: Erstellt eine neue Spark-Notiz, optional direkt einem Browser-Ordner zugeordnet. / EN: Creates a new Spark note, optionally attached directly to a browser folder.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Titel der Notiz" },
      content: { type: "string", default: "", description: "Textinhalt oder Markdown der Notiz" },
      folderId: {
        type: ["string", "null"],
        description: "Optional: Ordner-ID, an die die Notiz angehängt werden soll",
      },
      noteId: { type: "string", description: "Optional: Benutzerdefinierte ID für die Notiz" },
      companyId: { type: "string", description: "Optional: Zielunternehmen" },
    },
    required: ["title"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = NoteCreateInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_create",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { title, content, folderId, noteId, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_create",
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
      const note = await store.createNote({
        title,
        content,
        folderId: folderId ?? null,
        companyId: targetCompanyId,
        noteId,
      });

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_create",
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
        toolName: "note_create",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Erstellen der Notiz: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default noteCreateTool;
