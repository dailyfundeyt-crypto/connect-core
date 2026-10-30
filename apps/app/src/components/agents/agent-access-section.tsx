import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  listCloudComputerMcpServers,
  subscribeCloudComputers,
} from "@/lib/agents/cloud-computer";
import type { AgentProfile } from "@/lib/agents/queries";
import { subscribeMcpServers } from "@/lib/mcp/local-servers";
import { agentPluginsQueryOptions } from "@/lib/plugins/queries";
import { readToolName } from "@/lib/plugins/tool-name";

/** "google-drive" as "Google Drive": the connector key, said the way a person would. */
function connectorName(key: string): string {
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * What this coworker may reach when it works: its granted connectors, one row each, and its skills.
 *
 * Read from the same snapshot the runtime offers the Bot, so this shows what a run would actually
 * hold rather than a second opinion. Read-only on purpose — granting is an administrator's, made on
 * the Plugins screens, and a row of switches here would be a second place for the same decision.
 */
export function AgentAccessRegister({ agentId }: { agentId: string; profile: AgentProfile }) {
  const plugins = useQuery(agentPluginsQueryOptions(agentId));
  const [cloudMcp, setCloudMcp] = useState(() =>
    listCloudComputerMcpServers(agentId),
  );

  useEffect(() => {
    const refresh = () => setCloudMcp(listCloudComputerMcpServers(agentId));
    refresh();
    const offCloud = subscribeCloudComputers(refresh);
    const offMcp = subscribeMcpServers(refresh);
    return () => {
      offCloud();
      offMcp();
    };
  }, [agentId]);

  if (plugins.isPending) return null;
  if (plugins.error || !plugins.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        What this coworker may reach could not be loaded.
      </p>
    );
  }

  /* One row per connector, carrying what a person recognises: the tools' names, not their count. */
  const connectors = new Map<string, string[]>();
  for (const tool of plugins.data.tools) {
    const key = tool.ref.split("/")[0] ?? tool.ref;
    let label = readToolName(tool.toolName).label;
    /*
     * Vendors prefix every tool with their own name — "Notion create pages" — which next to a row
     * already titled Notion reads as a stutter. Stripped only as a leading word, and re-cased, so
     * "Notion search" becomes "Search" while "Search notion pages" is left alone.
     */
    const prefix = `${key.toLowerCase()} `;
    if (label.toLowerCase().startsWith(prefix)) {
      const rest = label.slice(prefix.length);
      label = rest ? rest[0]?.toUpperCase() + rest.slice(1) : label;
    }
    const labels = connectors.get(key) ?? [];
    labels.push(label);
    connectors.set(key, labels);
  }
  const skills = plugins.data.skills;

  if (
    connectors.size === 0 &&
    skills.length === 0 &&
    cloudMcp.length === 0
  ) {
    return (
      <Empty className="h-[180px] border border-dashed">
        <EmptyHeader>
          <EmptyTitle className="text-muted-foreground">
            Nothing granted yet
          </EmptyTitle>
          <EmptyDescription>
            An administrator grants connectors and skills from the Plugins
            screens. Until then this coworker can converse, and nothing more.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        What this coworker may reach when it works. Cloud-Computer MCP attaches
        your workspace servers; Plugins grants are separate.
      </p>
      <div className="flex flex-col gap-2">
        {cloudMcp.length > 0 ? (
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>Cloud-Computer · Workspace-MCP</ItemTitle>
              <ItemDescription>
                {cloudMcp
                  .slice(0, 6)
                  .map((s) => s.name)
                  .join(", ")}
                {cloudMcp.length > 6
                  ? ` and ${cloudMcp.length - 6} more`
                  : ""}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="text-sm text-muted-foreground tabular-nums">
                {cloudMcp.length}{" "}
                {cloudMcp.length === 1 ? "server" : "servers"}
              </span>
            </ItemActions>
          </Item>
        ) : null}
        {[...connectors.entries()].map(([key, labels]) => (
          <Item key={key} variant="muted">
            <ItemContent>
              <ItemTitle>{connectorName(key)}</ItemTitle>
              <ItemDescription>
                {labels.slice(0, 4).join(", ")}
                {labels.length > 4 ? ` and ${labels.length - 4} more` : ""}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="text-sm text-muted-foreground tabular-nums">
                {labels.length} {labels.length === 1 ? "tool" : "tools"}
              </span>
            </ItemActions>
          </Item>
        ))}
        {skills.map((skill) => (
          <Item key={skill.slug} variant="muted">
            <ItemContent>
              <ItemTitle>{skill.title}</ItemTitle>
              <ItemDescription>{skill.summary}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="text-sm text-muted-foreground">Skill</span>
            </ItemActions>
          </Item>
        ))}
      </div>
    </>
  );
}
