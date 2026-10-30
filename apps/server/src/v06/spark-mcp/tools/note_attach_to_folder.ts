import { z } from "zod";
import type { Database } from "../../../db/client";
import { checkCompanyAccess } from "../auth";
import { logSparkMcpCall } from "../audit";
import { getSparkMcpStore, SparkMcpStore } from "../store";
import type { AgentAuthContext, McpToolCallResult } from "../types";

export const NoteAttachToFolderInputSchema = z.object({
  folderId: z.string().min(1, "folderId ist erforderlich"),
  noteId: z.string().min(1, "noteId ist erforderlich"),
  setAsInstruction: z
    .boolean()
    .default(true)
    .optional()
    .describe("Setzt diese Notiz als primaere Arbeitsanweisung fuer die Links im Ordner"),
  companyId: z.string().optional(),
});

export type NoteAttachToFolderInput = z.infer<typeof NoteAttachToFolderInputSchema>;

export const noteAttachToFolderTool = {
  name: "note_attach_to_folder" as const,
  description:
    "DE: Ordnet eine bestehende Notiz einem Browser-Ordner zu und setzt sie optional als Haupt-Arbeitsanweisung. / EN: Attaches an existing note to a browser folder, optionally setting it as the main instruction.",
  inputSchema: {
    type: "object",
    properties: {
      folderId: { type: "string", description: "ID des Zielordners" },
      noteId: { type: "string", description: "ID der zuzuordnenden Notiz" },
      setAsInstruction: {
        type: "boolean",
        default: true,
        description: "Als primäre Arbeitsanweisung für den Ordner hinterlegen",
      },
      companyId: { type: "string", description: "Optional: Zielunternehmen" },
    },
    required: ["folderId", "noteId"],
  },
  handler: async (
    rawArgs: unknown,
    context: { agent: AgentAuthContext; database?: Database; store?: SparkMcpStore },
  ): Promise<McpToolCallResult> => {
    const store = context.store || getSparkMcpStore(context.database);
    const parsed = NoteAttachToFolderInputSchema.safeParse(rawArgs);

    if (!parsed.success) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_attach_to_folder",
        params: (rawArgs as Record<string, unknown>) || {},
        status: "error",
        detail: parsed.error.message,
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Validierungsfehler: ${parsed.error.message}` }],
      };
    }

    const { folderId, noteId, setAsInstruction, companyId } = parsed.data;
    const targetCompanyId = companyId || context.agent.companyId;

    if (!checkCompanyAccess(context.agent, targetCompanyId)) {
      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_attach_to_folder",
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
      const note = await store.attachNoteToFolder({
        folderId,
        noteId,
        setAsInstruction: setAsInstruction ?? true,
      });

      await logSparkMcpCall(context.database, {
        agentId: context.agent.agentId,
        agentName: context.agent.agentName,
        toolName: "note_attach_to_folder",
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
                attached: true,
                folderId,
                noteId,
                setAsInstruction: setAsInstruction ?? true,
                note,
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
        toolName: "note_attach_to_folder",
        params: parsed.data as Record<string, unknown>,
        status: "error",
        detail: err?.message || String(err),
      });
      return {
        isError: true,
        content: [{ type: "text", text: `Fehler beim Zuordnen der Notiz zum Ordner: ${err?.message || String(err)}` }],
      };
    }
  },
};

export default noteAttachToFolderTool;
