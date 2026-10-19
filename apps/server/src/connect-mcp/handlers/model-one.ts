/**
 * Connect MCP Handler: Model One
 *
 * Exponiert 2 MCP-Tools für Grok Bot (extern):
 *  1. model_one_chat(agentId, message) → Antwort
 *  2. model_one_status() → Health + Usage
 *
 * Build-Funktion für die Tool-Registry.
 */
import type { Database } from "../../db/client";
import type { McpToolDef } from "../router";
import { getUsage } from "../../model-one/engine";
import { runModelOne } from "../../model-one/engine";
import { cliEntry } from "../../agent-hub/cli-model";

export type ModelOneToolsDeps = {
  database?: Database;
};

export function buildModelOneTools(_deps: ModelOneToolsDeps): McpToolDef[] {
  return [
    {
      name: "model_one_chat",
      description: "Sendet eine Nachricht an Model One (Antigravity-Orchestrator-Agent) und liefert die Antwort. Nutze das für: Brain-Abfragen, Browser-Aufgaben, Code-Aufgaben, allgemeine Fragen.",
      inputSchema: {
        type: "object" as const,
        properties: {
          agentId: { type: "string", description: "Optional: Agent-ID. Default: 'model-one'." },
          message: { type: "string", description: "Die Nachricht an Model One." },
        },
        required: ["message"],
      },
      handler: async (args: unknown) => {
        const a = args as Record<string, unknown>;
        const agentId = typeof a.agentId === "string" ? a.agentId : "model-one";
        const message = typeof a.message === "string" ? a.message.trim() : "";
        if (!message) return { content: [{ type: "text" as const, text: "Fehler: 'message' muss ein nicht-leerer String sein." }] };
        let full = "";
        try {
          for await (const event of runModelOne({ prompt: message, agentId })) {
            if (event.type === "text" && event.text) full += event.text;
          }
        } catch (err) {
          full = `Fehler: ${err instanceof Error ? err.message : String(err)}`;
        }
        return { content: [{ type: "text" as const, text: full || "Keine Antwort erhalten." }] };
      },
    },
    {
      name: "model_one_status",
      description: "Gibt den aktuellen Status von Model One zurück: Installation, Login, Token-Nutzung, Call-Stats.",
      inputSchema: { type: "object" as const, properties: {} },
      handler: async () => {
        const usage = getUsage();
        const agyInstalled = cliEntry("antigravity") !== null;
        const lines = [
          "Model One Status",
          `Antigravity: ${agyInstalled ? "✓ Installiert" : "✗ Nicht installiert"}`,
          `Input-Tokens: ${usage.inputTokens.toLocaleString("de-DE")}`,
          `Output-Tokens: ${usage.outputTokens.toLocaleString("de-DE")}`,
          `Browser-Calls: ${usage.browserCalls}`,
          `Shell-Calls: ${usage.shellCalls}`,
          `Gestartet: ${new Date(usage.startedAt).toLocaleString("de-DE")}`,
          usage.lastCallAt ? `Letzter Call: ${new Date(usage.lastCallAt).toLocaleString("de-DE")}` : "Noch kein Call.",
        ];
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      },
    },
  ];
}
