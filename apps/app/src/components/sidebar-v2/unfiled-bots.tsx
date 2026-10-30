import { IconRobot } from "@tabler/icons-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { SidebarGroup } from "@/components/ui/sidebar";
import { BotContextMenu } from "@/v06/sidebar/BotContextMenu";
import { SectionLabel } from "./group-row";
import {
  agentHasUnread,
  pickActiveSegment,
  segmentsFromRoster,
} from "@/lib/agents/agent-conversation";
import {
  ensureAgentIdentities,
  formatSlackHandle,
  getAgentIdentity,
  subscribeAgentIdentities,
} from "@/lib/agents/agent-identity";
import { type AgentProfile, agentListQueryOptions } from "@/lib/agents/queries";
import { createChannelMutationOptions } from "@/lib/channels/mutations";
import { type ChannelSummary, channelKeys } from "@/lib/channels/queries";
import { listProjects, removeAgentsFromProject, subscribeProjects } from "@/lib/companies/projects";
import { DND_AGENT } from "@/lib/companies/sidebar-order";
import {
  getCompany,
  listCompanies,
  readActiveCompanyId,
  resolveCompanyId,
  subscribeCompanies,
} from "@/lib/companies/store";
import { relativeTime } from "@/lib/relative-time";
import { SidebarSection, EmptyState } from "@/v06/design";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";

export interface UnfiledBotsProps {
  channels?: readonly ChannelSummary[];
  search?: string;
}

export function UnfiledBots({ channels = [], search = "" }: UnfiledBotsProps) {
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const createChannel = useMutation(createChannelMutationOptions(queryClient));
  const agentsQuery = useQuery(agentListQueryOptions());
  const isDesignV2 = getFlag("designV2");

  const [companyId, setCompanyId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : resolveCompanyId(readActiveCompanyId()),
  );
  const [companies, setCompanies] = useState(() => listCompanies());
  const [projectTick, setProjectTick] = useState(0);
  const [identityTick, setIdentityTick] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const sync = () => {
      setCompanyId(resolveCompanyId(readActiveCompanyId()));
      setCompanies(listCompanies());
    };
    window.addEventListener("connect-active-company", sync);
    const off = subscribeCompanies(() => {
      setCompanies(listCompanies());
      setCompanyId(resolveCompanyId(readActiveCompanyId()));
    });
    return () => {
      window.removeEventListener("connect-active-company", sync);
      off();
    };
  }, []);

  useEffect(() => {
    return subscribeProjects(() => setProjectTick((t) => t + 1));
  }, []);

  useEffect(() => {
    return subscribeAgentIdentities(() => setIdentityTick((t) => t + 1));
  }, []);

  const company = companyId
    ? (getCompany(companyId) ?? companies.find((c) => c.id === companyId))
    : companies[0];

  const ungroupedAgents = useMemo(() => {
    void projectTick;
    void identityTick;
    const all = agentsQuery.data ?? [];
    if (all.length > 0) ensureAgentIdentities(all);
    if (!company) return [];

    const companyIds = new Set(company.agentIds);
    const inProjects = new Set(
      listProjects(company.id).flatMap((p) => p.agentIds),
    );

    // Filter: strictly only agents belonging to company AND not in any project folder
    const filtered = all
      .filter((a) => companyIds.has(a.id))
      .filter((a) => !inProjects.has(a.id));

    if (!search.trim()) return filtered;
    const query = search.trim().toLowerCase();
    return filtered.filter(
      (a) =>
        a.name.toLowerCase().includes(query) ||
        (a.role && a.role.toLowerCase().includes(query)),
    );
  }, [agentsQuery.data, company, search, projectTick, identityTick]);

  const handleAgentClick = async (agent: AgentProfile) => {
    const segments = segmentsFromRoster(channels, agent.id);
    const activeSegment = pickActiveSegment(segments);

    if (activeSegment) {
      await navigate({ to: `/channel/${activeSegment.id}` });
      return;
    }

    try {
      const created = await createChannel.mutateAsync([agent.id]);
      if (created?.id) {
        await queryClient.invalidateQueries({ queryKey: channelKeys.all });
        await navigate({ to: `/channel/${created.id}` });
      }
    } catch (err) {
      console.error("Could not create agent chat channel", err);
    }
  };

  const handleDropOnUnfiled = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!companyId) return;

    const agentId = e.dataTransfer.getData(DND_AGENT);
    if (agentId) {
      const proj = listProjects(companyId).find((p) => p.agentIds.includes(agentId));
      if (proj) {
        removeAgentsFromProject(proj.id, [agentId]);
      }
    }
  };

  const renderBotsList = () => (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_AGENT)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDropOnUnfiled}
      className={cn(
        "flex flex-col gap-0.5 w-full rounded-xl transition-colors",
        isDragOver && "ring-1 ring-primary/40 bg-sidebar-accent/50",
      )}
    >
      {ungroupedAgents.map((agent) => {
        const identity = getAgentIdentity(agent.id);
        const segments = segmentsFromRoster(channels, agent.id);
        const activeSegment = pickActiveSegment(segments);
        const unread = agentHasUnread(channels, agent.id);
        const isChatActive = activeSegment
          ? currentPath === `/channel/${activeSegment.id}`
          : false;

        const previewText =
          activeSegment?.lastMessage || agent.role || "Neues Gespräch";
        const timeText = activeSegment?.lastMessageAt
          ? relativeTime(activeSegment.lastMessageAt)
          : null;

        return (
          <BotContextMenu
            key={agent.id}
            bot={{ id: agent.id, name: agent.name }}
            companyId={company?.id ?? companyId}
          >
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_AGENT, agent.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => handleAgentClick(agent)}
              className={cn(
                "group/bot flex items-center justify-between gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
                isDesignV2
                  ? isChatActive
                    ? "bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] font-semibold shadow-[var(--p-shadow-sm)]"
                    : "text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-1)]"
                  : isChatActive
                    ? "bg-sidebar-accent text-white font-semibold"
                    : "hover:bg-sidebar-accent/60 text-zinc-200 hover:text-white",
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="relative shrink-0">
                  <AbstractAvatar
                    name={agent.name}
                    seed={agent.id}
                    agentId={agent.id}
                    className="size-6 rounded-md"
                  />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-1",
                      isDesignV2
                        ? "bg-[var(--p-success)] ring-[var(--p-bg)]"
                        : "bg-emerald-500 ring-background",
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        "text-xs font-medium truncate",
                        isDesignV2 ? "text-[var(--p-text-1)]" : "text-white",
                      )}
                    >
                      {identity?.slackHandle ? formatSlackHandle(identity.slackHandle) : agent.name}
                    </span>
                    {timeText ? (
                      <span
                        className={cn(
                          "text-[10px] shrink-0",
                          isDesignV2 ? "text-[var(--p-text-3)]" : "text-zinc-400",
                        )}
                      >
                        {timeText}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      "text-[11px] truncate leading-tight",
                      isDesignV2 ? "text-[var(--p-text-3)]" : "text-zinc-400",
                    )}
                  >
                    {previewText}
                  </p>
                </div>
              </div>

              {unread ? (
                <span
                  className={cn(
                    "size-2 rounded-full shrink-0 group-data-[collapsible=icon]:hidden",
                    isDesignV2 ? "bg-[var(--p-accent)]" : "bg-primary",
                  )}
                />
              ) : null}
            </div>
          </BotContextMenu>
        );
      })}

      {ungroupedAgents.length === 0 ? (
        isDesignV2 ? (
          <EmptyState
            icon={<IconRobot className="size-4" />}
            compact
            title={search.trim() ? "Kein Treffer" : "Keine Bots ohne Ordner"}
            description={search.trim() ? "Kein Bot entspricht der Suche." : "Alle Bots sind Ordnern zugewiesen."}
          />
        ) : (
          <div className="px-3 py-1.5 text-[11px] text-zinc-500 italic text-center rounded-lg border border-dashed border-white/10 group-data-[collapsible=icon]:hidden">
            {search.trim()
              ? "Kein Bot entspricht der Suche"
              : "Keine Bots ohne Ordner"}
          </div>
        )
      ) : null}
    </div>
  );

  return isDesignV2 ? (
    <SidebarSection
      title="WEITERE BOTS"
      badge={ungroupedAgents.length}
      collapsible
      defaultExpanded
      className="px-1"
    >
      {renderBotsList()}
    </SidebarSection>
  ) : (
    <SidebarGroup className="gap-0.5 p-0 px-2 py-1 w-full group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
      <SectionLabel>Weitere Bots ({ungroupedAgents.length})</SectionLabel>
      {renderBotsList()}
    </SidebarGroup>
  );
}

export default UnfiledBots;
