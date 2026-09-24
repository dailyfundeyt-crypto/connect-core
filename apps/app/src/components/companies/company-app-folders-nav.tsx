import {
  IconFolder,
  IconFolderPlus,
  IconSettings,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  SidebarGroupLabel,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
} from "@/lib/channels/queries";
import {
  assignAgentsToProject,
  createProject,
  deleteProject,
  ensureSeedProjects,
  listProjects,
  removeAgentsFromProject,
  reorderProjectAgents,
  reorderProjects,
  subscribeProjects,
  type ConnectProject,
} from "@/lib/companies/projects";
import {
  getCompany,
  listCompanies,
  subscribeCompanies,
} from "@/lib/companies/store";
import {
  DND_AGENT,
  DND_PROJECT,
  moveIdBefore,
} from "@/lib/companies/sidebar-order";
import {
  getActiveLevel,
  subscribeLevel,
  type CompanyLevel,
} from "@/lib/companies/level";
import {
  getSiteMark,
  setSiteMarkAgent,
  subscribeSiteMark,
} from "@/lib/companies/site-mark";
import { cn } from "@/lib/utils";

const ACTIVE_KEY = "connect.activeCompanyId";

function readActiveCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

/**
 * Apple-style project folders — drag to reorder groups and bots.
 */
export function CompanyAppFoldersNav({
  searching,
}: {
  searching: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createChannel = useMutation(createChannelMutationOptions(queryClient));
  const agentsQuery = useQuery(agentListQueryOptions());
  const channels = useInfiniteQuery(channelListQueryOptions());
  const [companyId, setCompanyId] = useState<string | null>(() =>
    readActiveCompanyId(),
  );
  const [companies, setCompanies] = useState(() => listCompanies());
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [projects, setProjects] = useState<ConnectProject[]>([]);
  const [identityTick, setIdentityTick] = useState(0);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const { state: sidebarState } = useSidebar();
  const iconRail = sidebarState === "collapsed";
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

  useEffect(() => {
    return subscribeAgentIdentities(() => setIdentityTick((n) => n + 1));
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

  const company = companyId
    ? (getCompany(companyId) ?? companies.find((c) => c.id === companyId))
    : companies[0];

  const agentsById = useMemo(() => {
    void identityTick;
    const map = new Map<string, AgentProfile>();
    const all = agentsQuery.data ?? [];
    if (all.length > 0) ensureAgentIdentities(all);
    for (const agent of all) map.set(agent.id, agent);
    return map;
  }, [agentsQuery.data, identityTick]);

  useEffect(() => {
    if (!company) {
      setProjects([]);
      return;
    }
    ensureSeedProjects(company.id, company.agentIds);
    const refresh = () => setProjects(listProjects(company.id));
    refresh();
    return subscribeProjects(refresh);
  }, [company]);

  if (searching || !company) return null;

  const openAgent = async (agentId: string) => {
    if (level === 4 && company) {
      setSiteMarkAgent(company.id, agentId);
      return;
    }
    const existing = channels.data?.find((ch) =>
      ch.agentIds.includes(agentId),
    );
    if (existing) {
      await navigate({
        to: "/channel/$channelId",
        params: { channelId: existing.id },
      });
      return;
    }
    const channel = await createChannel.mutateAsync([agentId]);
    queryClient.setQueryData(channelKeys.detail(channel.id), channel);
    await navigate({
      to: "/channel/$channelId",
      params: { channelId: channel.id },
    });
  };

  const openAgentSettings = (agentId: string) => {
    void navigate({ to: "/agents", search: { agent: agentId } });
  };

  const createFolder = () => {
    if (!company) return;
    const name = window.prompt("Name der Gruppe?");
    if (!name?.trim()) return;
    const created = createProject({
      companyId: company.id,
      name: name.trim(),
      appFolder: "browser",
    });
    setOpenFolders((prev) => ({ ...prev, [created.id]: true }));
  };

  if (projects.length === 0) {
    return (
      <div className="mb-3 group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="mb-0.5 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
          Gruppen
        </SidebarGroupLabel>
        <ContextMenu>
          <ContextMenuTrigger
            className="flex w-full cursor-default items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={createFolder}
          >
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-sky-100 text-sky-700 ring-1 ring-sky-200/80 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800/60">
              <IconFolderPlus className="size-4" />
            </span>
            Neue Gruppe
          </ContextMenuTrigger>
          <ContextMenuContent className="min-w-52 rounded-xl p-1.5">
            <ContextMenuItem
              className="gap-2 rounded-lg px-2.5 py-2"
              onClick={createFolder}
            >
              <IconFolderPlus className="size-4" />
              Neue Gruppe
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <SidebarGroupLabel className="mb-0.5 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45 group-data-[collapsible=icon]:sr-only">
        Gruppen
      </SidebarGroupLabel>
      <ul className="flex flex-col gap-0.5 px-0.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        {projects.map((project) => {
          const open = openFolders[project.id] ?? false;
          const nested = project.agentIds
            .map((id) => agentsById.get(id))
            .filter((a): a is AgentProfile => Boolean(a));
          const folderDrop = dragOverId === `project:${project.id}`;
          return (
            <li
              className={cn(
                "group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center",
                iconRail && open && "mb-1",
              )}
              key={project.id}
            >
              <ContextMenu>
                <ContextMenuTrigger
                  className={cn(
                    "flex w-full cursor-grab items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-sidebar-accent active:cursor-grabbing",
                    "group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0",
                    folderDrop && "bg-sidebar-accent ring-1 ring-sky-400/50",
                    open && iconRail && "ring-1 ring-sky-400/60",
                  )}
                  draggable
                  onClick={() =>
                    setOpenFolders((prev) => ({
                      ...prev,
                      [project.id]: !open,
                    }))
                  }
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DND_PROJECT, project.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(event) => {
                    const types = [...event.dataTransfer.types];
                    if (
                      !types.includes(DND_PROJECT) &&
                      !types.includes(DND_AGENT)
                    ) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverId(`project:${project.id}`);
                  }}
                  onDragLeave={() =>
                    setDragOverId((id) =>
                      id === `project:${project.id}` ? null : id,
                    )
                  }
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOverId(null);
                    const projectId = event.dataTransfer.getData(DND_PROJECT);
                    const agentId = event.dataTransfer.getData(DND_AGENT);
                    if (projectId) {
                      const ids = projects.map((p) => p.id);
                      reorderProjects(
                        company.id,
                        moveIdBefore(ids, projectId, project.id),
                      );
                      return;
                    }
                    if (agentId) {
                      for (const other of projects) {
                        if (
                          other.id !== project.id &&
                          other.agentIds.includes(agentId)
                        ) {
                          removeAgentsFromProject(other.id, [agentId]);
                        }
                      }
                      assignAgentsToProject(project.id, [agentId]);
                      setOpenFolders((prev) => ({
                        ...prev,
                        [project.id]: true,
                      }));
                    }
                  }}
                  title={`${project.name} · ${nested.length} Agent${nested.length === 1 ? "" : "en"}${open ? " (offen)" : " — klicken zum Öffnen"}`}
                >
                  <AppleFolderIcon agents={nested} />
                  <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <span className="block truncate text-sm tracking-tight">
                      {project.name}
                    </span>
                    <span className="block truncate text-[11px] text-sidebar-foreground/45">
                      {nested.length} Agent
                      {nested.length === 1 ? "" : "en"}
                    </span>
                  </span>
                </ContextMenuTrigger>
                <ContextMenuContent className="min-w-52 rounded-xl p-1.5">
                  <ContextMenuItem
                    className="gap-2 rounded-lg px-2.5 py-2"
                    onClick={() =>
                      setOpenFolders((prev) => ({
                        ...prev,
                        [project.id]: true,
                      }))
                    }
                  >
                    <IconFolder className="size-4" />
                    Öffnen
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="gap-2 rounded-lg px-2.5 py-2"
                    onClick={createFolder}
                  >
                    <IconFolderPlus className="size-4" />
                    Neue Gruppe
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="gap-2 rounded-lg px-2.5 py-2 text-destructive focus:text-destructive"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Gruppe „${project.name}“ wirklich löschen?`,
                        )
                      ) {
                        deleteProject(project.id);
                      }
                    }}
                  >
                    <IconTrash className="size-4" />
                    Gruppe löschen
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {open && iconRail ? (
                <ul className="mt-1 flex flex-col items-center gap-1">
                  {nested.length === 0 ? (
                    <li
                      className="size-1.5 rounded-full bg-sidebar-foreground/25"
                      title="Leerer Ordner"
                    />
                  ) : (
                    nested.map((agent) => {
                      const identity = getAgentIdentity(agent.id);
                      const handle = formatSlackHandle(identity.slackHandle);
                      const tip = [
                        agent.name,
                        agent.title?.trim() || null,
                        handle || null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      const siteSelected =
                        level === 4 && siteAgentId === agent.id;
                      return (
                        <li key={`${project.id}-icon-${agent.id}`}>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  aria-label={tip}
                                  className={cn(
                                    "flex size-8 items-center justify-center overflow-hidden rounded-lg ring-1 ring-black/5 transition-colors hover:bg-sidebar-accent",
                                    siteSelected &&
                                      "ring-sky-400/70 bg-sky-50 dark:bg-sky-950/40",
                                  )}
                                  onClick={() => void openAgent(agent.id)}
                                  type="button"
                                >
                                  <AbstractAvatar
                                    agentId={agent.id}
                                    name={agent.name}
                                    seed={agent.avatarSeed}
                                    size={28}
                                  />
                                </button>
                              }
                            />
                            <TooltipContent side="right">
                              <span className="font-medium">{agent.name}</span>
                              {agent.title?.trim() ? (
                                <span className="block text-[10px] text-background/70">
                                  {agent.title.trim()}
                                </span>
                              ) : null}
                              {handle ? (
                                <span className="block text-[10px] text-background/70">
                                  {handle}
                                </span>
                              ) : null}
                              {level === 4 ? (
                                <span className="mt-0.5 block text-[10px] text-background/70">
                                  Für Firmenseiten-Auftrag wählen
                                </span>
                              ) : null}
                            </TooltipContent>
                          </Tooltip>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}

              {open && !iconRail ? (
                <ul className="mt-0.5 flex flex-col gap-0.5 pl-2">
                  {nested.length === 0 ? (
                    <li className="px-2 py-1.5 text-[11px] text-sidebar-foreground/35">
                      Leerer Ordner — Agent hierher ziehen
                    </li>
                  ) : (
                    nested.map((agent) => {
                      const identity = getAgentIdentity(agent.id);
                      const handle = formatSlackHandle(identity.slackHandle);
                      const agentDrop =
                        dragOverId === `agent:${project.id}:${agent.id}`;
                      const siteSelected =
                        level === 4 && siteAgentId === agent.id;
                      return (
                        <li key={`${project.id}-${agent.id}`}>
                          <ContextMenu>
                            <ContextMenuTrigger>
                              <SidebarMenuItem>
                                <SidebarMenuButton
                                  className={cn(
                                    "h-auto cursor-grab rounded-xl px-2 py-2 hover:bg-sidebar-accent active:cursor-grabbing",
                                    agentDrop &&
                                      "bg-sidebar-accent ring-1 ring-sky-400/50",
                                    siteSelected &&
                                      "bg-sky-50 ring-1 ring-sky-400/60 dark:bg-sky-950/40",
                                  )}
                                  draggable
                                  isActive={siteSelected}
                                  onClick={() => void openAgent(agent.id)}
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData(
                                      DND_AGENT,
                                      agent.id,
                                    );
                                    event.dataTransfer.setData(
                                      "application/x-connect-from-project",
                                      project.id,
                                    );
                                    event.dataTransfer.effectAllowed = "move";
                                  }}
                                  onDragOver={(event) => {
                                    if (
                                      ![...event.dataTransfer.types].includes(
                                        DND_AGENT,
                                      )
                                    ) {
                                      return;
                                    }
                                    event.preventDefault();
                                    event.stopPropagation();
                                    event.dataTransfer.dropEffect = "move";
                                    setDragOverId(
                                      `agent:${project.id}:${agent.id}`,
                                    );
                                  }}
                                  onDragLeave={() =>
                                    setDragOverId((id) =>
                                      id === `agent:${project.id}:${agent.id}`
                                        ? null
                                        : id,
                                    )
                                  }
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setDragOverId(null);
                                    const dragged =
                                      event.dataTransfer.getData(DND_AGENT);
                                    if (!dragged) return;
                                    const fromProject =
                                      event.dataTransfer.getData(
                                        "application/x-connect-from-project",
                                      );
                                    if (
                                      fromProject &&
                                      fromProject !== project.id
                                    ) {
                                      removeAgentsFromProject(fromProject, [
                                        dragged,
                                      ]);
                                      assignAgentsToProject(project.id, [
                                        dragged,
                                      ]);
                                    }
                                    const ids = [...project.agentIds];
                                    if (!ids.includes(dragged)) {
                                      ids.push(dragged);
                                    }
                                    reorderProjectAgents(
                                      project.id,
                                      moveIdBefore(ids, dragged, agent.id),
                                    );
                                  }}
                                >
                                  <AbstractAvatar
                                    agentId={agent.id}
                                    name={agent.name}
                                    seed={agent.avatarSeed}
                                    size={28}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm tracking-tight">
                                      {agent.name}
                                    </span>
                                    {handle ? (
                                      <span className="block truncate text-[11px] text-sidebar-foreground/45">
                                        {handle}
                                      </span>
                                    ) : null}
                                  </span>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="min-w-52 rounded-xl p-1.5">
                              <ContextMenuItem
                                className="gap-2 rounded-lg px-2.5 py-2"
                                onClick={() => void openAgent(agent.id)}
                              >
                                <IconUser className="size-4" />
                                Open chat
                              </ContextMenuItem>
                              <ContextMenuItem
                                className="gap-2 rounded-lg px-2.5 py-2"
                                onClick={() => openAgentSettings(agent.id)}
                              >
                                <IconSettings className="size-4" />
                                Agent settings
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                className="gap-2 rounded-lg px-2.5 py-2"
                                onClick={() =>
                                  removeAgentsFromProject(project.id, [
                                    agent.id,
                                  ])
                                }
                              >
                                <IconFolder className="size-4" />
                                Aus Gruppe entfernen
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** macOS-style folder: soft blue tile with a 2×2 avatar collage. */
function AppleFolderIcon({ agents }: { agents: AgentProfile[] }) {
  const preview = agents.slice(0, 4);
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px]",
        "bg-gradient-to-b from-[#7ec8f5] to-[#3b9de0] shadow-sm",
        "ring-1 ring-black/10 dark:from-sky-500 dark:to-sky-700",
      )}
    >
      <span className="absolute inset-[3px] grid grid-cols-2 grid-rows-2 gap-[2px] overflow-hidden rounded-[7px] bg-white/25 p-[2px]">
        {Array.from({ length: 4 }).map((_, i) => {
          const agent = preview[i];
          if (!agent) {
            return (
              <span
                className="rounded-[3px] bg-white/35"
                key={`empty-${i}`}
              />
            );
          }
          return (
            <span
              className="overflow-hidden rounded-[3px] bg-white/50"
              key={agent.id}
            >
              <AbstractAvatar
                agentId={agent.id}
                name={agent.name}
                seed={agent.avatarSeed}
                size={14}
              />
            </span>
          );
        })}
      </span>
    </span>
  );
}
