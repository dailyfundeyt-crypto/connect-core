/**
 * Connect's Hermes harness profile — convention, not a forked runtime.
 *
 * Phase A of Plan 037: one structured agent loop (plan → tools → observe → reply),
 * a default tool allowlist, shell Ask permissions, and a short system nudge. Later
 * phases add Codex bridge, Wave blocks, Reach, etc. without replacing this profile.
 *
 * Skill folder convention (local packs, optional):
 *   skills/<skill-slug>/SKILL.md   — instructions the Bot follows when the skill is granted
 *   skills/<skill-slug>/scripts/   — optional helpers the shell may run after Ask
 *   skills/<skill-slug>/refs/      — optional reference docs the Bot may cite
 */

/** Default tools a Hermes-profile Bot may call without a per-agent override. */
export const HERMES_DEFAULT_TOOL_ALLOWLIST = [
  "hermes_plan",
  "computer_navigate",
  "computer_read",
  "computer_snapshot",
  "computer_type",
  "computer_click",
  "computer_key",
  "computer_scroll",
  "computer_request_secret",
  "computer_request_help",
  "computer_list_files",
  "computer_read_file",
  "computer_write_file",
  "computer_run_command",
  "askApproval",
  "askChoice",
] as const;

export type HermesAllowedTool = (typeof HERMES_DEFAULT_TOOL_ALLOWLIST)[number];

const DEFAULT_SET = new Set<string>(HERMES_DEFAULT_TOOL_ALLOWLIST);

/**
 * Whether a tool name is on the Hermes allowlist.
 *
 * Plugin / MCP tools are offered as `mcp__server__tool` (see `toolNameFor`). Those stay available
 * when the Bot was granted them — this check only narrows the fixed computer + harness tools when
 * a custom allowlist is supplied. An empty override means "use the default set".
 */
export function isHermesAllowedTool(
  name: string,
  allowlist: readonly string[] = HERMES_DEFAULT_TOOL_ALLOWLIST,
): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  // Granted connector tools stay available; Hermes does not strip MCP by default.
  if (trimmed.startsWith("mcp__") || trimmed.includes("/")) return true;
  const set =
    allowlist === HERMES_DEFAULT_TOOL_ALLOWLIST
      ? DEFAULT_SET
      : new Set(allowlist);
  return set.has(trimmed);
}

/**
 * Filter a list of tool descriptors (or bare names) down to the Hermes allowlist.
 * Unknown shapes pass through unchanged when they lack a usable name.
 */
export function filterHermesTools<T extends { name?: string }>(
  tools: readonly T[],
  allowlist: readonly string[] = HERMES_DEFAULT_TOOL_ALLOWLIST,
): T[] {
  return tools.filter((tool) => {
    const name = typeof tool.name === "string" ? tool.name : "";
    if (!name) return true;
    return isHermesAllowedTool(name, allowlist);
  });
}
