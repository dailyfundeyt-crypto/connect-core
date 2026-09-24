import type { TriggerConfig, TriggerSuggestion } from "prompt-area/helpers";
import { commandTrigger, mentionTrigger } from "prompt-area/helpers";
import {
  ensureAgentIdentity,
  formatSlackHandle,
} from "@/lib/agents/agent-identity";
import {
  MCP_CATEGORY_LABELS,
  mcpMentionValue,
  searchMcpCatalog,
} from "@/lib/mcp/local-servers";
import { AGENT_TRIGGER, COMMAND_TRIGGER, type CommandOption } from "./draft";

/**
 * The composer's trigger registry.
 *
 * Adding a trigger means adding a factory here and passing its source down; composer rendering stays
 * independent of trigger semantics.
 */

export type AgentOption = {
  id: string;
  name: string;
  description?: string;
  /** Slack-style @handle for group addressing */
  handle?: string;
};

/**
 * Narrows the agent roster to mention options, scoped to a channel's permitted agents when
 * `permittedIds` is given.
 *
 * Takes a structural shape so the composer stays independent of the queries module.
 */
export function toAgentOptions(
  profiles: readonly { id: string; name: string; title?: string }[] | undefined,
  permittedIds?: readonly string[],
): AgentOption[] {
  if (!profiles) {
    return [];
  }
  const permitted = permittedIds ? new Set(permittedIds) : null;
  return profiles
    .filter((profile) => !permitted || permitted.has(profile.id))
    .map((profile) => {
      const identity = ensureAgentIdentity(profile.id, profile.name);
      const handle = formatSlackHandle(identity.slackHandle) || undefined;
      return {
        id: profile.id,
        name: profile.name,
        description: handle
          ? `${handle}${profile.title ? ` · ${profile.title}` : ""}`
          : profile.title,
        handle,
      };
    });
}

function matches(query: string, ...fields: (string | undefined)[]): boolean {
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

/**
 * `@` picks an agent and/or an MCP server from the Sammlung.
 *
 * Typing after `@` ranks MCP catalog entries (Gmail, Slack, Linear…) alongside
 * channel agents so the right connector surfaces without leaving the composer.
 */
export function agentTrigger(agents: readonly AgentOption[]): TriggerConfig {
  return mentionTrigger({
    char: AGENT_TRIGGER,
    accessibilityLabel: "agent or MCP server",
    reopenOnChipClick: true,
    emptyMessage: "Kein Agent oder MCP-Server gefunden",
    onSearch: (query): TriggerSuggestion[] => {
      const agentHits = agents
        .filter((agent) =>
          matches(query, agent.name, agent.description, agent.handle),
        )
        .map(
          (agent): TriggerSuggestion => ({
            value: agent.id,
            label: agent.handle
              ? `${agent.name} (${agent.handle})`
              : agent.name,
            description: agent.description
              ? `Agent · ${agent.description}`
              : "Agent",
          }),
        );

      const mcpHits = searchMcpCatalog(query, 10).map(
        (server): TriggerSuggestion => {
          const category =
            MCP_CATEGORY_LABELS[server.category] ?? server.category;
          const state = server.enabled
            ? server.permission === "deny"
              ? "disabled"
              : "ready"
            : "off";
          return {
            value: mcpMentionValue(server.id),
            label: server.name,
            description: `MCP · ${category}${state === "ready" ? "" : ` · ${state}`} — ${server.description}`,
          };
        },
      );

      // Prefer exact / strong MCP matches when the query looks like a connector name.
      if (query.trim().length > 0) {
        return [...mcpHits, ...agentHits].slice(0, 14);
      }
      return [...agentHits.slice(0, 6), ...mcpHits.slice(0, 8)];
    },
    onSelect: (suggestion) => suggestion.label,
  });
}

/**
 * `/` is restricted to the start of a line, so a URL or a date in the middle of a sentence never
 * opens the dropdown. Selection resolves to a chip; `applyCommandChips` then rewrites the ones that
 * are really prompts or client actions.
 */
export function slashCommandTrigger(
  commands: readonly CommandOption[],
): TriggerConfig {
  return commandTrigger({
    char: COMMAND_TRIGGER,
    position: "start",
    accessibilityLabel: "command",
    emptyMessage: "No matching commands",
    onSearch: (query): TriggerSuggestion[] =>
      commands
        .filter((command) => matches(query, command.name, command.description))
        .map((command) => ({
          value: command.id,
          label: command.name,
          description: command.description,
        })),
    onSelect: (suggestion) => suggestion.label,
  });
}

export function buildTriggers({
  agents,
  commands,
}: {
  agents: readonly AgentOption[];
  commands: readonly CommandOption[];
}): TriggerConfig[] {
  return [agentTrigger(agents), slashCommandTrigger(commands)];
}
