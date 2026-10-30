/**
 * Connect-MCP Tool-Handler: agents.
 *
 * Exponiert Agent-Operationen als MCP-Tools für externe Clients
 * (Perplexity Computer, Grok-Bot, Codex, Manus, Claude, Swarm).
 *
 * Tools (Phase E - Schritt 19):
 *   list_agents       — alle Connect-Agenten auflisten (mit Status, Engine, Modell)
 *   create_agent      — neuen Agenten anlegen (mit konfigurierbarer Engine & Account)
 *   start_agent       — Terminal-Prozess & optionalen Browser-Tab starten
 *   stop_agent        — laufende Prozesse & Browser-Tabs des Agenten beenden
 *   send_task         — Arbeitsauftrag an Agenten senden (synchron wait=true oder async)
 *   get_status        — Status eines Agenten (Terminal, Browser, Tasks) oder Tasks abfragen
 *   get_result        — Ergebnis eines Tasks oder letzte Agent-Ausgaben abfragen
 *   get_agent_profile — volles Profil eines Agenten lesen
 *   chat_with_agent   — synchroner Dialog-Turn mit einem Agenten
 *   query_agent       — einmalige Frage ohne History
 *   steer_agent       — Instruction in den laufenden Turn injizieren
 *   create_task       — Task in der Work-Queue anlegen
 */

import type {
  McpToolDef,
  McpToolHandler,
  McpToolResult,
} from "../router";
import type { AgentMcpDeps } from "../../agent-hub/agent-mcp-routes";
import type { AgentProfileStore } from "../../agents/profile-store";
import type { Database } from "../../db/client";
import {
  getAgentTerminalLogs,
  getAgentTerminalStatus,
  getAgentWorkspaceDir,
  startAgentTerminal,
  stopAgentTerminal,
} from "../../agent-hub/agent-terminal-manager";
import {
  closeBrowserTab as closeBrowserTabImpl,
  listBrowserTabsFor,
  openBrowserTab as openBrowserTabImpl,
} from "../../agent-hub/agent-browser";
import {
  createConnectMcpTask,
  ensureConnectMcpTasksTable,
  getConnectMcpTask,
  listConnectMcpTasks,
  updateConnectMcpTaskStatus,
} from "../tasks";
import type {
  AgentActor,
  BrowserProfileEngine,
  CliEngine,
  CreateAgentInput,
  FreebuffEngine,
  ManusEngine,
} from "../../agents/profile-types";

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
    "Gibt Name, ID, Titel, Sichtbarkeit (public/private), Engine-Typ, Modell und Ausführungsstatus zurück. " +
    "Verwende dieses Tool, um verfügbare Agenten für Swarm, Perplexity, Grok oder Claude zu inspecten.",
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
      include_status: {
        type: "boolean",
        description: "Aktuellen Terminal- und Browser-Status jedes Agenten ermitteln (default: true)",
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

const CREATE_AGENT: McpToolDef = {
  name: "create_agent",
  description:
    "Erstellt einen neuen Connect-Agenten mit konfigurierbarer Engine (antigravity, codex, claude, freebuff, manus, browser_profile oder built-in), Rolle und Account-E-Mail.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name des Agenten (z.B. 'Research Bot')",
      },
      title: {
        type: "string",
        description: "Anzeigetitel des Agenten (optional, default: Name)",
      },
      role_description: {
        type: "string",
        description: "Rollenbeschreibung und System-Prompt des Agenten",
      },
      engine: {
        type: "string",
        enum: ["antigravity", "codex", "claude", "freebuff", "manus", "browser_profile", "built-in"],
        description: "Ausführungs-Engine (default: antigravity)",
      },
      model: {
        type: "string",
        description: "Modell für die CLI / Engine (optional, default: auto)",
      },
      account_email: {
        type: "string",
        description: "Google-/Login-Konto für den Agenten (default: dailyfunde.yt@gmail.com)",
      },
      start_url: {
        type: "string",
        description: "Start-URL für Browser-Profile-Engine (optional)",
      },
      profile_name: {
        type: "string",
        description: "Helium Browser-Profilname (optional)",
      },
      allow_write: {
        type: "boolean",
        description: "Ob der Agent Dateien schreiben oder Aktionen ausführen darf (default: true)",
      },
      visibility: {
        type: "string",
        enum: ["private", "public"],
        description: "Sichtbarkeit des Agenten (default: private)",
      },
    },
    required: ["name"],
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
};

const START_AGENT: McpToolDef = {
  name: "start_agent",
  description:
    "Startet den Hintergrund-Prozess eines Agenten (Terminal-PTY / CLI) und öffnet optional seinen isolierten Helium-Browser-Tab.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten (z.B. 'agent_abc-123')",
      },
      cli: {
        type: "string",
        enum: ["antigravity", "codex", "claude", "freebuff"],
        description: "CLI-Engine überschreiben (optional)",
      },
      account_email: {
        type: "string",
        description: "Account-E-Mail überschreiben (optional)",
      },
      start_browser: {
        type: "boolean",
        description: "Auch einen Helium-Browser-Tab für den Agenten öffnen (default: false, außer bei browser_profile Engine)",
      },
    },
    required: ["agent_id"],
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

const STOP_AGENT: McpToolDef = {
  name: "stop_agent",
  description:
    "Stoppt den laufenden Prozess eines Agenten und schließt optional offene Browser-Tabs.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten",
      },
      stop_browser: {
        type: "boolean",
        description: "Auch den offenen Browser-Tab schließen (default: true)",
      },
    },
    required: ["agent_id"],
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
};

const SEND_TASK: McpToolDef = {
  name: "send_task",
  description:
    "Sendet einen Arbeitsauftrag an einen Connect-Agenten. Unterstützt synchrone (wait=true) oder asynchrone (wait=false) Ausführung.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Ziel-Agenten",
      },
      prompt: {
        type: "string",
        description: "Die auszuführende Aufgabe / der Prompt",
      },
      task: {
        type: "string",
        description: "Alias für prompt",
      },
      title: {
        type: "string",
        description: "Kurzer Titel des Tasks (optional)",
      },
      priority: {
        type: "string",
        enum: ["low", "normal", "high"],
        description: "Priorität des Tasks (default: normal)",
      },
      wait: {
        type: "boolean",
        description: "Wartet auf das Ergebnis des Agenten (default: false für asynchrone Ausführung)",
      },
    },
    required: ["agent_id"],
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
};

const GET_STATUS: McpToolDef = {
  name: "get_status",
  description:
    "Fragt den aktuellen Status eines Connect-Agenten (Terminal-Prozess, Browser-Tabs, Tasks) oder eines konkreten Tasks ab.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten (optional wenn task_id angegeben)",
      },
      task_id: {
        type: "string",
        description: "Die ID des Tasks (optional wenn agent_id angegeben)",
      },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const GET_RESULT: McpToolDef = {
  name: "get_result",
  description:
    "Ruft das Ergebnis eines abgeschlossenen Tasks oder die letzten Ausgaben eines Agenten ab.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "Die ID des Tasks (empfohlen)",
      },
      agent_id: {
        type: "string",
        description: "Die ID des Agenten (liefert das Ergebnis des letzten Tasks)",
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
    "Erstellt einen asynchronen Task für einen Connect-Agenten in der Work-Queue. " +
    "(Siehe auch 'send_task' für direkten Start).",
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
      const includeStatus = optionalBoolean(args, "include_status", true);
      const companyFilter = optionalString(args, "company")?.trim() || null;

      // Firmen-Filter: die Zuordnung Agent→Firma liegt im Workspace des Nutzers
      // (`connect_workspace_kv`, `u:<userId>:connect.companies.custom`). Fremde
      // Firmen sind fuer diesen Nutzer nicht sichtbar.
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

      const actor: AgentActor = { id: ctx.actorId, role: "user" };
      let filtered: any[] = [];
      if (deps.profileStore) {
        try {
          const profiles = await deps.profileStore.list(actor, includeHidden);
          filtered =
            visibility === "all"
              ? profiles
              : profiles.filter((p) => p.visibility === visibility);
        } catch {}
      }

      if (allowedAgentIds) {
        filtered = filtered.filter((p) => allowedAgentIds!.has(p.id));
      }

      if (filtered.length === 0 && !allowedAgentIds) {
        // Fallback: Swarm-Worker auflisten, damit list_agents stets Daten liefert.
        // Mit Firmen-Filter gibt es keinen Fallback: die Antwort muss genau die
        // Agenten dieser Firma zeigen (sonst waere der Filter wirkungslos).
        try {
          const { getSwarmController } = await import("../../swarm/swarm-controller");
          const controller = getSwarmController(deps.database);
          const status = controller.getStatus(20);
          return jsonResult({
            count: status.workers.length,
            agents: status.workers.map((w) => ({
              id: w.agentId,
              name: w.agentName,
              title: w.agentName,
              visibility: "public",
              engine: "helium-swarm",
              status: w.status,
              hidden: false,
              profile_dir: w.profileDir,
              cdp_port: w.cdpPort,
            })),
          });
        } catch {}
      }

      return jsonResult({
        count: filtered.length,
        ...(filteredCompany ? { company: filteredCompany } : {}),
        agents: filtered.map((p) => {
          let status = "stopped";
          let pid: number | null = null;
          if (includeStatus) {
            try {
              const session = getAgentTerminalStatus(p.id);
              status = session.status;
              pid = session.pid ?? null;
            } catch {}
          }
          return {
            id: p.id,
            name: p.name,
            title: p.title,
            visibility: p.visibility,
            engine: p.engine?.kind ?? "built-in",
            model: p.engine && "model" in p.engine ? p.engine.model : undefined,
            account_email: p.accountEmail ?? undefined,
            browser_profile:
              typeof p.browserProfile === "string"
                ? p.browserProfile
                : p.browserProfile?.profileName ?? undefined,
            status,
            pid,
            hidden: p.hidden,
          };
        }),
      });
    },

    create_agent: async (args, ctx) => {
      const name = requireString(args, "name", { maxLen: 120 });
      const title = optionalString(args, "title") || name;
      const roleDescription = optionalString(args, "role_description") || "Autonomer Assistent";
      const engineKind = (optionalString(args, "engine") || "antigravity").toLowerCase();
      const model = optionalString(args, "model") || "auto";
      const accountEmail = optionalString(args, "account_email") || "dailyfunde.yt@gmail.com";
      const startUrl = optionalString(args, "start_url") || "https://google.com";
      const profileName =
        optionalString(args, "profile_name") ||
        `helium-${name.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`;
      const allowWrite = optionalBoolean(args, "allow_write", true);
      const visibility = optionalString(args, "visibility") === "public" ? "public" : "private";

      let cliEngine: CliEngine | undefined;
      let freebuffEngine: FreebuffEngine | undefined;
      let manusEngine: ManusEngine | undefined;
      let browserProfile: BrowserProfileEngine | undefined;

      if (engineKind === "antigravity" || engineKind === "codex" || engineKind === "claude") {
        cliEngine = {
          kind: engineKind,
          model,
          allowWrite,
        };
      } else if (engineKind === "freebuff") {
        freebuffEngine = {
          kind: "freebuff",
          model,
          allowWrite,
        };
      } else if (engineKind === "manus") {
        manusEngine = {
          kind: "manus",
          model,
        };
      } else if (engineKind === "browser_profile") {
        browserProfile = {
          kind: "browser_profile",
          startUrl,
          profileName,
          allowWrite,
        };
      }

      const actor: AgentActor = { id: ctx.actorId, role: "user" };
      const input: CreateAgentInput & { systemPrompt?: string } = {
        name,
        title,
        roleDescription,
        visibility,
        accountEmail,
        systemPrompt: roleDescription,
        chosenCli: cliEngine?.kind ?? (engineKind === "built-in" ? "antigravity" : engineKind),
        ...(cliEngine ? { cliEngine } : {}),
        ...(freebuffEngine ? { freebuffEngine } : {}),
        ...(manusEngine ? { manusEngine } : {}),
        ...(browserProfile ? { browserProfile } : {}),
      };

      if (!deps.profileStore) {
        return errorResult("ProfileStore nicht initialisiert.");
      }

      const created = await deps.profileStore.create(actor, input);
      return jsonResult({
        created: true,
        agent: {
          id: created.id,
          name: created.name,
          title: created.title,
          role_description: created.roleDescription,
          visibility: created.visibility,
          engine: created.engine?.kind ?? engineKind,
          account_email: created.accountEmail,
        },
      });
    },

    start_agent: async (args, ctx) => {
      const agentId = requireString(args, "agent_id");
      if (agentId.startsWith("swarm20-agent-") || agentId.startsWith("swarm-")) {
        try {
          const { getSwarmController } = await import("../../swarm/swarm-controller");
          const controller = getSwarmController(deps.database);
          const res = await controller.takeoverWorker(agentId);
          return jsonResult({
            agent_id: agentId,
            status: "running",
            browser_tab: true,
            terminal: { pid: 0 },
            message: res.message,
          });
        } catch (err: any) {
          return errorResult(`start_agent für Swarm-Agent fehlgeschlagen: ${err?.message || String(err)}`);
        }
      }

      const cli = optionalString(args, "cli") as "antigravity" | "codex" | "claude" | "freebuff" | undefined;
      const accountEmail = optionalString(args, "account_email");
      const startBrowser = optionalBoolean(args, "start_browser", false);

      const session = await startAgentTerminal(agentId, {
        cli,
        accountEmail,
      });

      let browserTab: unknown = null;
      if (startBrowser) {
        try {
          const tab = await openBrowserTabImpl(deps.database, agentId);
          browserTab = { tab_id: tab.tabId, url: tab.url, title: tab.title };
        } catch (bErr) {
          browserTab = { error: String(bErr) };
        }
      }

      return jsonResult({
        agent_id: agentId,
        status: session.status,
        terminal: {
          status: session.status,
          pid: session.pid,
          cli: session.cli,
          started_at: session.startedAt,
          workspace: getAgentWorkspaceDir(agentId),
        },
        browser_tab: browserTab,
      });
    },

    stop_agent: async (args) => {
      const agentId = requireString(args, "agent_id");
      if (agentId.startsWith("swarm20-agent-") || agentId.startsWith("swarm-")) {
        try {
          const { getSwarmController } = await import("../../swarm/swarm-controller");
          const controller = getSwarmController(deps.database);
          const stopped = controller.stopWorker(agentId);
          return jsonResult({
            agent_id: agentId,
            status: "stopped",
            browser_closed: true,
            stopped,
          });
        } catch (err: any) {
          return errorResult(`stop_agent für Swarm-Agent fehlgeschlagen: ${err?.message || String(err)}`);
        }
      }

      const stopBrowser = optionalBoolean(args, "stop_browser", true);

      const session = await stopAgentTerminal(agentId);
      let browserClosed = false;
      if (stopBrowser) {
        try {
          const res = await closeBrowserTabImpl(deps.database, agentId);
          browserClosed = Boolean(res.closedTabId);
        } catch {}
      }

      return jsonResult({
        agent_id: agentId,
        status: session.status,
        terminal: "stopped",
        browser_closed: browserClosed,
      });
    },

    send_task: async (args, ctx) => {
      const agentId = requireString(args, "agent_id");
      const prompt = optionalString(args, "prompt") || optionalString(args, "task");
      if (!prompt || prompt.trim().length === 0) {
        return errorResult("Ein 'prompt' oder 'task' Text ist erforderlich.");
      }
      const title = optionalString(args, "title") || prompt.slice(0, 50).trim();
      const priority = (optionalString(args, "priority") || "normal") as "low" | "normal" | "high";
      const wait = optionalBoolean(args, "wait", false);

      if (!deps.database) {
        return errorResult("Tasks benötigen eine Datenbank-Verbindung.");
      }

      await ensureConnectMcpTasksTable(deps.database);
      const task = await createConnectMcpTask(deps.database, {
        userId: ctx.actorId,
        agentId,
        title,
        prompt,
        priority,
        source: "connect-mcp",
      });

      await updateConnectMcpTaskStatus(deps.database, task.id, { status: "running" });

      const runner = async () => {
        try {
          if (!deps.agentMcp) throw new Error("AgentMcp nicht verfügbar.");
          const result = await (deps.agentMcp as NonNullable<typeof deps.agentMcp>).invokeChat({ agentId, prompt });
          await updateConnectMcpTaskStatus(deps.database!, task.id, {
            status: "completed",
            resultText: typeof result === "string" ? result : JSON.stringify(result),
          });
          return { ok: true, result };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await updateConnectMcpTaskStatus(deps.database!, task.id, {
            status: "failed",
            errorMessage: errMsg,
          });
          return { ok: false, error: errMsg };
        }
      };

      if (wait) {
        const out = await runner();
        if (out.ok) {
          return jsonResult({
            task_id: task.id,
            agent_id: agentId,
            status: "completed",
            result: out.result,
            completed_at: new Date().toISOString(),
          });
        }
        return errorResult(`Task ${task.id} fehlgeschlagen: ${out.error}`);
      }

      void runner();

      return jsonResult({
        task_id: task.id,
        agent_id: agentId,
        status: "running",
        title,
        priority,
        message: "Task gestartet. Verwende 'get_status' oder 'get_result' mit dieser task_id.",
      });
    },

    get_status: async (args, ctx) => {
      const taskId = optionalString(args, "task_id");
      const agentId = optionalString(args, "agent_id");

      if (taskId && deps.database) {
        const task = await getConnectMcpTask(deps.database, taskId);
        if (!task) return errorResult(`Task '${taskId}' nicht gefunden.`);
        return jsonResult({
          task_id: task.id,
          agent_id: task.agentId,
          title: task.title,
          status: task.status,
          priority: task.priority,
          created_at: task.createdAt,
          started_at: task.startedAt,
          completed_at: task.completedAt,
          has_result: Boolean(task.resultText),
          error: task.errorMessage,
        });
      }

      if (!taskId && !agentId) {
        try {
          const { getSwarmController } = await import("../../swarm/swarm-controller");
          const controller = getSwarmController(deps.database);
          const swarmStatus = controller.getStatus(20);
          return jsonResult({
            ok: true,
            status: "active",
            swarm: swarmStatus,
          });
        } catch (err: any) {
          return errorResult(`agent_id oder task_id erforderlich: ${err?.message || String(err)}`);
        }
      }

      if (agentId) {
        const actor: AgentActor = { id: ctx.actorId, role: "user" };
        let profile = deps.profileStore ? await deps.profileStore.get(actor, agentId) : null;
        if (!profile && (agentId.startsWith("swarm20-agent-") || agentId.startsWith("swarm-"))) {
          try {
            const { getSwarmController } = await import("../../swarm/swarm-controller");
            const controller = getSwarmController(deps.database);
            const status = controller.getStatus(20);
            const worker = status.workers.find((w) => w.agentId === agentId);
            if (worker) {
              return jsonResult({
                agent_id: worker.agentId,
                name: worker.agentName,
                status: worker.status,
                current_task: worker.currentTaskId,
                crash_count: worker.crashCount,
                last_screenshot_at: worker.lastScreenshotAt,
                profile_dir: worker.profileDir,
                cdp_port: worker.cdpPort,
              });
            }
          } catch {}
        }
        if (!profile) return errorResult(`Agent '${agentId}' nicht gefunden.`);

        let terminalInfo: unknown = { status: "unknown" };
        try {
          const term = getAgentTerminalStatus(agentId);
          terminalInfo = {
            status: term.status,
            pid: term.pid,
            cli: term.cli,
            started_at: term.startedAt,
          };
        } catch {}

        let browserTabs: unknown[] = [];
        try {
          const tabs = await listBrowserTabsFor(deps.database, agentId);
          browserTabs = tabs.map((t) => ({
            tab_id: t.tabId,
            url: t.url,
            title: t.title,
          }));
        } catch {}

        let recentTasks: unknown[] = [];
        if (deps.database) {
          try {
            const tasks = await listConnectMcpTasks(deps.database, { agentId, limit: 5 });
            recentTasks = tasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              created_at: t.createdAt,
            }));
          } catch {}
        }

        return jsonResult({
          agent_id: agentId,
          name: profile.name,
          title: profile.title,
          engine: profile.engine?.kind ?? "built-in",
          account_email: profile.accountEmail,
          terminal: terminalInfo,
          browser: {
            open_tabs: browserTabs.length,
            tabs: browserTabs,
          },
          recent_tasks: recentTasks,
        });
      }

      return errorResult("Mindestens 'agent_id' oder 'task_id' muss angegeben werden.");
    },

    get_result: async (args) => {
      const taskId = optionalString(args, "task_id");
      const agentId = optionalString(args, "agent_id");

      if (taskId) {
        if (!deps.database) return errorResult("Datenbank nicht verfügbar.");
        const task = await getConnectMcpTask(deps.database, taskId);
        if (!task) return errorResult(`Task '${taskId}' nicht gefunden.`);

        if (task.status === "completed") {
          return jsonResult({
            task_id: task.id,
            agent_id: task.agentId,
            status: "completed",
            result_text: task.resultText,
            completed_at: task.completedAt,
          });
        }
        if (task.status === "failed") {
          return errorResult(`Task '${taskId}' ist fehlgeschlagen: ${task.errorMessage}`);
        }
        return jsonResult({
          task_id: task.id,
          agent_id: task.agentId,
          status: task.status,
          message: `Task ist noch nicht abgeschlossen (Status: '${task.status}').`,
        });
      }

      if (agentId) {
        if (!deps.database) return errorResult("Datenbank nicht verfügbar.");
        const tasks = await listConnectMcpTasks(deps.database, { agentId, limit: 5 });
        const completedTask = tasks.find((t) => t.status === "completed");
        let terminalTail: string[] = [];
        try {
          terminalTail = getAgentTerminalLogs(agentId, 20);
        } catch {}

        return jsonResult({
          agent_id: agentId,
          latest_completed_task: completedTask
            ? {
                task_id: completedTask.id,
                title: completedTask.title,
                result_text: completedTask.resultText,
                completed_at: completedTask.completedAt,
              }
            : null,
          recent_task_count: tasks.length,
          terminal_logs_tail: terminalTail,
        });
      }

      return errorResult("Mindestens 'task_id' oder 'agent_id' muss angegeben werden.");
    },

    get_agent_profile: async (args, ctx) => {
      const agentId = requireString(args, "agent_id");
      if (!deps.profileStore) return errorResult("ProfileStore nicht initialisiert.");
      const actor: AgentActor = { id: ctx.actorId, role: "user" };
      const profile = await (deps.profileStore as NonNullable<typeof deps.profileStore>).get(actor, agentId);
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

    chat_with_agent: async (args) => {
      const agentId = requireString(args, "agent_id");
      const prompt = requireString(args, "prompt", { maxLen: 32_000 });
      if (!deps.agentMcp) return errorResult("AgentMcp nicht initialisiert.");
      const result = await (deps.agentMcp as NonNullable<typeof deps.agentMcp>).invokeChat({ agentId, prompt });
      return jsonResult({ agent_id: agentId, response: result });
    },

    query_agent: async (args) => {
      const agentId = requireString(args, "agent_id");
      const question = requireString(args, "question", { maxLen: 32_000 });
      if (!deps.agentMcp) return errorResult("AgentMcp nicht initialisiert.");
      const result = await (deps.agentMcp as NonNullable<typeof deps.agentMcp>).invokeQuery({ agentId, question });
      return jsonResult({ agent_id: agentId, answer: result });
    },

    steer_agent: async (args) => {
      const agentId = requireString(args, "agent_id");
      const instruction = requireString(args, "instruction", { maxLen: 4_000 });
      if (!deps.agentMcp) return errorResult("AgentMcp nicht initialisiert.");
      const result = await (deps.agentMcp as NonNullable<typeof deps.agentMcp>).invokeSteer({ agentId, instruction });
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

      if (!deps.database) {
        return errorResult("Tasks benötigen eine Datenbank-Verbindung.");
      }
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
    CREATE_AGENT,
    START_AGENT,
    STOP_AGENT,
    SEND_TASK,
    GET_STATUS,
    GET_RESULT,
    GET_AGENT_PROFILE,
    CHAT_WITH_AGENT,
    QUERY_AGENT,
    STEER_AGENT,
    CREATE_TASK,
  ].map((def) => ({ ...def, handler: handlers[def.name] }));
}
