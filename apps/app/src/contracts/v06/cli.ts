/** Contract v06 – Änderungen nur durch A00/Integrator */

export type CliProviderId =
  | "antigravity"
  | "codex"
  | "claude"
  | "gemini"
  | "freebuff";

export type CliElevation = "inherit" | "deelevated";

export interface CliSessionRef {
  conversationId: string;
  provider: CliProviderId;
  browserProfileId?: string;
  /**
   * Serverseitig aus der Channel-Mitgliedschaft aufgelöste Runtime-ID. Sie wird
   * nie vom Browser als Berechtigung oder Terminal-Ziel übernommen.
   */
  runtimeAgentId?: string;
}

export interface ProviderSwitchReq {
  conversationId: string;
  from: CliProviderId;
  to: CliProviderId;
}

export interface MemoryHandoff {
  conversationId: string;
  summary: string;
  lastMessages: {
    role: "user" | "assistant" | "system";
    text: string;
    at: string;
  }[];
  openTasks: string[];
  browserProfileId?: string;
}
