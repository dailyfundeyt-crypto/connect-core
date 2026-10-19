/**
 * Connect-MCP Tool-Handler: knowledge (Spark Notes).
 *
 * 3 Tools für Perplexity/Grok, um auf Spark-Notes-ähnliches Knowledge
 * zuzugreifen (Notizen, Pläne, Docs, die im Workspace des Users liegen).
 *
 * Stufe 5 Commit 4: Stubs. Die echte Integration kommt in Stufe 6+.
 * Jeder Stub gibt eine ehrliche Antwort, was passieren würde, wenn
 * die Integration existiert.
 *
 * Tools:
 *   list_knowledge_sources  — Quellen für Knowledge auflisten
 *   read_spark_note        — eine einzelne Note lesen
 *   write_spark_note        — eine Note schreiben / aktualisieren
 */

import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";

// ============================================================================
// Helpers
// ============================================================================

function jsonResult(payload: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function stubResult(toolName: string, args: Record<string, unknown>): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text:
          `[Connect-MCP-Stub] "${toolName}" ist noch nicht integriert. ` +
          `Echte Integration kommt in Stufe 6+. ` +
          `Args received: ${JSON.stringify(args)}`,
      },
    ],
  };
}

function errorResult(message: string): McpToolResult {
  return { isError: true, content: [{ type: "text", text: `Error: ${message}` }] };
}

function requireString(
  args: Record<string, unknown>,
  key: string,
  opts: { allowEmpty?: boolean; maxLen?: number } = {},
): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`Missing required field "${key}" (expected string)`);
  }
  if (!opts.allowEmpty && value.trim().length === 0) {
    throw new Error(`Field "${key}" must not be empty`);
  }
  if (opts.maxLen && value.length > opts.maxLen) {
    throw new Error(`Field "${key}" exceeds max length ${opts.maxLen}`);
  }
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Field "${key}" must be a string when present`);
  }
  return value;
}

// ============================================================================
// Tool-Definitions
// ============================================================================

const LIST_KNOWLEDGE_SOURCES: McpToolDef = {
  name: "list_knowledge_sources",
  description:
    "Listet alle verfügbaren Knowledge-Quellen des Connect-Users auf. " +
    "Quellen: Spark-Notes (Notizen), Plan-Dateien (.plan/*.md), Workspace-Docs. " +
    "Verwende dieses Tool, um zu sehen, welche Dokumente für Retrieval verfügbar sind. " +
    "Stufe 5 Commit 4: Stub — echte Integration kommt in Stufe 6+.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Optionaler Suchbegriff, um relevante Quellen zu filtern",
      },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const READ_SPARK_NOTE: McpToolDef = {
  name: "read_spark_note",
  description:
    "Liest den Inhalt einer einzelnen Spark-Note. " +
    "Spark-Notes sind Markdown-Notizen, die im Workspace des Users gespeichert sind. " +
    "Sie können Pläne, Meeting-Notes, oder Recherche-Ergebnisse enthalten. " +
    "Stufe 5 Commit 4: Stub — echte Integration kommt in Stufe 6+.",
  inputSchema: {
    type: "object",
    properties: {
      note_id: {
        type: "string",
        description: "Die ID oder der Dateiname der Note (z.B. 'STUFE-5-6-SWARM-PLAN.md')",
      },
    },
    required: ["note_id"],
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const WRITE_SPARK_NOTE: McpToolDef = {
  name: "write_spark_note",
  description:
    "Schreibt oder aktualisiert eine Spark-Note im Workspace des Users. " +
    "Wenn die Note existiert, wird sie überschrieben; wenn nicht, wird sie neu angelegt. " +
    "Nützlich für Perplexity/Grok, um Recherche-Ergebnisse zu persistieren. " +
    "Stufe 5 Commit 4: Stub — echte Integration kommt in Stufe 6+.",
  inputSchema: {
    type: "object",
    properties: {
      note_id: {
        type: "string",
        description: "Dateiname der Note (z.B. 'perplexity-recherche-2026-10.md')",
      },
      content: {
        type: "string",
        description: "Markdown-Inhalt der Note",
      },
    },
    required: ["note_id", "content"],
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
};

// ============================================================================
// Handler-Builder
// ============================================================================

export type KnowledgeToolDeps = Record<string, never>;

export function buildKnowledgeTools(_deps: KnowledgeToolDeps): McpToolDef[] {
  const handlers: Record<string, McpToolHandler> = {
    list_knowledge_sources: async (args) => {
      const query = optionalString(args, "query");
      return stubResult("list_knowledge_sources", { query });
    },

    read_spark_note: async (args) => {
      const noteId = requireString(args, "note_id");
      return stubResult("read_spark_note", { note_id: noteId });
    },

    write_spark_note: async (args) => {
      const noteId = requireString(args, "note_id");
      const content = requireString(args, "content", { maxLen: 1_000_000 });
      return stubResult("write_spark_note", { note_id: noteId, content_length: content.length });
    },
  };

  return [LIST_KNOWLEDGE_SOURCES, READ_SPARK_NOTE, WRITE_SPARK_NOTE].map((def) => ({
    ...def,
    handler: handlers[def.name],
  }));
}
