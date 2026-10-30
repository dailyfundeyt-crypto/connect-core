/**
 * Swarm-v3 Lane 8 MCP Tools Bridge.
 *
 * Exposes council.* and simulation.* tools to the Server's MCP Tool Registry.
 */

import { buildCouncilMcpTools } from "../../../../../packages/connect-mcp/src/tools/council-tools";
import { buildSimulationMcpTools } from "../../../../../packages/connect-mcp/src/tools/simulation-tools";
import type { McpToolDef } from "../../connect-mcp/router";

export function buildLane8McpTools(deps?: { database?: any }): McpToolDef[] {
  return [
    ...buildCouncilMcpTools(deps),
    ...buildSimulationMcpTools(deps),
  ];
}
