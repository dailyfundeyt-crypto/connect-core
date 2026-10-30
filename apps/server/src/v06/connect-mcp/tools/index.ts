/**
 * Registry aller Connect-MCP Tools (v06 / Wave 2 / A18).
 *
 * Exponiert sowohl die Prompt-spezifischen Tool-Namen für Grok Bot als auch
 * die kanonischen Vertrags-Namen aus `apps/server/src/contracts/v06/connect-mcp.ts`.
 */

import { LIST_COMPANIES_TOOL } from "./companies";
import {
  LIST_SWARMS_TOOL,
  SWARM_CREATE_TOOL,
  SWARM_DISPATCH_TASK_TOOL,
  SWARM_STATUS_TOOL,
} from "./swarms";
import { AGENT_HEALTH_TOOL } from "./health";
import { BRAIN_READ_TOOL, BRAIN_WRITE_TOOL } from "./brain";
import { CONNECT_SEND_MESSAGE_TOOL, USE_AGENT_TOOL } from "./agents";
import { CONNECT_OPEN_UI_TOOL, OPEN_UI_LINK_TOOL } from "./ui";
import type { ToolExecutionContext } from "../types";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<unknown>;
}

// 1. Die Kern-Tools gemäß Aufgabenstellung
export const PRIMARY_CONNECT_MCP_TOOLS: McpToolDefinition[] = [
  LIST_COMPANIES_TOOL,
  LIST_SWARMS_TOOL,
  SWARM_STATUS_TOOL,
  SWARM_CREATE_TOOL,
  SWARM_DISPATCH_TASK_TOOL,
  AGENT_HEALTH_TOOL,
  BRAIN_WRITE_TOOL,
  USE_AGENT_TOOL,
  OPEN_UI_LINK_TOOL,
];

// 2. Vertrags-Aliase gemäß contracts/v06/connect-mcp.ts
export const CONTRACT_ALIAS_TOOLS: McpToolDefinition[] = [
  { ...LIST_COMPANIES_TOOL, name: "connect_list_bots" },
  { ...SWARM_STATUS_TOOL, name: "connect_get_bot_status" },
  CONNECT_SEND_MESSAGE_TOOL,
  { ...SWARM_CREATE_TOOL, name: "connect_create_swarm" },
  { ...SWARM_DISPATCH_TASK_TOOL, name: "connect_run_task" },
  BRAIN_READ_TOOL,
  { ...BRAIN_WRITE_TOOL, name: "connect_write_brain" },
  CONNECT_OPEN_UI_TOOL,
];

// Gesamtliste aller Tools
export const ALL_CONNECT_MCP_TOOLS: McpToolDefinition[] = [
  ...PRIMARY_CONNECT_MCP_TOOLS,
  ...CONTRACT_ALIAS_TOOLS,
];

export function findToolByName(name: string): McpToolDefinition | undefined {
  return ALL_CONNECT_MCP_TOOLS.find((t) => t.name === name);
}
