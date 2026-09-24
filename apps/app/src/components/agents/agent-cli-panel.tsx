/**
 * CLI panel UI is intentionally never shown.
 * Model One runs Manus/Codex/ZGPT via background enqueue + cli-bridge only.
 * Chat + file upload is the user surface (Plan 047).
 *
 * The queue/bridge APIs live in `@/lib/agents/agent-cli` and stay active.
 */

export function AgentCliPanel(_props: {
  agentId: string;
  /** Unused — panel is always hidden. */
  compact?: boolean;
}) {
  return null;
}
