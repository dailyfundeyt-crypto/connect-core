/** Contract v06 – Änderungen nur durch A00/Integrator */

export type SwarmScope =
  | "read"
  | "operate"
  | "create_swarm"
  | "brain_write"
  | "open_ui"
  | "use_agents";

export interface SwarmGrant {
  id: string;
  principal: string; /* z.B. 'grokbot:hyper' */
  companyId: string;
  swarmId?: string;
  scopes: SwarmScope[];
  createdAt: string;
}

export const CONNECT_MCP_TOOL_NAMES = [
  "connect_list_bots",
  "connect_get_bot_status",
  "connect_send_message",
  "connect_create_swarm",
  "connect_run_task",
  "connect_read_brain",
  "connect_write_brain",
  "connect_open_ui",
  "connect_browser_action",
  "connect_manage_profile",
] as const;

export type ConnectMcpToolName = (typeof CONNECT_MCP_TOOL_NAMES)[number];
