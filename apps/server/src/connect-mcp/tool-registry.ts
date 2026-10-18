/**
 * Connect-MCP Tool-Registry (Skelett, Stufe 5 Commit 1).
 *
 * Wird in Commit 2-4 mit den echten Handlern gefüllt:
 *   - agents.ts:      list_agents, get_agent_profile, chat_with_agent, ...
 *   - browser.ts:     list_browser_tabs, open_browser_tab, browser_action, ...
 *   - mini-apps.ts:   list_mini_apps, mini_app_launch, mini_app_login
 *   - knowledge.ts:   list_spark_notes, read_spark_note, write_spark_note, ...
 *   - market.ts:      crypto_quote, finance_summary
 *   - swarm.ts:       run_swarm
 *
 * Erweitern = Tool-Def in `tools`-Array einfügen + Handler in eigenem
 * Modul. Der Router iteriert das Array, also gibt es keine "Registry-
 * vergessen"-Bugs.
 */

import type { McpToolDef } from "./router";

/**
 * Aktuell leer (Commit 1). Wird in den nächsten Commits gefüllt.
 * Wir exportieren die `tool` Factory-Funktion, damit das Schema-
 * Boilerplate einmal definiert ist.
 */
export function defineTool(def: McpToolDef): McpToolDef {
  return def;
}

/**
 * Globale Tool-Liste. Modules in `handlers/` rufen `registerTool()` auf,
 * aber für Commit 1 lassen wir es bei einem leeren Array, damit der
 * Build sauber durchläuft.
 */
export const connectMcpTools: McpToolDef[] = [];
