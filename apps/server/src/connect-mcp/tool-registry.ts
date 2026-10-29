/**
 * Connect-MCP Tool-Registry (Stufe 5 Commit 2).
 *
 * Hält die globalen Tool-Listen, die der Router durch `tools/list` und
 * `tools/call` exponiert. Tools werden in `handlers/*.ts` definiert und
 * hier registriert.
 *
 * Erweitern = Eintrag in `registerAllTools()` hinzufügen.
 *
 *   - agents.ts:      list_agents, create_agent, start_agent, stop_agent, send_task, get_status, get_result, get_agent_profile, chat_with_agent, query_agent, steer_agent, create_task
 *   - browser.ts:     browser_action, get_screenshot, list_browser_tabs, open_browser_tab, close_browser_tab
 *   - mini-apps.ts:   list_mini_apps, mini_app_launch, mini_app_login
 *   - knowledge.ts:   list_spark_notes, read_spark_note, write_spark_note, …
 *   - market.ts:      crypto_quote, finance_summary
 *   - swarm.ts:       run_swarm
 */

import type { Database } from "../db/client";
import type { AgentMcpDeps } from "../agent-hub/agent-mcp-routes";
import type { AgentProfileStore } from "../agents/profile-store";
import type { McpToolDef } from "./router";
import { buildAgentsTools } from "./handlers/agents";
import { buildBrowserTools } from "./handlers/browser";
import { buildMiniAppsTools } from "./handlers/mini-apps";
import { buildKnowledgeTools } from "./handlers/knowledge";
import { buildMarketTools } from "./handlers/market";
import { buildModelOneTools } from "./handlers/model-one";
import { buildCustomMcpTools } from "./handlers/custom-mcp-handlers";
import { buildSwarmTools } from "./handlers/swarm";
import { buildSwarmMcpTools } from "./handlers/swarm-tools";
import { buildAgentHealthTools } from "./handlers/agent-health-tools";
import { buildEmailAgentMcpTools } from "./handlers/email-agent-tools";
import { buildEmailAgentMcpTools as buildV06EmailAgentMcpTools } from "../v06/email-agents/mcpTools";
import { buildSparkFolderMcpTools } from "./handlers/spark-folders";
import { buildLane8McpTools } from "../swarm/adapters/mcp-tools-bridge";
import { buildUsageMcpTools } from "./tools/usage-tools";
import { buildConductorMcpTools } from "./tools/conductor-tools";
import { buildDesktopMcpTools } from "./tools/desktop-tools";
import { buildSparkLearnHandlerTools } from "./handlers/spark-learn";
import { buildCompanyProfileTools } from "./handlers/company-profiles";

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
  /** Social-/Supabase-Zugang für Unternehmensprofile (nur lokal in der App verfügbar). */
  companyProfileQuery?: ((text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>) | null;
};

/**
 * Singleton-Tool-Liste. Wird beim ersten Mount einmal gebaut und dann
 * read-only gehalten. Handler-Closures behalten die Build-Deps.
 */
let registry: McpToolDef[] | null = null;

export function buildConnectMcpToolRegistry(deps: ConnectMcpBuildDeps): McpToolDef[] {
  if (registry) return registry;

  const tools: McpToolDef[] = [];

  // agents.ts: Alle 9 Pflicht-Tools & Agent-Operationen immer registrieren
  const agentsTools = buildAgentsTools({
    profileStore: deps.profileStore,
    agentMcp: deps.agentMcp,
    ...(deps.database ? { database: deps.database } : {}),
  });
  tools.push(...agentsTools);

  // browser.ts (Commit 3): 4 Tools — funktionieren auch ohne database
  // (CDP-Browser läuft im Server-Prozess)
  tools.push(...buildBrowserTools({
    ...(deps.database ? { database: deps.database } : {}),
  }));

  // mini-apps.ts (Commit 3): 3 Tools — keine externen Deps nötig
  tools.push(...buildMiniAppsTools({}));

  // knowledge.ts (Commit 4): 3 Stub-Tools — Spark-Notes (Integration Stufe 6+)
  tools.push(...buildKnowledgeTools({}));

  // market.ts (Commit 4): 3 Stub-Tools — Crypto/Finance (Integration Stufe 6+)
  tools.push(...buildMarketTools({}));

  // custom-mcp-handlers.ts (Schritt 16): Die 6 zuschaltbaren Eigenen MCPs
  // Flux, Spark, Hyper, Analyse, Connect-MCP, Connect-Browser
  tools.push(...buildCustomMcpTools(deps));

  // swarm.ts (Phase E Schritt 20): Swarm-Controller (Warteschlange, Scheduler, 20 Agenten, CPU/RAM)
  tools.push(...buildSwarmTools({
    ...(deps.database ? { database: deps.database } : {}),
  }));

  // Lane 10: Swarm & App MCP Tools (swarm.create, swarm.list, swarm.dispatch, swarm.status, app.open_qr)
  tools.push(...buildSwarmMcpTools({
    ...(deps.database ? { database: deps.database } : {}),
  }));

  // Lane 10: Agent Health & Listing (agents.health, agents.list)
  tools.push(...buildAgentHealthTools({
    profileStore: deps.profileStore,
    agentMcp: deps.agentMcp,
    ...(deps.database ? { database: deps.database } : {}),
  }));

  // Lane 10: External Email Agents (email_agents.list, email_agents.send, email_agents.check_replies)
  tools.push(...buildEmailAgentMcpTools({
    ...(deps.database ? { database: deps.database } : {}),
  }));

  // Wave 2 / A19: v06 Email Agent MCP Tools (list_email_agents, request_email)
  tools.push(...buildV06EmailAgentMcpTools({ database: deps.database }));

  // Swarm-v3 Lane 3: Spark Folder MCP Tools
  tools.push(...buildSparkFolderMcpTools({ database: deps.database }));

  // Swarm-v3 Lane 8: Council & Simulation MCP Tools (council.*, simulation.*)
  tools.push(...buildLane8McpTools(deps));

  // Lane 4: Conductor & Usage MCP Tools (usage.get, conductor.status, conductor.handoff, conductor.kill)
  tools.push(...buildUsageMcpTools({ database: deps.database }));
  tools.push(...buildConductorMcpTools({ database: deps.database }));

  // Connect Desktop MCP Tools (desktop.*)
  tools.push(...buildDesktopMcpTools({ database: deps.database }));

  // Spark-Learn MCP Tools (Lane 7: spark_ask, spark_semantic_search, spark_related, spark_quiz_next, spark_learn_status, spark_propose, spark_youtube_import)
  tools.push(...buildSparkLearnHandlerTools({ database: deps.database }));

  // Unternehmensprofile + Zuordnung zu externen Agenten (company_profiles.list / company_profiles.assign)
  tools.push(
    ...buildCompanyProfileTools({
      ...(deps.database ? { database: deps.database } : {}),
      ...(deps.companyProfileQuery ? { query: deps.companyProfileQuery } : { query: null }),
    }),
  );

  registry = applyReadOnlyClassification(tools);
  return registry;
}

// ============================================================================
// Read-Only-Klassifizierung (Token-Scope "read")
// ============================================================================
//
// Ein Connect-MCP-Token mit scope="read" sieht/ruft NUR Tools, die nach dieser
// Normalisierung readOnly/readOnlyHint === true tragen. Fail-closed: Tools
// ohne Markierung gelten als schreibend.

/**
 * Tools, die in ihren Handler-Dateien als readOnly markiert sind, aber
 * tatsächlich Zustand verändern oder Seiteneffekte auslösen.
 *   - council.decision_get: Alias des Verdict-Handlers → startet Council-Vote (LLM),
 *     setzt activeDecisions + session.status="completed".
 *   - simulation.report / simulation.report_get: generateSimulationReport + run.status="completed".
 *   - get_screenshot: öffnet ggf. einen Browser-Tab und navigiert zu `url`.
 */
export const CONNECT_MCP_FORCE_WRITE_TOOLS: ReadonlySet<string> = new Set([
  "council.decision_get",
  "simulation.report",
  "simulation.report_get",
  "get_screenshot",
]);

/**
 * Bildschirm-/Fensterinhalt-Tools. Sie verändern nichts, geben aber sichtbare
 * Inhalte (Screenshots, OCR-Text, UI-Elemente, Fenstertitel) preis und gelten
 * deshalb für Token-Scope "read" als NICHT lesend (fail-closed).
 * TODO: später eigener Scope (z.B. "screen"), statt sie unter "full" zu führen.
 */
export const CONNECT_MCP_SCREEN_CONTENT_TOOLS: ReadonlySet<string> = new Set([
  "desktop.screenshot", "screenshot",
  "desktop.read_screen_text", "read_screen_text",
  "desktop.find_element", "find_element",
  "desktop.get_active_window", "get_active_window",
  "swarm_capture_screenshot",
  "get_screenshot",
]);

/**
 * Tools, die nachweislich nur lesen, aber in ihren Handler-Dateien noch
 * keine readOnly-Markierung tragen.
 */
export const CONNECT_MCP_READ_ONLY_ALLOWLIST: ReadonlySet<string> = new Set([
  // Spark-Learn (brain/learn/mcp-tools.ts) — nur Lesen + Audit-Log
  "spark_ask", "spark.ask",
  "spark_semantic_search", "spark.semantic_search",
  "spark_related", "spark.related",
  "spark_quiz_next", "spark.quiz_next",
  "spark_learn_status", "spark.learn_status",
  // Spark-Folders (brain/browser-folders/mcp-tools.ts)
  "spark.folder_list", "spark.note_read", "spark.folder_context",
  // custom-mcp-handlers.ts
  "flux_list_products", "flux_get_inventory", "flux_track_delivery",
  "spark_list_notes", "spark_read_note", "spark_search_knowledge",
  "hyper_crypto_quote", "hyper_market_summary", "hyper_get_positions",
  "analyse_social_trends", "analyse_get_metrics",
  "connect_list_agents", "connect_get_status", "browser_list_tabs",
]);

/**
 * Normalisiert die readOnly-Annotationen aller Tools. Annotation-Objekte
 * werden kopiert (Aliase teilen sich teils dieselben Objekte), Handler
 * bleiben unverändert.
 */
export function applyReadOnlyClassification(tools: McpToolDef[]): McpToolDef[] {
  return tools.map((tool) => {
    const base = { ...(tool.annotations ?? {}) };
    if (CONNECT_MCP_FORCE_WRITE_TOOLS.has(tool.name) || CONNECT_MCP_SCREEN_CONTENT_TOOLS.has(tool.name)) {
      return { ...tool, annotations: { ...base, readOnlyHint: false, readOnly: false } };
    }
    if (CONNECT_MCP_READ_ONLY_ALLOWLIST.has(tool.name)) {
      return { ...tool, annotations: { ...base, readOnlyHint: true, readOnly: true } };
    }
    const isRead =
      (base.readOnlyHint === true || base.readOnly === true) &&
      base.readOnlyHint !== false &&
      base.readOnly !== false;
    return {
      ...tool,
      annotations: { ...base, readOnlyHint: isRead, readOnly: isRead },
    };
  });
}

/** Namen aller Tools, die ein Read-Token sehen/aufrufen darf. */
export function listConnectMcpReadOnlyToolNames(tools: McpToolDef[]): string[] {
  return tools
    .filter((t) => t.annotations?.readOnlyHint === true && t.annotations?.readOnly === true)
    .map((t) => t.name);
}

/**
 * Re-Build für Tests. Nicht im Produktions-Code aufrufen.
 */
export function resetConnectMcpToolRegistryForTests(): void {
  registry = null;
}
