/**
 * Connect-MCP Tool-Handler: agents.
 *
 * Exposes die 6 wichtigsten Agent-Operationen als MCP-Tools, damit
 * externe Clients (Perplexity Computer, Grok-Bot, Codex, Manus, Claude)
 * Connect-Agenten auflisten, profilen, befragen und steuern können.
 *
 * Tools:
 *   list_agents       — alle Connect-Agenten auflisten (gefiltert)
 *   get_agent_profile — volles Profil eines Agenten (id, name, engine, …)
 *   chat_with_agent   — Prompte einen Agent (Engine: built-in / CLI / Browser)
 *   query_agent       — einmalige Frage ohne History
 *   steer_agent       — Instruction in den laufenden Turn injizieren
 *   create_task       — Task in der Agent-Work-Queue anlegen
 *
 * Diese Tools delegieren an die existierenden `AgentMcpDeps` aus
 * `agent-hub/agent-mcp-deps.ts`, damit wir die gleiche Engine-Logik
 * (CLI/Manus/browser-use/Freebuff/Browser-Profile) wiederverwenden.
 */

import type {
  McpToolDef,
  McpToolHandler,
  McpToolResult,
} from "../router";
import type { AgentMcpDeps } from "../../agent-hub/agent-mcp-routes";
import type { AgentProfileStore } from "../../agents/profile-store";
import type { Database } from "../../db/client";

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

function errorResult(message: string): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
  };
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

function optionalBoolean(args: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`Field "${key}" must be a boolean when present`);
  }
  return value;
}

// ============================================================================
// Tool-Definitions
// ============================================================================

const LIST_AGENTS: McpToolDef = {
  name: "list_agents",
  description:
    "Listet alle sichtbaren Connect-Agenten des angemeldeten Users auf. " +
    "Gibt Name, ID, Titel, Sichtbarkeit (public/private) und Engine-Typ zurück. " +
    "Verwende dieses Tool, um zu sehen, welche Agenten für Perplexity/Grok/Claude verfügbar sind.",
  inputSchema: {
    type: "object",
    properties: {
      include_hidden: {
        type: "boolean",
        description: "Auch versteckte Agenten einschließen (default: false)",
      },
      visibility: {
        type: "string",
        enum: ["public", "private", "all"],
        description: "Filtert nach Sichtbarkeit (default: all)",
      },
      company: {
        type: "string",
        description:
          "Optionaler Filter: nur Agenten, die dieser Firma zugeordnet sind (ID oder Name der Firma).",
      },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const GET_AGENT_PROFILE: McpToolDef = {
  name: "get_agent_profile",
  description:
    "Liest das volle Profil eines Connect-Agenten: ID, Name, Titel, Rolle, Sichtbarkeit, " +
    "Engine-Konfiguration (CLI/Manus/browser-use/Freebuff/Browser-Profile) und Modell. " +
    "Verwende dieses Tool VOR chat_with_agent, um die Engine zu kennen.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten (z.B. 'agent_abc-123')",
      },
    },
    required: ["agent_id"],
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const CHAT_WITH_AGENT: McpToolDef = {
  name: "chat_with_agent",
  description:
    "Schickt eine Chat-Nachricht an einen Connect-Agenten und gibt seine Antwort zurück. " +
    "Wenn der Agent eine CLI-Engine (antigravity, codex, claude) hat, wird die CLI aufgerufen. " +
    "Bei Manus-Engine wird die Manus-Cloud-API benutzt. Bei browser-use wird der Sidecar benutzt. " +
    "Ohne Engine läuft der Agent lokal (built-in).",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten",
      },
      prompt: {
        type: "string",
        description: "Die Nachricht / der Auftrag an den Agenten (max. 32k Zeichen)",
      },
    },
    required: ["agent_id", "prompt"],
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
};

const QUERY_AGENT: McpToolDef = {
  name: "query_agent",
  description:
    "Stellt eine einmalige Frage an einen Connect-Agenten ohne History. " +
    "Gleich wie chat_with_agent, aber kein Konversations-Speicher. " +
    "Gut für klassische Frage-Antwort-Szenarien aus Perplexity/Grok-Recherche.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten",
      },
      question: {
        type: "string",
        description: "Die Frage an den Agenten (max. 32k Zeichen)",
      },
    },
    required: ["agent_id", "question"],
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
};

const STEER_AGENT: McpToolDef = {
  name: "steer_agent",
  description:
    "Injiziert eine Instruction in die nächste laufende Runde eines Connect-Agenten. " +
    "Der Agent liest die Instruction VOR dem nächsten User-Prompt und lenkt entsprechend um. " +
    "Maximal 5 Instructions werden zwischengespeichert (FIFO).",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten",
      },
      instruction: {
        type: "string",
        description: "Die Instruction, die der Agent befolgen soll",
      },
    },
    required: ["agent_id", "instruction"],
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
};

const CREATE_TASK: McpToolDef = {
  name: "create_task",
  description:
    "Erstellt einen asynchronen Task für einen Connect-Agenten. " +
    "Tasks werden in der Agent-Work-Queue gespeichert und können später mit " +
    "list_tasks abgerufen werden. Tasks sind nützlich, wenn der externe Client " +
    "(Perplexity/Grok) ein langlaufendes Commando an Connect-Agenten abgeben will, " +
    "ohne auf das Ergebnis zu warten.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten, der den Task ausführen soll",
      },
      title: {
        type: "string",
        description: "Kurzer Titel des Tasks (z.B. 'Recherche Krypto Q1 2027')",
      },
      prompt: {
        type: "string",
        description: "Der vollständige Prompt für den Task",
      },
      priority: {
        type: "string",
        enum: ["low", "normal", "high"],
        description: "Priorität des Tasks (default: normal)",
      },
    },
    required: ["agent_id", "title", "prompt"],
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
};

// ============================================================================
// Tool-Handler-Builder
// ============================================================================

export type AgentsToolDeps = {
  profileStore?: AgentProfileStore;
  agentMcp?: AgentMcpDeps;
  database?: Database;
};

export function buildAgentsTools(deps: AgentsToolDeps): McpToolDef[] {
  const handlers: Record<string, McpToolHandler> = {
    list_agents: async (args, ctx) => {
      const includeHidden = optionalBoolean(args, "include_hidden", false);
      const visibility = optionalString(args, "visibility") ?? "all";
      const companyFilter = optionalString(args, "company")?.trim() || null;

      // Firmen-Filter: die Zuordnung Agent→Firma liegt im Workspace des
      // Nutzers (`connect_workspace_kv`, `u:<userId>:connect.companies.custom`).
      // Fremde Firmen sind fuer diesen Nutzer nicht sichtbar.
      let allowedAgentIds: Set<string> | null = null;
      let filteredCompany: { id: string; name: string } | null = null;
      if (companyFilter) {
        if (!deps.database) {
          return errorResult("Datenbank nicht verfuegbar — Firmen-Filter nicht moeglich.");
        }
        const { findWorkspaceCompany } = await import("../companies");
        const company = await findWorkspaceCompany(deps.database, ctx.actorId, companyFilter);
        if (!company) {
          return errorResult(
            `Firma "${companyFilter}" wurde nicht gefunden oder gehoert nicht dir.`,
          );
        }
        allowedAgentIds = new Set(company.agentIds);
        filteredCompany = { id: company.id, name: company.name };
      }

      const actor = { id: ctx.actorId, role: "user" as const };
      if (!deps.profileStore) return errorResult("ProfileStore nicht initialisiert.");
      const profiles = await deps.profileStore.list(actor, includeHidden);
      const visible =
        visibility === "all"
          ? profiles
          : profiles.filter((p) => p.visibility === visibility);
      const filtered = allowedAgentIds
        ? visible.filter((p) => allowedAgentIds!.has(p.id))
        : visible;
      return jsonResult({
        count: filtered.length,
        ...(filteredCompany ? { company: filteredCompany } : {}),
        agents: filtered.map((p) => ({
          id: p.id,
          name: p.name,
          title: p.title,
          visibility: p.visibility,
          engine: p.engine?.kind ?? "built-in",
          model: p.engine && "model" in p.engine ? p.engine.model : undefined,
          hidden: p.hidden,
        })),
      });
    },

    get_agent_profile: async (args, ctx) => {
      const agentId = requireString(args, "agent_id");
      const actor = { id: ctx.actorId, role: "user" as const };
      if (!deps.profileStore) return errorResult("ProfileStore nicht initialisiert.");
      const profile = await deps.profileStore.get(actor, agentId);
      if (!profile) {
        return errorResult(`Agent '${agentId}' nicht gefunden oder nicht zugänglich.`);
      }
      return jsonResult({
        id: profile.id,
        name: profile.name,
        title: profile.title,
        role_description: profile.roleDescription,
        visibility: profile.visibility,
        system_owned: profile.systemOwned,
        hidden: profile.hidden,
        engine: profile.engine
          ? {
              kind: profile.engine.kind,
              ...("model" in profile.engine ? { model: profile.engine.model } : {}),
              ...("allowWrite" in profile.engine
                ? { allow_write: profile.engine.allowWrite }
                : {}),
              ...("startUrl" in profile.engine && profile.engine.startUrl
                ? { start_url: profile.engine.startUrl }
                : {}),
              ...("profileName" in profile.engine && profile.engine.profileName
                ? { profile_name: profile.engine.profileName }
                : {}),
            }
          : null,
        has_auth: profile.hasAuth,
        endpoint: profile.endpoint,
        has_callback_token: profile.hasCallbackToken,
      });
    },

    chat_with_agent: async (args, ctx) => {
      const agentId = requireString(args, "agent_id");
      const prompt = requireString(args, "prompt", { maxLen: 32_000 });
      if (!deps.agentMcp) return errorResult("AgentMcp nicht initialisiert.");
      const result = await deps.agentMcp.invokeChat({ agentId, prompt });
      return jsonResult({ agent_id: agentId, response: result });
    },

    query_agent: async (args) => {
      const agentId = requireString(args, "agent_id");
      const question = requireString(args, "question", { maxLen: 32_000 });
      if (!deps.agentMcp) return errorResult("AgentMcp nicht initialisiert.");
      const result = await deps.agentMcp.invokeQuery({ agentId, question });
      return jsonResult({ agent_id: agentId, answer: result });
    },

    steer_agent: async (args, ctx) => {
      const agentId = requireString(args, "agent_id");
      const instruction = requireString(args, "instruction", { maxLen: 4_000 });
      if (!deps.agentMcp) return errorResult("AgentMcp nicht initialisiert.");
      const result = await deps.agentMcp.invokeSteer({ agentId, instruction });
      return jsonResult({
        agent_id: agentId,
        delivered: result.delivered,
        reason: result.reason,
      });
    },

    create_task: async (args, ctx) => {
      const agentId = requireString(args, "agent_id");
      const title = requireString(args, "title", { maxLen: 200 });
      const prompt = requireString(args, "prompt", { maxLen: 32_000 });
      const priority = optionalString(args, "priority") ?? "normal";

      // Stufe 5 Commit 2: Tasks werden in der `connect_mcp_tasks`-Tabelle
      // gespeichert. Schema wird lazy angelegt.
      if (!deps.database) {
        return errorResult("Tasks benötigen eine Datenbank-Verbindung.");
      }
      const { ensureConnectMcpTasksTable, createConnectMcpTask } = await import(
        "../tasks"
      );
      await ensureConnectMcpTasksTable(deps.database);
      const task = await createConnectMcpTask(deps.database, {
        userId: ctx.actorId,
        agentId,
        title,
        prompt,
        priority: priority as "low" | "normal" | "high",
        source: "connect-mcp",
      });
      return jsonResult({
        task_id: task.id,
        status: "queued",
        agent_id: agentId,
        title,
        priority,
        created_at: task.createdAt,
      });
    },
  };

  return [
    LIST_AGENTS,
    GET_AGENT_PROFILE,
    CHAT_WITH_AGENT,
    QUERY_AGENT,
    STEER_AGENT,
    CREATE_TASK,
  ].map((def) => ({ ...def, handler: handlers[def.name] }));
}
