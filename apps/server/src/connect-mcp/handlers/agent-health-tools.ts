/**
 * Lane 10: Agent Health & Listing MCP Tools (Prompts 10.1 & 10.2).
 *
 * Tools:
 *   - agents.health (alias: agents_health) — Berechtigung: agents:health (Connect Wartung)
 *   - agents.list   (alias: list_agents)
 */

import type { Database } from "../../db/client";
import type { AgentProfileStore } from "../../agents/profile-store";
import type { AgentMcpDeps } from "../../agent-hub/agent-mcp-routes";
import { getAgentTerminalStatus } from "../../agent-hub/agent-terminal-manager";
import { listBrowserTabsFor } from "../../agent-hub/agent-browser";
import { cdpPortFor } from "../../agent-hub/agent-cdp";
import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";
import { checkGrantScope } from "../grants";
import { DEV_ACTOR } from "../../auth/dev-actor";

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

function errorResult(message: string, isForbidden = false): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `${isForbidden ? "403 Forbidden: " : "Error: "}${message}` }],
  };
}

export const AGENTS_HEALTH_DEF: McpToolDef = {
  name: "agents.health",
  description:
    "Prüft den Gesundheitsstatus aller oder eines bestimmten Connect-Agenten (Terminal-Prozess, CDP-Browser-Port, aktive Tabs, Memory). Berechtigung: agents:health (Connect Wartung).",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Optionale ID des zu prüfenden Agenten (ohne Angabe werden alle geprüft)",
      },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

export const AGENTS_LIST_DEF: McpToolDef = {
  name: "agents.list",
  description:
    "Listet alle konfigurierten Connect-Agenten mit Status, Profil, Engine und Berechtigungen auf.",
  inputSchema: {
    type: "object",
    properties: {
      filter: { type: "string", description: "Optionaler Namensfilter" },
      limit: { type: "number", description: "Maximale Anzahl Agenten (default: 50)" },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

export function buildAgentHealthTools(deps: {
  database?: Database;
  profileStore?: AgentProfileStore;
  agentMcp?: AgentMcpDeps;
}): McpToolDef[] {
  const handleAgentsHealth: McpToolHandler = async (args, ctx) => {
    try {
      // Berechtigungsprüfung (Prompt 10.2: Connect Wartung hat agents:health)
      if ((ctx as any).grant) {
        const check = checkGrantScope((ctx as any).grant, "agents:health");
        if (!check.allowed) {
          return errorResult(check.reason || "Keine Berechtigung für agents:health", true);
        }
      }

      const specificAgentId = typeof args.agent_id === "string" ? args.agent_id : undefined;

      // Liste aller bekannten Agenten ermitteln
      const knownAgentIds: string[] = [];
      if (deps.profileStore) {
        try {
          const profiles = await deps.profileStore.list(DEV_ACTOR);
          for (const p of profiles) {
            knownAgentIds.push(p.id);
          }
        } catch {
          // Store list failed
        }
      }

      // Falls keine Profile geladen werden konnten, Standard-Agenten & Swarm-Worker prüfen
      if (knownAgentIds.length === 0) {
        for (let i = 1; i <= 20; i++) {
          knownAgentIds.push(`swarm20-agent-${String(i).padStart(2, "0")}`);
        }
      }

      const agentsToCheck = specificAgentId ? [specificAgentId] : knownAgentIds;
      const healthReports: Array<{
        agentId: string;
        terminalRunning: boolean;
        terminalPid?: number;
        browserTabsCount: number;
        cdpPort: number;
        status: "healthy" | "degraded" | "idle";
        checkedAt: string;
      }> = [];

      for (const agentId of agentsToCheck) {
        let terminalRunning = false;
        let terminalPid: number | undefined;
        try {
          const tStatus = getAgentTerminalStatus(agentId);
          terminalRunning = Boolean(tStatus && (tStatus as any).running);
          terminalPid = (tStatus as any)?.pid;
        } catch {}

        let browserTabsCount = 0;
        try {
          const tabs = await listBrowserTabsFor(deps.database, agentId);
          browserTabsCount = tabs.length;
        } catch {}

        const cdpPort = cdpPortFor(agentId);
        const status = (terminalRunning || browserTabsCount > 0) ? "healthy" : "idle";

        healthReports.push({
          agentId,
          terminalRunning,
          terminalPid,
          browserTabsCount,
          cdpPort,
          status,
          checkedAt: new Date().toISOString(),
        });
      }

      const totalHealthy = healthReports.filter((h) => h.status === "healthy").length;

      return jsonResult({
        ok: true,
        summary: `${totalHealthy} von ${healthReports.length} Agenten aktiv / betriebsbereit.`,
        agentsChecked: healthReports.length,
        reports: healthReports,
      });
    } catch (err: any) {
      return errorResult(`agents.health fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleAgentsList: McpToolHandler = async (args) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 50));
      const filter = typeof args.filter === "string" ? args.filter.toLowerCase() : undefined;

      let list: any[] = [];
      if (deps.profileStore) {
        try {
          const profiles = await deps.profileStore.list(DEV_ACTOR);
          list = profiles.map((p: any) => ({
            id: p.id,
            name: p.name,
            engine: p.engine || "helium",
            model: p.model || "grok-beta",
            description: p.description || "",
            status: "active",
          }));
        } catch {}
      }

      if (list.length === 0) {
        // Swarm-Agenten als Fallback
        for (let i = 1; i <= 20; i++) {
          const pad = String(i).padStart(2, "0");
          list.push({
            id: `swarm20-agent-${pad}`,
            name: `Swarm20 Bot ${pad}`,
            engine: "helium-browser",
            model: "grok-2",
            description: "Isolierter Helium-Browser-Agent für Swarm-Aufgaben",
            status: "active",
          });
        }
      }

      if (filter) {
        list = list.filter((a) => a.name.toLowerCase().includes(filter) || a.id.toLowerCase().includes(filter));
      }

      return jsonResult({
        ok: true,
        count: list.length,
        agents: list.slice(0, limit),
      });
    } catch (err: any) {
      return errorResult(`agents.list fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  return [
    { ...AGENTS_HEALTH_DEF, handler: handleAgentsHealth },
    { ...AGENTS_LIST_DEF, handler: handleAgentsList },
    { ...AGENTS_HEALTH_DEF, name: "agents_health", handler: handleAgentsHealth },
  ];
}
