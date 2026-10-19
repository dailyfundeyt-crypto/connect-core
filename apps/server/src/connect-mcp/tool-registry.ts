/**
 * Connect-MCP Tool-Registry (Stufe 5 Commit 2).
 *
 * Hält die globalen Tool-Listen, die der Router durch `tools/list` und
 * `tools/call` exponiert. Tools werden in `handlers/*.ts` definiert und
 * hier registriert.
 *
 * Erweitern = Eintrag in `registerAllTools()` hinzufügen.
 *
 *   - agents.ts:      list_agents, get_agent_profile, chat_with_agent, query_agent, steer_agent, create_task
 *   - browser.ts:     list_browser_tabs, open_browser_tab, browser_action, …        (Commit 3)
 *   - mini-apps.ts:   list_mini_apps, mini_app_launch, mini_app_login               (Commit 3)
 *   - knowledge.ts:   list_spark_notes, read_spark_note, write_spark_note, …        (Commit 4)
 *   - market.ts:      crypto_quote, finance_summary                                (Commit 4)
 *   - swarm.ts:       run_swarm                                                    (Commit 9)
 */

import type { Database } from "../db/client";
import type { AgentMcpDeps } from "../agent-hub/agent-mcp-routes";
import type { AgentProfileStore } from "../agents/profile-store";
import type { McpToolDef } from "./router";
import { buildAgentsTools } from "./handlers/agents";
import { buildBrowserTools } from "./handlers/browser";
import { buildMiniAppsTools } from "./handlers/mini-apps";

/**
 * Registry-Build-Deps. Werden vom Mount-Punkt in `app.ts` gesetzt.
 *
 * Nicht alle Tools brauchen alle Felder — z.B. `list_agents` braucht
 * nur `profileStore`, `chat_with_agent` braucht `agentMcp`. Die Build-
 * Funktionen prüfen das selbst.
 */
export type ConnectMcpBuildDeps = {
  database?: Database;
  profileStore?: AgentProfileStore;
  agentMcp?: AgentMcpDeps;
};

/**
 * Singleton-Tool-Liste. Wird beim ersten Mount einmal gebaut und dann
 * read-only gehalten. Handler-Closures behalten die Build-Deps.
 */
let registry: McpToolDef[] | null = null;

export function buildConnectMcpToolRegistry(deps: ConnectMcpBuildDeps): McpToolDef[] {
  if (registry) return registry;

  const tools: McpToolDef[] = [];

  // agents.ts (Commit 2): 6 Tools
  if (deps.profileStore && deps.agentMcp) {
    const agentsTools = buildAgentsTools({
      profileStore: deps.profileStore,
      agentMcp: deps.agentMcp,
      ...(deps.database ? { database: deps.database } : {}),
    });
    tools.push(...agentsTools);
  }

  // browser.ts (Commit 3): 4 Tools — funktionieren auch ohne database
  // (CDP-Browser läuft im Server-Prozess)
  tools.push(...buildBrowserTools({
    ...(deps.database ? { database: deps.database } : {}),
  }));

  // mini-apps.ts (Commit 3): 3 Tools — keine externen Deps nötig
  tools.push(...buildMiniAppsTools({}));

  registry = tools;
  return registry;
}

/**
 * Re-Build für Tests. Nicht im Produktions-Code aufrufen.
 */
export function resetConnectMcpToolRegistryForTests(): void {
  registry = null;
}
