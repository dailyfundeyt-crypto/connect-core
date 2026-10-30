import { IconFolder, IconFolderPlus, IconTrash } from "@tabler/icons-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SidebarGroup } from "@/components/ui/sidebar";
import { BotContextMenu } from "@/v06/sidebar/BotContextMenu";
import {
  CountPill,
  FolderTile,
  GROUP_ROW_CLASS,
  RowChevron,
  RowName,
  SectionLabel,
} from "./group-row";
import {
  agentHasUnread,
  pickActiveSegment,
  segmentsFromRoster,
} from "@/lib/agents/agent-conversation";
import { formatSlackHandle, getAgentIdentity } from "@/lib/agents/agent-identity";
import { type AgentProfile, agentListQueryOptions } from "@/lib/agents/queries";
import { createChannelMutationOptions } from "@/lib/channels/mutations";
import { type ChannelSummary, channelKeys } from "@/lib/channels/queries";
import {
  assignAgentsToProject,
  createProject,
  deleteProject,
  listProjects,
  subscribeProjects,
  type ConnectProject,
} from "@/lib/companies/projects";
import {
  DND_AGENT,
  DND_PROJECT,
} from "@/lib/companies/sidebar-order";
import {
  getCompany,
  listCompanies,
  readActiveCompanyId,
  resolveCompanyId,
  subscribeCompanies,
} from "@/lib/companies/store";
import { SidebarSection, EmptyState } from "@/v06/design";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";

const COLLAPSED_STORAGE_KEY = "connect.sidebar.collapsedFolders";

export interface BotFoldersProps {
  channels?: readonly ChannelSummary[];
  search?: string;
}

export function BotFolders({ channels = [], search = "" }: BotFoldersProps) {
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const createChannel = useMutation(createChannelMutationOptions(queryClient));
  const agentsQuery = useQuery(agentListQueryOptions());
  const isDesignV2 = getFlag("designV2");

  const [companyId, setCompanyId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : resolveCompanyId(readActiveCompanyId()),
  );
  const [projectTick, setProjectTick] = useState(0);
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);

  // Collapsed state
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // New folder dialog
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  useEffect(() => {
    const sync = () => setCompanyId(resolveCompanyId(readActiveCompanyId()));
    window.addEventListener("connect-active-company", sync);
    const off = subscribeCompanies(sync);
    return () => {
      window.removeEventListener("connect-active-company", sync);
      off();
    };
  }, []);

  useEffect(() => {
    return subscribeProjects(() => setProjectTick((t) => t + 1));
  }, []);

  const projects: ConnectProject[] = useMemo(() => {
    void projectTick;
    if (!companyId) return [];
    return listProjects(companyId);
  }, [companyId, projectTick]);

  const agentMap = useMemo(() => {
    const map = new Map<string, AgentProfile>();
    for (const a of agentsQuery.data ?? []) {
      map.set(a.id, a);
    }
    return map;
  }, [agentsQuery.data]);

  const toggleFolder = (projectId: string) => {
    setCollapsedMap((prev) => {
      const next = { ...prev, [projectId]: !prev[projectId] };
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleCreateFolder = () => {
    if (!companyId || !newFolderName.trim()) return;
    createProject({ companyId, name: newFolderName.trim() });
    setNewFolderName("");
    setNewDialogOpen(false);
  };

  const handleDeleteFolder = (projectId: string) => {
    if (!companyId) return;
    deleteProject(projectId);
  };

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

  const handleDropAgentOnFolder = (e: React.DragEvent, targetProjectId: string) => {
    e.preventDefault();
    setDragOverProjectId(null);
    if (!companyId) return;

    const agentId = e.dataTransfer.getData(DND_AGENT);
    if (agentId) {
      assignAgentsToProject(targetProjectId, [agentId]);
    }
  };

  // Render content of folders
  const renderFoldersList = () => (
    <div className="flex flex-col gap-0.5 w-full">
      {projects.map((project) => {
        // Logische Optimierung: Bei aktiver Suche automatisch aufklappen, wenn Treffer vorhanden sind
        const hasSearch = Boolean(search.trim());
        const isCollapsed = hasSearch ? false : Boolean(collapsedMap[project.id]);
        const isDragOver = dragOverProjectId === project.id;

        // Filter bots by search query if present
        const folderAgents = project.agentIds
          .map((id) => agentMap.get(id))
          .filter((a): a is AgentProfile => Boolean(a))
          .filter((a) => {
            if (!search.trim()) return true;
            const q = search.trim().toLowerCase();
            return (
              a.name.toLowerCase().includes(q) ||
              (a.role && a.role.toLowerCase().includes(q))
            );
          });

        if (search.trim() && folderAgents.length === 0 && !project.name.toLowerCase().includes(search.trim().toLowerCase())) {
          return null;
        }

        return (
          <div
            key={project.id}
            className={cn(
              "group/folder flex flex-col rounded-xl transition-colors",
              isDragOver && "ring-1 ring-primary/40 bg-sidebar-accent/50",
            )}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DND_AGENT)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverProjectId(project.id);
              }
            }}
            onDragLeave={() => setDragOverProjectId(null)}
            onDrop={(e) => handleDropAgentOnFolder(e, project.id)}
            draggable
            onDragStart={(e) => {
              if (!e.dataTransfer.types.includes(DND_AGENT)) {
                e.dataTransfer.setData(DND_PROJECT, project.id);
                e.dataTransfer.effectAllowed = "move";
              }
            }}
          >
            {/* Folder Row */}
            <ContextMenu>
              <ContextMenuTrigger>
                <div
                  onClick={() => toggleFolder(project.id)}
                  title={project.name}
                  className={cn(
                    GROUP_ROW_CLASS,
                    isDesignV2 && "rounded-[var(--p-radius-md)] hover:bg-[var(--p-surface-2)] transition-colors",
                  )}
                >
                  <FolderTile
                    cells={project.agentIds
                      .map((id) => agentMap.get(id))
                      .filter((a): a is AgentProfile => Boolean(a))
                      .slice(0, 4)
                      .map((a) => (
                        <AbstractAvatar
                          key={a.id}
                          agentId={a.id}
                          name={a.name}
                          seed={a.id}
                          size={14}
                          className="rounded-[3px]"
                        />
                      ))}
                  />
                  <span className="flex min-w-0 flex-1 items-center group-data-[collapsible=icon]:hidden">
                    <RowName className={cn(isDesignV2 && "text-[var(--p-text-1)]")}>{project.name}</RowName>
                    <CountPill count={project.agentIds.length} />
                    <RowChevron open={!isCollapsed} />
                  </span>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent
                className={cn(
                  "w-44 p-1.5 shadow-xl",
                  isDesignV2
                    ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] backdrop-blur-md shadow-[var(--p-shadow-lg)]"
                    : "rounded-xl",
                )}
              >
                <ContextMenuItem
                  className={cn(
                    "gap-2 text-xs rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors",
                    isDesignV2
                      ? "text-[var(--p-danger)] hover:bg-[var(--p-danger-subtle)] hover:text-[var(--p-danger-hover)]"
                      : "text-destructive",
                  )}
                  onClick={() => handleDeleteFolder(project.id)}
                >
                  <IconTrash className="size-3.5" />
                  Ordner löschen
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>

            {/* Agents inside this folder (when expanded) */}
            {!isCollapsed && folderAgents.length > 0 ? (
              <div className="flex flex-col gap-0.5 pl-7 pr-1 py-0.5 group-data-[collapsible=icon]:pl-0 group-data-[collapsible=icon]:items-center">
                {folderAgents.map((agent) => {
                  const identity = getAgentIdentity(agent.id);
                  const segments = segmentsFromRoster(channels, agent.id);
                  const unread = agentHasUnread(channels, agent.id);
                  const activeSegment = pickActiveSegment(segments);
                  const isChatActive = activeSegment
                    ? currentPath === `/channel/${activeSegment.id}`
                    : false;

                  return (
                    <BotContextMenu
                      key={agent.id}
                      bot={{ id: agent.id, name: agent.name }}
                      companyId={companyId}
                    >
                      <div
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DND_AGENT, agent.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => handleAgentClick(agent)}
                        className={cn(
                          "group/bot flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors",
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
                          <div className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
                            <span className="truncate">
                              {identity?.slackHandle ? formatSlackHandle(identity.slackHandle) : agent.name}
                            </span>
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
              </div>
            ) : null}

            {!isCollapsed && folderAgents.length === 0 ? (
              <div
                className={cn(
                  "pl-[3.25rem] pr-2 py-1.5 text-[11px] italic group-data-[collapsible=icon]:hidden",
                  isDesignV2 ? "text-[var(--p-text-dim)]" : "text-sidebar-foreground/40",
                )}
              >
                (Ordner leer – Bot hierher ziehen)
              </div>
            ) : null}
          </div>
        );
      })}

      {projects.length === 0 ? (
        isDesignV2 ? (
          <EmptyState
            icon={<IconFolder className="size-4" />}
            compact
            title="Keine Ordner"
            description="Ordner strukturieren Bots nach Thema oder Team."
          />
        ) : (
          <div className="px-2 py-2 text-xs text-sidebar-foreground/45 italic text-center rounded-lg border border-dashed border-sidebar-border/50 group-data-[collapsible=icon]:hidden">
            Keine Ordner angelegt.
          </div>
        )
      ) : null}
    </div>
  );

  return (
    <>
      {isDesignV2 ? (
        <SidebarSection
          title="BOT-ORDNER"
          badge={projects.length}
          collapsible
          defaultExpanded
          action={
            <button
              type="button"
              onClick={() => setNewDialogOpen(true)}
              className="p-1 rounded-[var(--p-radius-sm)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)] transition-colors"
              title="Neuer Bot-Ordner"
            >
              <IconFolderPlus className="size-3.5" />
            </button>
          }
          className="px-1"
        >
          {renderFoldersList()}
        </SidebarSection>
      ) : (
        <SidebarGroup className="gap-0.5 p-0 px-2 py-1 w-full group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
          <SectionLabel
            action={
              <button
                type="button"
                onClick={() => setNewDialogOpen(true)}
                className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                title="Neuer Bot-Ordner"
              >
                <IconFolderPlus className="size-3.5" />
              </button>
            }
          >
            Bot-Ordner ({projects.length})
          </SectionLabel>

          {renderFoldersList()}
        </SidebarGroup>
      )}

      {/* Dialog for creating a new folder */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent
          className={cn(
            "max-w-sm p-5 shadow-2xl",
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] shadow-[var(--p-shadow-lg)]"
              : "rounded-2xl bg-card border-sidebar-border",
          )}
        >
          <DialogHeader>
            <DialogTitle
              className={cn(
                "flex items-center gap-2 text-base font-semibold",
                isDesignV2 && "text-[var(--p-text-1)]",
              )}
            >
              <IconFolderPlus
                className={cn(
                  "size-5",
                  isDesignV2 ? "text-[var(--p-warning)]" : "text-amber-400",
                )}
              />
              Neuen Bot-Ordner anlegen
            </DialogTitle>
            <DialogDescription
              className={cn(
                "text-xs",
                isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
              )}
            >
              Ordner strukturieren Bots nach Thema, Team oder Workflow.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="py-3">
            <Input
              autoFocus
              placeholder="Ordnername (z. B. Research, Trading, DevOps)"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
              }}
              className={cn(
                "text-xs h-9",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] bg-[var(--p-surface-1)] border-[var(--p-border)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-dim)] focus-visible:border-[var(--p-accent)]"
                  : "rounded-xl",
              )}
            />
          </DialogBody>
          <DialogFooter className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "text-xs",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                  : "rounded-xl",
              )}
              onClick={() => setNewDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              size="sm"
              className={cn(
                "text-xs",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] bg-[var(--p-accent)] hover:bg-[var(--p-accent-hover)] text-[var(--p-text-on-accent)] font-medium shadow-[var(--p-shadow-sm)]"
                  : "rounded-xl",
              )}
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
            >
              Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BotFolders;
