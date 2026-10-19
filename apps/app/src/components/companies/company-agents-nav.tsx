import { IconBuilding, IconSettings, IconUser } from "@tabler/icons-react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  agentHasUnread,
  pickActiveSegment,
  segmentsFromRoster,
} from "@/lib/agents/agent-conversation";
import { useEffect, useMemo, useState } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  SidebarGroupLabel,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  ensureAgentIdentities,
  formatSlackHandle,
  getAgentIdentity,
  subscribeAgentIdentities,
} from "@/lib/agents/agent-identity";
import {
  type AgentProfile,
  agentListQueryOptions,
} from "@/lib/agents/queries";
import { createChannelMutationOptions } from "@/lib/channels/mutations";
import {
  channelKeys,
  channelListQueryOptions,
  type ChannelSummary,
} from "@/lib/channels/queries";
import { listProjects, subscribeProjects } from "@/lib/companies/projects";
import {
  applyIdOrder,
  DND_AGENT,
  getAgentSidebarOrder,
  moveIdBefore,
  setAgentSidebarOrder,
  subscribeSidebarOrder,
} from "@/lib/companies/sidebar-order";
import {
  getCompany,
  listCompanies,
  moveAgentToCompany,
  readActiveCompanyId as readStoredActiveCompanyId,
  resolveCompanyId,
  subscribeCompanies,
} from "@/lib/companies/store";
import {
  getActiveLevel,
  subscribeLevel,
  type CompanyLevel,
} from "@/lib/companies/level";
import { setSiteMarkAgent, getSiteMark, subscribeSiteMark } from "@/lib/companies/site-mark";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

/*
 * Read the active company id the same way every write path expects it: normalized, and falling
 * back to a company that actually exists. This file used its own raw reader, so a JSON-quoted
 * value in localStorage made `getCompany(...)` miss and the whole Agents section render as empty
 * while the company was plainly open in the URL bar.
 */
function readActiveCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return resolveCompanyId(readStoredActiveCompanyId());
}

/**
 * Stable online heuristic — agents are deterministic seeds, so we hash the
 * id once and pick ~70% of coworkers as online. The result is stable across
 * renders and matches what users expect from a sidebar status dot.
 */
function isAgentOnline(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 10 < 7;
}

/**
 * Company Agents — only agents that belong to this company and are not
 * already nested in a Gruppe. Other / owned bots live under Marketplace → Meine Bots.
 *
 * oneconv: jeder Agent führt genau ein durchgehendes Gespräch. Die Sidebar
 * zeigt jeden Agent mit der letzten Nachricht (oder "Neues Gespräch") als
 * Vorschau. Eine separate "Channels"- oder "Gespräche"-Sektion gibt es
 * nicht mehr, sonst stünde der gleiche Chat zweimal in der Liste.
 */
export function CompanyAgentsNav({
  searching,
  query = "",
  channels: channelsProp,
}: {
  searching: boolean;
  /** oneconv: the sidebar search, so it finds agents now that there is no channel list. */
  query?: string;
  /**
   * Optional: vom Caller gefilterte Channels (z. B. nur die Channels dieser
   * Company). Wenn nicht übergeben, holt die Komponente sie selbst.
   * Wir nehmen die gefilterten Channels vom AppSidebar-Caller, damit jeder
   * Agent-Zeile eindeutig "sein" Gespräch aus companyChannels findet und
   * wir keine separaten Queries doppelt halten.
   */
  channels?: readonly import("@/lib/channels/queries").ChannelSummary[];
}) {
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const createChannel = useMutation(createChannelMutationOptions(queryClient));
  const agentsQuery = useQuery(agentListQueryOptions());
  const channelsQuery = useInfiniteQuery(channelListQueryOptions());
  // Caller darf die schon nach Company gefilterte Liste durchreichen, damit
  // die unread-Marker zu den sichtbaren Channels passen. Ohne Caller nehmen
  // wir das, was die Sidebar-Query gerade hält.
  const channels = {
    data: channelsProp ?? channelsQuery.data,
  };
  const [companyId, setCompanyId] = useState<string | null>(() =>
    readActiveCompanyId(),
  );
  const [companies, setCompanies] = useState(() => listCompanies());
  const [projectTick, setProjectTick] = useState(0);
  const [identityTick, setIdentityTick] = useState(0);
  const [orderTick, setOrderTick] = useState(0);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  /**
   * Which bot is being moved, and where it failed. Both are transient feedback on a mutation that
   * writes to localStorage: a move can fail because the target company was deleted in another tab,
   * and a silent no-op here reads as "the drop did not register" rather than as an error.
   */
  const [moveError, setMoveError] = useState<string | null>(null);
  const [movingAgentId, setMovingAgentId] = useState<string | null>(null);
  const [level, setLevel] = useState<CompanyLevel>(() => getActiveLevel());
  const [siteAgentId, setSiteAgentId] = useState<string | null>(() =>
    companyId ? getSiteMark(companyId).agentId : null,
  );

  useEffect(() => {
    const sync = () => {
      setCompanyId(readActiveCompanyId());
      setCompanies(listCompanies());
    };
    sync();
    window.addEventListener("connect-active-company", sync);
    const off = subscribeCompanies(() => {
      setCompanies(listCompanies());
      setCompanyId(readActiveCompanyId());
    });
    return () => {
      window.removeEventListener("connect-active-company", sync);
      off();
    };
  }, []);

  useEffect(() => subscribeLevel(() => setLevel(getActiveLevel())), []);

  useEffect(() => {
    if (!companyId) {
      setSiteAgentId(null);
      return;
    }
    setSiteAgentId(getSiteMark(companyId).agentId);
    return subscribeSiteMark(() =>
      setSiteAgentId(getSiteMark(companyId).agentId),
    );
  }, [companyId]);

  useEffect(() => {
    return subscribeProjects(() => setProjectTick((n) => n + 1));
  }, []);

  useEffect(() => {
    return subscribeAgentIdentities(() => setIdentityTick((n) => n + 1));
  }, []);

  useEffect(() => {
    return subscribeSidebarOrder(() => setOrderTick((n) => n + 1));
  }, []);

  const company = companyId
    ? (getCompany(companyId) ?? companies.find((c) => c.id === companyId))
    : companies[0];

  const roster = useMemo(() => {
    void projectTick;
    void identityTick;
    void orderTick;
    const all = agentsQuery.data ?? [];
    if (all.length > 0) ensureAgentIdentities(all);

    if (!company) {
      return {
        matches: [] as AgentProfile[],
        ungrouped: [] as AgentProfile[],
        companyAgentCount: 0,
        groupedCount: 0,
      };
    }

    const companyIds = new Set(company.agentIds);
    const inProjects = new Set(
      listProjects(company.id).flatMap((p) => p.agentIds),
    );

    // Only this company's agents — never marketplace / other-company bots.
    const companyAgents = all.filter((a) => companyIds.has(a.id));
    const ungrouped = companyAgents.filter((a) => !inProjects.has(a.id));
    const preferred = getAgentSidebarOrder(company.id);
    const orderedIds = applyIdOrder(
      ungrouped.map((a) => a.id),
      preferred,
    );
    const byId = new Map(ungrouped.map((a) => [a.id, a]));
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((a): a is AgentProfile => Boolean(a));

    return {
      matches: companyAgents,
      ungrouped: ordered,
      companyAgentCount: companyAgents.length,
      groupedCount: companyAgents.length - ungrouped.length,
    };
  }, [agentsQuery.data, company, projectTick, identityTick, orderTick]);

  const needle = query.trim().toLowerCase();
  const searchHits = searching
    ? roster.matches.filter(
        (a) => a.name.toLowerCase().includes(needle) || (a.title ?? "").toLowerCase().includes(needle),
      )
    : [];
  if (searching && searchHits.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden">
        Kein Agent heißt „{query.trim()}“.
      </p>
    );
  }

  if (agentsQuery.isPending && roster.companyAgentCount === 0) {
    return (
      <div className="mb-2 group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="mb-0.5 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
          Agenten
        </SidebarGroupLabel>
        <p className="px-2 py-1 text-xs text-sidebar-foreground/35">
          Agenten werden geladen…
        </p>
      </div>
    );
  }

  if (roster.ungrouped.length === 0 && !searching) {
    return (
      <div className="mb-2 group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="mb-0.5 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
          Agenten
        </SidebarGroupLabel>
        <p className="px-2 py-1 text-xs text-sidebar-foreground/35">
          {agentsQuery.isError
            ? "Agenten konnten nicht geladen werden."
            : roster.companyAgentCount > 0
              ? "Alle Company-Agents sind Gruppen zugeordnet."
              : "Noch keine Agents in dieser Company. Andere Bots: Marketplace → Meine Bots."}
        </p>
      </div>
    );
  }

  const openAgent = async (agent: AgentProfile) => {
    // Unternehmen: select agent for site mark → task (stay on page).
    if (level === 4 && company) {
      setSiteMarkAgent(company.id, agent.id);
      return;
    }
    const { isDesktopApp, navigateDesktopBrowser } = await import(
      "@/lib/desktop-bridge"
    );
    // oneconv: a click on an agent opens its one conversation (no channel to choose).
    // Im Web-Frontend: vorher sicherstellen, dass es für diesen Agent ein
    // dauerhaftes Gespräch gibt (legt eins an, falls keins existiert) — so
    // taucht die Unterhaltung in der Sidebar-Roster auf und ein zweiter
    // Klick führt zurück ins gleiche Gespräch.
    if (!isDesktopApp()) {
      try {
        const channel = await createChannel.mutateAsync([agent.id]);
        queryClient.setQueryData(channelKeys.detail(channel.id), channel);
        void queryClient.invalidateQueries({ queryKey: channelKeys.list() });
      } catch (err) {
        // Server-Fehler beim Anlegen ist nicht blockierend — die Route
        // `/agent/$agentId` würde ohnehin selbst ein Gespräch anlegen.
        console.warn("[company-agents-nav] ensure channel failed:", err);
      }
      await navigate({ to: "/agent/$agentId", params: { agentId: agent.id } });
      return;
    }
    const channel = await createChannel.mutateAsync([agent.id]);
    queryClient.setQueryData(channelKeys.detail(channel.id), channel);
    if (isDesktopApp()) {
      navigateDesktopBrowser(`http://localhost:3010/channel/${channel.id}`);
      return;
    }
    await navigate({
      to: "/channel/$channelId",
      params: { channelId: channel.id },
    });
  };

  const persistOrder = (draggedId: string, targetId: string) => {
    if (!company) return;
    const ids = roster.ungrouped.map((a) => a.id);
    setAgentSidebarOrder(
      company.id,
      moveIdBefore(ids, draggedId, targetId),
    );
  };

  /**
   * Move this bot to another company's roster.
   *
   * Removes it from every company that lists it first — a bot on two rosters has no single owner,
   * and which one wins would depend on which sidebar happened to be open. Errors are surfaced as
   * a message rather than logged: the write is localStorage, so a failure leaves the bot exactly
   * where it was and the user would otherwise think the menu item was broken.
   */
  const moveToCompany = async (agentId: string, targetId: string) => {
    if (!company || targetId === company.id) return;
    setMovingAgentId(agentId);
    setMoveError(null);
    try {
      await moveAgentToCompany(agentId, targetId);
    } catch (err) {
      console.error("[company-agents-nav] move failed:", err);
      setMoveError(
        `Konnte nicht zu ${
          companies.find((c) => c.id === targetId)?.name ?? targetId
        } verschoben werden.`,
      );
    } finally {
      setMovingAgentId(null);
    }
  };

  /**
   * Letzte Nachricht pro Agent — kommt aus dem aktiven Segment (das
   * jüngste live Segment dieses Agenten). Ein Agent ohne Gespräch zeigt
   * "Neues Gespräch", damit klar ist, dass der Klick es anlegt.
   */
  const previewByAgent = useMemo(() => {
    const list = channels.data ?? [];
    const map = new Map<string, { lastMessage: string; lastMessageAt: string }>();
    for (const agent of roster.ungrouped) {
      const segments = segmentsFromRoster(list, agent.id);
      const active = pickActiveSegment(segments);
      if (active?.lastMessage && active.lastMessageAt) {
        map.set(agent.id, {
          lastMessage: active.lastMessage,
          lastMessageAt: active.lastMessageAt,
        });
      }
    }
    return map;
  }, [channels.data, roster.ungrouped]);

  /** Companies this bot could move to: every company except the one it is on now. */
  const moveTargets = (agentId: string) =>
    companies.filter((c) => !c.agentIds.includes(agentId));

  const renderRow = (agent: AgentProfile) => {
    const identity = getAgentIdentity(agent.id);
    const handle = formatSlackHandle(identity.slackHandle);
    const over = dragOverId === agent.id;
    const siteSelected = level === 4 && siteAgentId === agent.id;
    const online = isAgentOnline(agent.id);
    return (
      <SidebarMenuItem
        className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center"
        key={agent.id}
      >
        <ContextMenu>
          <ContextMenuTrigger className="block w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center">
            <SidebarMenuButton
              className={cn(
                "h-auto cursor-grab rounded-xl px-2 py-1.5 transition-colors hover:bg-sidebar-accent active:cursor-grabbing",
                "group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:shrink-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:overflow-hidden group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:p-0!",
                over && "bg-sidebar-accent ring-1 ring-sky-400/50",
                siteSelected &&
                  "bg-sky-50 ring-1 ring-sky-400/60 dark:bg-sky-950/40",
              )}
              draggable
              isActive={siteSelected || currentPath === `/agent/${agent.id}`}
              onClick={() => void openAgent(agent)}
              onDragStart={(event) => {
                event.dataTransfer.setData(DND_AGENT, agent.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (![...event.dataTransfer.types].includes(DND_AGENT)) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverId(agent.id);
              }}
              onDragLeave={() =>
                setDragOverId((id) => (id === agent.id ? null : id))
              }
              onDrop={(event) => {
                event.preventDefault();
                setDragOverId(null);
                const dragged = event.dataTransfer.getData(DND_AGENT);
                if (dragged) persistOrder(dragged, agent.id);
              }}
              title={
                level === 4
                  ? `${agent.name} — für Firmenseiten-Auftrag wählen`
                  : `${agent.name} · ${online ? "online" : "offline"}`
              }
              tooltip={
                agent.title?.trim()
                  ? `${agent.name} · ${agent.title.trim()} · ${online ? "online" : "offline"}`
                  : `${agent.name} · ${online ? "online" : "offline"}`
              }
            >
              <span className="relative shrink-0">
                <AbstractAvatar
                  agentId={agent.id}
                  name={agent.name}
                  seed={agent.avatarSeed}
                  size={28}
                />
                <span
                  aria-hidden
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-sidebar",
                    online
                      ? "bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
                      : "bg-slate-400 dark:bg-slate-500",
                  )}
                />
              </span>
              <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <span className="flex items-center gap-1.5">
                  <span className="block truncate text-[13px] font-medium tracking-tight">
                    {agent.name}
                  </span>
                  {agentHasUnread(channels.data, agent.id) && currentPath !== `/agent/${agent.id}` ? (
                    <span aria-label="Neue Nachricht" className="size-2 shrink-0 rounded-full bg-sky-400" data-testid="agent-unread" />
                  ) : null}
                  {siteSelected ? (
                    <span className="inline-flex h-4 items-center rounded-full bg-sky-500/15 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                      Site
                    </span>
                  ) : null}
                </span>
                {(() => {
                  const preview = previewByAgent.get(agent.id);
                  if (preview) {
                    return (
                      <span
                        className={cn(
                          "block truncate text-[11px]",
                          agentHasUnread(channels.data, agent.id)
                            ? "font-medium text-foreground/90"
                            : "text-sidebar-foreground/45",
                        )}
                      >
                        {preview.lastMessage}
                      </span>
                    );
                  }
                  if (handle) {
                    return (
                      <span className="block truncate text-[11px] text-sidebar-foreground/45">
                        {handle}
                      </span>
                    );
                  }
                  return (
                    <span className="block truncate text-[11px] italic text-sidebar-foreground/35">
                      Neues Gespräch
                    </span>
                  );
                })()}
              </span>
              <span
                aria-hidden
                className={cn(
                  "ml-auto hidden shrink-0 text-[10px] tabular-nums text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden",
                )}
              >
                {(() => {
                  const preview = previewByAgent.get(agent.id);
                  return preview ? relativeTime(preview.lastMessageAt) : "";
                })()}
              </span>
            </SidebarMenuButton>
          </ContextMenuTrigger>
          <ContextMenuContent className="min-w-52 rounded-xl p-1.5">
            <ContextMenuItem
              className="gap-2 rounded-lg px-2.5 py-2"
              onClick={() => void openAgent(agent)}
            >
              <IconUser className="size-4" />
              Open chat
            </ContextMenuItem>
            <ContextMenuItem
              className="gap-2 rounded-lg px-2.5 py-2"
              onClick={async () => {
                const { isDesktopApp, navigateDesktopBrowser } = await import(
                  "@/lib/desktop-bridge"
                );
                if (isDesktopApp()) {
                  navigateDesktopBrowser(
                    `http://localhost:3010/agents?agent=${agent.id}&tab=mine`,
                  );
                  return;
                }
                void navigate({
                  to: "/agents",
                  search: { agent: agent.id, tab: "mine" },
                });
              }}
            >
              <IconSettings className="size-4" />
              Agent settings
            </ContextMenuItem>
            {moveTargets(agent.id).map((target) => (
              <ContextMenuItem
                className="gap-2 rounded-lg px-2.5 py-2"
                disabled={movingAgentId === agent.id}
                key={target.id}
                onClick={() => void moveToCompany(agent.id, target.id)}
              >
                <IconBuilding className="size-4" />
                Verschieben nach {target.name}
              </ContextMenuItem>
            ))}
          </ContextMenuContent>
        </ContextMenu>
      </SidebarMenuItem>
    );
  };

  return (
    <div className="mb-2 w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
      <SidebarGroupLabel className="mb-0.5 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45 group-data-[collapsible=icon]:sr-only">
        Agenten
      </SidebarGroupLabel>
      <ul className="flex w-full min-w-0 flex-col gap-0.5 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1" data-testid="agents-menu">
        {(searching ? searchHits : roster.ungrouped).map(renderRow)}
      </ul>
      {moveError ? (
        <p className="mt-1 px-2 text-[11px] text-destructive group-data-[collapsible=icon]:hidden">
          {moveError}
        </p>
      ) : null}
    </div>
  );
}
