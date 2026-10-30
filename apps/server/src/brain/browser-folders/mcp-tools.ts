/**
 * Spark-MCP: Browser-Ordner, Links & Notizen Tools (Lane 3 - Prompts 3.1, 3.2, 3.3).
 *
 * Ermöglicht JEDEM Agenten im Swarm:
 * - Browser-Ordner anlegen, listen, aktualisieren, löschen
 * - Unterordner anlegen, verschieben (ohne Zyklen), zu Einstellungs-Ordnern ('settings') machen
 * - Links hinzufügen und zwischen Ordnern verschieben
 * - Spark-Notizen Ordnern zuordnen, erstellen, lösen und lesen
 * - folder_context: Liefert alle Links mit zugehöriger Notiz-Anweisung
 *   (Regel: "Liegt eine Notiz im selben Ordner wie Links, gehört sie dazu und erklärt, was mit dem Link zu tun ist.")
 *
 * Authentifizierung & Scopes via v2 mcp-grants (Scope: spark:folders:write).
 * Audit-Logging via mcp_audit_log.
 * Tool-Beschreibungen zweisprachig (Deutsch + Englisch).
 */

import type { Database } from "../../db/client";
import type { McpToolDef, McpToolHandler, McpToolResult } from "../../connect-mcp/router";
import { checkGrantScope, recordMcpAuditLog, type McpAuditStatus } from "../../connect-mcp/grants";
import type { McpGrant } from "../../contracts/api";
import { getSparkFoldersStore, SparkFoldersStore } from "./store";

export type SparkMcpDeps = {
  database?: Database;
  store?: SparkFoldersStore;
  grant?: McpGrant | null;
};

function jsonResult(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(message: string): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `Fehler / Error: ${message}` }],
  };
}

/**
 * Validates scope authorization. If a grant is provided, requires 'spark:folders:write'
 * for mutations, or 'spark:folders:read' / 'spark:folders:write' for read queries.
 */
function authorize(grant: McpGrant | null | undefined, requiredScope: string): { allowed: boolean; reason?: string } {
  if (!grant) {
    // If no explicit grant object was passed (e.g. direct system invocation), permit by default
    return { allowed: true };
  }
  return checkGrantScope(grant, requiredScope);
}

export function buildSparkFolderTools(deps: SparkMcpDeps = {}): McpToolDef[] {
  const store = deps.store || getSparkFoldersStore(deps.database);
  const database = deps.database;

  const logCall = async (toolName: string, args: Record<string, unknown>, status: McpAuditStatus, detail?: string) => {
    try {
      await recordMcpAuditLog(database, {
        grantId: deps.grant?.id || null,
        agentName: deps.grant?.agentName || "agent",
        toolName,
        paramsSummary: JSON.stringify(args).slice(0, 500),
        status,
        statusDetail: detail || null,
      });
    } catch {
      // Non-blocking
    }
  };

  const tools: McpToolDef[] = [];

  // =========================================================================
  // 1. spark.folder_create
  // =========================================================================
  tools.push({
    name: "spark.folder_create",
    description: "DE: Erstellt einen neuen Browser-Ordner für Bookmarks, Recherchen oder App-Settings. / EN: Creates a new browser folder for bookmarks, research, or app settings.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "DE: Name des Ordners / EN: Folder name" },
        parentId: { type: ["string", "null"], description: "DE: Optionaler Eltern-Ordner / EN: Optional parent folder ID" },
        kind: { type: "string", enum: ["normal", "settings"], default: "normal", description: "DE: 'normal' oder 'settings' / EN: Folder kind ('normal' or 'settings')" },
        instructionNoteId: { type: ["string", "null"], description: "DE: ID der Notiz, die als Instruktion dient / EN: Instruction note ID" },
        ownerScope: { type: "string", default: "company", description: "DE: Geltungsbereich (company/agent/system) / EN: Owner scope" },
      },
      required: ["name"],
    },
    handler: async (args: any) => {
      const auth = authorize(deps.grant, "spark:folders:write");
      if (!auth.allowed) {
        await logCall("spark.folder_create", args, "denied", auth.reason);
        return errorResult(auth.reason || "403 Forbidden: spark:folders:write scope required");
      }

      try {
        const folder = await store.createFolder({
          name: String(args.name),
          parentId: args.parentId || null,
          kind: args.kind === "settings" ? "settings" : "normal",
          instructionNoteId: args.instructionNoteId || null,
          ownerScope: args.ownerScope || "company",
        });
        await logCall("spark.folder_create", args, "success");
        return jsonResult({ success: true, folder });
      } catch (err: any) {
        await logCall("spark.folder_create", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 2. spark.folder_list
  // =========================================================================
  tools.push({
    name: "spark.folder_list",
    description: "DE: Listet alle Browser-Ordner auf, optional gefiltert nach Geltungsbereich. / EN: Lists all browser folders, optionally filtered by scope.",
    inputSchema: {
      type: "object",
      properties: {
        ownerScope: { type: "string", description: "DE: Optionaler Filter (z.B. company) / EN: Optional scope filter" },
      },
    },
    handler: async (args: any) => {
      try {
        const folders = await store.listFolders(args.ownerScope);
        return jsonResult({ success: true, count: folders.length, folders });
      } catch (err: any) {
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 3. spark.folder_update
  // =========================================================================
  tools.push({
    name: "spark.folder_update",
    description: "DE: Aktualisiert die Eigenschaften eines Ordners (Name, Typ, Instruktions-Notiz). / EN: Updates folder properties (name, kind, instruction note).",
    inputSchema: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "DE: ID des zu aktualisierenden Ordners / EN: Folder ID" },
        name: { type: "string", description: "DE: Neuer Name / EN: New folder name" },
        kind: { type: "string", enum: ["normal", "settings"], description: "DE: 'normal' oder 'settings' / EN: Folder kind" },
        instructionNoteId: { type: ["string", "null"], description: "DE: ID der Instruktionsnotiz / EN: Instruction note ID" },
      },
      required: ["folderId"],
    },
    handler: async (args: any) => {
      const auth = authorize(deps.grant, "spark:folders:write");
      if (!auth.allowed) {
        await logCall("spark.folder_update", args, "denied", auth.reason);
        return errorResult(auth.reason || "403 Forbidden");
      }

      try {
        const updated = await store.updateFolder(args.folderId, {
          name: args.name,
          kind: args.kind,
          instructionNoteId: args.instructionNoteId,
        });
        await logCall("spark.folder_update", args, "success");
        return jsonResult({ success: true, folder: updated });
      } catch (err: any) {
        await logCall("spark.folder_update", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 4. spark.folder_delete
  // =========================================================================
  tools.push({
    name: "spark.folder_delete",
    description: "DE: Löscht einen Browser-Ordner samt enthaltenen Links und Notiz-Zuordnungen. / EN: Deletes a browser folder including all links and note associations.",
    inputSchema: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "DE: ID des zu löschenden Ordners / EN: Folder ID to delete" },
      },
      required: ["folderId"],
    },
    handler: async (args: any) => {
      const auth = authorize(deps.grant, "spark:folders:write");
      if (!auth.allowed) {
        await logCall("spark.folder_delete", args, "denied", auth.reason);
        return errorResult(auth.reason || "403 Forbidden");
      }

      try {
        await store.deleteFolder(args.folderId);
        await logCall("spark.folder_delete", args, "success");
        return jsonResult({ success: true, deleted: true, folderId: args.folderId });
      } catch (err: any) {
        await logCall("spark.folder_delete", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 5. spark.folder_move
  // =========================================================================
  tools.push({
    name: "spark.folder_move",
    description: "DE: Verschiebt einen Ordner unter einen neuen Elternordner (verhindert Zyklen). / EN: Moves a folder under a new parent folder (prevents cycles).",
    inputSchema: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "DE: ID des zu verschiebenden Ordners / EN: Folder ID to move" },
        targetParentId: { type: ["string", "null"], description: "DE: Ziel-Elternordner (null für Hauptebene) / EN: Target parent folder (null for root)" },
      },
      required: ["folderId"],
    },
    handler: async (args: any) => {
      const auth = authorize(deps.grant, "spark:folders:write");
      if (!auth.allowed) {
        await logCall("spark.folder_move", args, "denied", auth.reason);
        return errorResult(auth.reason || "403 Forbidden");
      }

      try {
        const moved = await store.moveFolder(args.folderId, args.targetParentId || null);
        await logCall("spark.folder_move", args, "success");
        return jsonResult({ success: true, folder: moved });
      } catch (err: any) {
        await logCall("spark.folder_move", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 6. spark.folder_set_kind
  // =========================================================================
  tools.push({
    name: "spark.folder_set_kind",
    description: "DE: Macht einen Ordner zu einem Einstellungs-Ordner ('settings') oder normalen Ordner ('normal'). / EN: Sets folder kind to 'settings' or 'normal'.",
    inputSchema: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "DE: ID des Ordners / EN: Folder ID" },
        kind: { type: "string", enum: ["normal", "settings"], description: "DE: 'normal' oder 'settings' / EN: Kind ('normal' or 'settings')" },
      },
      required: ["folderId", "kind"],
    },
    handler: async (args: any) => {
      const auth = authorize(deps.grant, "spark:folders:write");
      if (!auth.allowed) {
        await logCall("spark.folder_set_kind", args, "denied", auth.reason);
        return errorResult(auth.reason || "403 Forbidden");
      }

      try {
        const updated = await store.updateFolder(args.folderId, { kind: args.kind });
        await logCall("spark.folder_set_kind", args, "success");
        return jsonResult({ success: true, folder: updated });
      } catch (err: any) {
        await logCall("spark.folder_set_kind", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 7. spark.link_add
  // =========================================================================
  tools.push({
    name: "spark.link_add",
    description: "DE: Fügt einen URL-Link zu einem Browser-Ordner hinzu, optional mit zugehöriger Notiz-ID. / EN: Adds a URL link to a browser folder, optionally with a note ID.",
    inputSchema: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "DE: Ziel-Ordner-ID / EN: Target folder ID" },
        url: { type: "string", description: "DE: Vollständige Web-URL / EN: Valid web URL" },
        title: { type: "string", description: "DE: Titel des Links / EN: Link title" },
        noteId: { type: ["string", "null"], description: "DE: Optionale spezifische Notiz-ID / EN: Optional note ID for this link" },
      },
      required: ["folderId", "url", "title"],
    },
    handler: async (args: any) => {
      const auth = authorize(deps.grant, "spark:folders:write");
      if (!auth.allowed) {
        await logCall("spark.link_add", args, "denied", auth.reason);
        return errorResult(auth.reason || "403 Forbidden");
      }

      try {
        const link = await store.addLink({
          folderId: args.folderId,
          url: args.url,
          title: args.title,
          noteId: args.noteId || null,
        });
        await logCall("spark.link_add", args, "success");
        return jsonResult({ success: true, link });
      } catch (err: any) {
        await logCall("spark.link_add", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 8. spark.link_move
  // =========================================================================
  tools.push({
    name: "spark.link_move",
    description: "DE: Verschiebt einen Link von einem Ordner in einen anderen. / EN: Moves a link from one folder to another.",
    inputSchema: {
      type: "object",
      properties: {
        linkId: { type: "string", description: "DE: ID des Links / EN: Link ID" },
        targetFolderId: { type: "string", description: "DE: ID des Ziel-Ordners / EN: Target folder ID" },
      },
      required: ["linkId", "targetFolderId"],
    },
    handler: async (args: any) => {
      const auth = authorize(deps.grant, "spark:folders:write");
      if (!auth.allowed) {
        await logCall("spark.link_move", args, "denied", auth.reason);
        return errorResult(auth.reason || "403 Forbidden");
      }

      try {
        const moved = await store.moveLink(args.linkId, args.targetFolderId);
        await logCall("spark.link_move", args, "success");
        return jsonResult({ success: true, link: moved });
      } catch (err: any) {
        await logCall("spark.link_move", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 9. spark.note_create
  // =========================================================================
  tools.push({
    name: "spark.note_create",
    description: "DE: Erstellt eine neue Spark-Notiz und bindet sie direkt an einen Ordner an. / EN: Creates a new Spark note and attaches it directly to a folder.",
    inputSchema: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "DE: Ziel-Ordner-ID / EN: Folder ID" },
        title: { type: "string", description: "DE: Titel der Notiz / EN: Note title" },
        content: { type: "string", description: "DE: Textinhalt der Notiz / EN: Note content" },
        noteId: { type: "string", description: "DE: Optionale benutzerdefinierte Notiz-ID / EN: Optional custom note ID" },
      },
      required: ["folderId", "title", "content"],
    },
    handler: async (args: any) => {
      const auth = authorize(deps.grant, "spark:folders:write");
      if (!auth.allowed) {
        await logCall("spark.note_create", args, "denied", auth.reason);
        return errorResult(auth.reason || "403 Forbidden");
      }

      try {
        const note = await store.createNote({
          folderId: args.folderId,
          title: args.title,
          content: args.content,
          noteId: args.noteId,
        });
        await logCall("spark.note_create", args, "success");
        return jsonResult({ success: true, note });
      } catch (err: any) {
        await logCall("spark.note_create", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 10. spark.note_read
  // =========================================================================
  tools.push({
    name: "spark.note_read",
    description: "DE: Liest den Inhalt einer bestehenden Spark-Notiz anhand ihrer noteId. / EN: Reads the content of an existing Spark note by noteId.",
    inputSchema: {
      type: "object",
      properties: {
        noteId: { type: "string", description: "DE: ID der Notiz / EN: Note ID" },
      },
      required: ["noteId"],
    },
    handler: async (args: any) => {
      try {
        const note = await store.readNote(args.noteId);
        if (!note) {
          return errorResult(`Notiz mit ID "${args.noteId}" nicht gefunden.`);
        }
        return jsonResult({ success: true, note });
      } catch (err: any) {
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 11. spark.note_attach
  // =========================================================================
  tools.push({
    name: "spark.note_attach",
    description: "DE: Ordnet eine Notiz einem Ordner zu und setzt sie optional als Hauptanweisung für die Links. / EN: Attaches a note to a folder, optionally setting it as main link instruction.",
    inputSchema: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "DE: Ordner-ID / EN: Folder ID" },
        noteId: { type: "string", description: "DE: Notiz-ID / EN: Note ID" },
        title: { type: "string", description: "DE: Optionaler Titel / EN: Optional title" },
        content: { type: "string", description: "DE: Optionaler Inhalt / EN: Optional content" },
        setAsInstruction: { type: "boolean", default: true, description: "DE: Als Ordner-Instruktion für Links setzen / EN: Set as primary folder instruction" },
      },
      required: ["folderId", "noteId"],
    },
    handler: async (args: any) => {
      const auth = authorize(deps.grant, "spark:folders:write");
      if (!auth.allowed) {
        await logCall("spark.note_attach", args, "denied", auth.reason);
        return errorResult(auth.reason || "403 Forbidden");
      }

      try {
        const attached = await store.attachNote({
          folderId: args.folderId,
          noteId: args.noteId,
          title: args.title,
          content: args.content,
          setAsInstruction: args.setAsInstruction !== false,
        });
        await logCall("spark.note_attach", args, "success");
        return jsonResult({ success: true, note: attached });
      } catch (err: any) {
        await logCall("spark.note_attach", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 12. spark.note_detach
  // =========================================================================
  tools.push({
    name: "spark.note_detach",
    description: "DE: Löst eine Notiz-Zuordnung von einem Ordner. / EN: Detaches a note association from a folder.",
    inputSchema: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "DE: Ordner-ID / EN: Folder ID" },
        noteId: { type: "string", description: "DE: Notiz-ID / EN: Note ID" },
      },
      required: ["folderId", "noteId"],
    },
    handler: async (args: any) => {
      const auth = authorize(deps.grant, "spark:folders:write");
      if (!auth.allowed) {
        await logCall("spark.note_detach", args, "denied", auth.reason);
        return errorResult(auth.reason || "403 Forbidden");
      }

      try {
        await store.detachNote(args.folderId, args.noteId);
        await logCall("spark.note_detach", args, "success");
        return jsonResult({ success: true, detached: true, folderId: args.folderId, noteId: args.noteId });
      } catch (err: any) {
        await logCall("spark.note_detach", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  // =========================================================================
  // 13. spark.folder_context
  // =========================================================================
  tools.push({
    name: "spark.folder_context",
    description: "DE: Liefert alle Links eines Ordners inklusive der zugehörigen Notiz-Anweisung (erklärt was mit jedem Link zu tun ist). / EN: Returns all folder links with associated note instructions (explains action items for each link).",
    inputSchema: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "DE: Ordner-ID / EN: Folder ID" },
      },
      required: ["folderId"],
    },
    handler: async (args: any) => {
      try {
        const context = await store.getFolderContext(args.folderId);
        await logCall("spark.folder_context", args, "success");
        return jsonResult({ success: true, context });
      } catch (err: any) {
        await logCall("spark.folder_context", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  });

  return tools;
}

export default buildSparkFolderTools;
