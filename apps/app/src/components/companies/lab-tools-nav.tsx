import {
  IconBrain,
  IconChartCandle,
  IconChartPie,
  IconComponents,
  IconDiamond,
  IconFolder,
  IconFolderPlus,
  IconHammer,
  IconNews,
  IconPlus,
  IconPlugConnected,
  IconSearch,
  IconStar,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { SidebarGroupLabel, SidebarMenuItem } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { moveIdBefore } from "@/lib/companies/sidebar-order";
import {
  addCustomLabApp,
  connectTool,
  createTabGroup,
  deleteTabGroup,
  disconnectTool,
  DND_LAB_APP,
  DND_LAB_GROUP,
  getConnection,
  getLevel3Browser,
  labAppsByGroup,
  LOVABLE_MCP_HINT,
  moveAppToGroup,
  removeAppFromGroups,
  removeCustomLabApp,
  reorderAppsInGroup,
  reorderTabGroups,
  resolveTabUrl,
  resolveLabEngine,
  runLocalWebSearch,
  selectLabApp,
  setTabGroupOpen,
  starSoftware,
  subscribeLevel3Browser,
  toolIconUrl,
  type LabApp,
  type Level3BrowserState,
} from "@/lib/companies/level3-tools";
import { openLabUrlInChrome } from "@/lib/ui/lab-prefs";
import {
  isDesktopApp,
  navigateDesktopBrowser,
} from "@/lib/desktop-bridge";
import { cn } from "@/lib/utils";

function openLabApp(companyId: string, appId: string): Level3BrowserState {
  const next = selectLabApp(companyId, appId);
  const url = resolveTabUrl(next);
  if (url) {
    navigateDesktopBrowser(url);
  }
  // Connect-Chrome (`full`) is the browser — when NOT in desktop app, open Host-Chrome.
  if (!isDesktopApp() && resolveLabEngine(next.engine) === "full") {
    if (url) void openLabUrlInChrome(url);
  }
  return next;
}

type GroupVisual = {
  icon: typeof IconFolder;
  accent: string;
  ring: string;
  pill: string;
  pillText: string;
};

const GROUP_VISUALS: Record<string, GroupVisual> = {
  "group-technische": {
    icon: IconChartCandle,
    accent: "from-sky-500/90 to-cyan-500/90",
    ring: "ring-sky-400/30",
    pill: "bg-sky-500/12 text-sky-600 dark:text-sky-300",
    pillText: "text-sky-700 dark:text-sky-200",
  },
  "group-fundamentals": {
    icon: IconChartPie,
    accent: "from-emerald-500/90 to-teal-500/90",
    ring: "ring-emerald-400/30",
    pill: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
    pillText: "text-emerald-700 dark:text-emerald-200",
  },
  "group-sentimentalle": {
    icon: IconNews,
    accent: "from-rose-500/90 to-pink-500/90",
    ring: "ring-rose-400/30",
    pill: "bg-rose-500/12 text-rose-600 dark:text-rose-300",
    pillText: "text-rose-700 dark:text-rose-200",
  },
  "group-sektorielle": {
    icon: IconComponents,
    accent: "from-amber-500/90 to-orange-500/90",
    ring: "ring-amber-400/30",
    pill: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    pillText: "text-amber-700 dark:text-amber-200",
  },
  "group-build": {
    icon: IconHammer,
    accent: "from-violet-500/90 to-indigo-500/90",
    ring: "ring-violet-400/30",
    pill: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
    pillText: "text-violet-700 dark:text-violet-200",
  },
  "group-ai": {
    icon: IconBrain,
    accent: "from-fuchsia-500/90 to-purple-500/90",
    ring: "ring-fuchsia-400/30",
    pill: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-300",
    pillText: "text-fuchsia-700 dark:text-fuchsia-200",
  },
};

const FALLBACK_VISUAL: GroupVisual = {
  icon: IconFolder,
  accent: "from-slate-500/80 to-slate-400/80",
  ring: "ring-slate-400/30",
  pill: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
  pillText: "text-slate-700 dark:text-slate-200",
};

function visualFor(groupId: string): GroupVisual {
  return GROUP_VISUALS[groupId] ?? FALLBACK_VISUAL;
}

const ChevronDownIcon = ({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) => (
  <svg
    aria-hidden
    className={cn(
      "size-3.5 shrink-0 text-sidebar-foreground/45 transition-transform duration-300 ease-out",
      open ? "rotate-0" : "-rotate-90",
      className,
    )}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.75}
    viewBox="0 0 24 24"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/**
 * Lab Browser sidebar — same folder UX as Messages Gruppen:
 * collapsible folders, drag apps between them, context menus.
 */
export function LabToolsNav({ companyId }: { companyId: string }) {
  const [state, setState] = useState(() => getLevel3Browser(companyId));
  const [connectId, setConnectId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    setState(getLevel3Browser(companyId));
    return subscribeLevel3Browser(() =>
      setState(getLevel3Browser(companyId)),
    );
  }, [companyId]);

  const { groups, ungrouped } = labAppsByGroup(state);

  const createFolder = () => {
    const name = window.prompt("Name der Gruppe?");
    if (!name?.trim()) return;
    setState(createTabGroup(companyId, name.trim()));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <form
        className="px-0.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!search.trim()) return;
          const next = runLocalWebSearch(companyId, search);
          setState(next);
          const url = resolveTabUrl(next);
          navigateDesktopBrowser(url);
        }}
      >
        <div className="relative">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-sidebar-foreground/35" />
          <Input
            className="h-8 border-sidebar-border bg-background pl-7 text-[12px] shadow-none"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Websearch (lokal)"
            value={search}
          />
        </div>
      </form>

      <div className="mb-1 min-h-0 flex-1 overflow-y-auto">
        <SidebarGroupLabel className="mb-0.5 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
          Gruppen
        </SidebarGroupLabel>

        {groups.length === 0 ? (
          <ContextMenu>
            <ContextMenuTrigger
              className="flex w-full cursor-default items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={createFolder}
            >
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-sky-100 text-sky-700 ring-1 ring-sky-200/80">
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
        ) : (
          <ul className="flex flex-col gap-0.5 px-0.5">
            {groups.map((group) => {
              const open = !group.collapsed;
              const folderDrop = dragOverId === `group:${group.id}`;
              const visual = visualFor(group.id);
              return (
                <li key={group.id}>
                  <ContextMenu>
                    <ContextMenuTrigger
                      className={cn(
                        "group/folder flex w-full cursor-grab items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent active:cursor-grabbing",
                        folderDrop && "bg-sidebar-accent ring-1 ring-sky-400/50",
                      )}
                      draggable
                      onClick={() =>
                        setState(
                          setTabGroupOpen(companyId, group.id, !open),
                        )
                      }
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DND_LAB_GROUP, group.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(event) => {
                        const types = [...event.dataTransfer.types];
                        if (
                          !types.includes(DND_LAB_GROUP) &&
                          !types.includes(DND_LAB_APP)
                        ) {
                          return;
                        }
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverId(`group:${group.id}`);
                      }}
                      onDragLeave={() =>
                        setDragOverId((id) =>
                          id === `group:${group.id}` ? null : id,
                        )
                      }
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragOverId(null);
                        const groupId = event.dataTransfer.getData(DND_LAB_GROUP);
                        const appId = event.dataTransfer.getData(DND_LAB_APP);
                        if (groupId) {
                          const ids = groups.map((g) => g.id);
                          setState(
                            reorderTabGroups(
                              companyId,
                              moveIdBefore(ids, groupId, group.id),
                            ),
                          );
                          return;
                        }
                        if (appId) {
                          setState(moveAppToGroup(companyId, appId, group.id));
                          setState(
                            setTabGroupOpen(companyId, group.id, true),
                          );
                        }
                      }}
                    >
                      <LabFolderIcon apps={group.apps} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium tracking-tight">
                          {group.label}
                        </span>
                      </span>
                      <span className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sidebar-foreground/10 px-1.5 text-[10px] font-semibold tabular-nums text-sidebar-foreground/60">
                        {group.apps.length}
                      </span>
                      <ChevronDownIcon open={open} className="ml-1" />
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-52 rounded-xl p-1.5">
                      <ContextMenuItem
                        className="gap-2 rounded-lg px-2.5 py-2"
                        onClick={() =>
                          setState(setTabGroupOpen(companyId, group.id, true))
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
                              `Gruppe „${group.label}“ wirklich löschen?`,
                            )
                          ) {
                            setState(deleteTabGroup(companyId, group.id));
                          }
                        }}
                      >
                        <IconTrash className="size-4" />
                        Gruppe löschen
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>

                  {open ? (
                    <ul
                      className={cn(
                        "mt-0.5 grid gap-0.5 pl-2 transition-all duration-300 ease-out",
                      )}
                    >
                      <div className="min-h-0 overflow-hidden">
                        {group.apps.length === 0 ? (
                          <li className="px-2 py-1.5 text-[11px] text-sidebar-foreground/35">
                            Leerer Ordner — App hierher ziehen
                          </li>
                        ) : (
                          group.apps.map((app) => (
                            <AppRow
                              app={app}
                              companyId={companyId}
                              dragOverId={dragOverId}
                              groupId={group.id}
                              key={`${group.id}-${app.id}`}
                              onChange={setState}
                              onConnect={setConnectId}
                              setDragOverId={setDragOverId}
                              state={state}
                            />
                          ))
                        )}
                      </div>
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {ungrouped.length > 0 ? (
          <div className="mt-3">
            <SidebarGroupLabel className="mb-0.5 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
              Weitere
            </SidebarGroupLabel>
            <ul className="flex flex-col gap-0.5 px-0.5">
              {ungrouped.map((app) => (
                <AppRow
                  app={app}
                  companyId={companyId}
                  dragOverId={dragOverId}
                  key={`ungrouped-${app.id}`}
                  onChange={setState}
                  onConnect={setConnectId}
                  setDragOverId={setDragOverId}
                  state={state}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {adding ? (
        <AddAppInline
          companyId={companyId}
          groupId={groups[0]?.id}
          onCancel={() => setAdding(false)}
          onDone={(next) => {
            setState(next);
            setAdding(false);
          }}
        />
      ) : (
        <div className="flex flex-col gap-0.5">
          <button
            className="mx-0.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-sidebar-foreground/45 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            onClick={() => setAdding(true)}
            type="button"
          >
            <IconPlus className="size-3.5" stroke={1.75} />
            App hinzufügen
          </button>
          <button
            className="mx-0.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-sidebar-foreground/45 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            onClick={createFolder}
            type="button"
          >
            <IconFolderPlus className="size-3.5" stroke={1.75} />
            Neue Gruppe
          </button>
        </div>
      )}

      {connectId ? (
        <ConnectInline
          companyId={companyId}
          existing={getConnection(state, connectId)}
          onClose={() => setConnectId(null)}
          onDone={(next) => {
            setState(next);
            setConnectId(null);
          }}
          toolId={connectId}
        />
      ) : null}
    </div>
  );
}

function AppRow({
  app,
  companyId,
  groupId,
  state,
  dragOverId,
  setDragOverId,
  onChange,
  onConnect,
}: {
  app: LabApp;
  companyId: string;
  groupId?: string;
  state: Level3BrowserState;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  onChange: (next: Level3BrowserState) => void;
  onConnect: (id: string) => void;
}) {
  const conn = getConnection(state, app.id);
  const active = !state.starred && state.activeTool === app.id;
  const dropKey = groupId
    ? `app:${groupId}:${app.id}`
    : `app:ungrouped:${app.id}`;
  const over = dragOverId === dropKey;

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger>
          <SidebarMenuItem>
            <button
              className={cn(
                "group/row flex h-auto w-full cursor-grab items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent active:cursor-grabbing",
                active && "bg-sidebar-accent/80 shadow-[inset_0_0_0_1px_var(--sidebar-border)]",
                over && "ring-1 ring-sky-400/50",
              )}
              draggable
              onClick={() => {
                const targetUrl = app.url || (getConnection(state, app.id)?.projectUrl);
                if (targetUrl) {
                  navigateDesktopBrowser(targetUrl);
                }
                onChange(openLabApp(companyId, app.id));
              }}
              onDragStart={(event) => {
                event.dataTransfer.setData(DND_LAB_APP, app.id);
                if (groupId) {
                  event.dataTransfer.setData(
                    "application/x-connect-lab-from-group",
                    groupId,
                  );
                }
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (![...event.dataTransfer.types].includes(DND_LAB_APP)) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                setDragOverId(dropKey);
              }}
              onDragLeave={() =>
                setDragOverId(dragOverId === dropKey ? null : dragOverId)
              }
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragOverId(null);
                const dragged = event.dataTransfer.getData(DND_LAB_APP);
                if (!dragged || !groupId) return;
                const fromGroup = event.dataTransfer.getData(
                  "application/x-connect-lab-from-group",
                );
                if (fromGroup && fromGroup !== groupId) {
                  onChange(moveAppToGroup(companyId, dragged, groupId));
                }
                const ids = [
                  ...(labAppsByGroup(getLevel3Browser(companyId)).groups.find(
                    (g) => g.id === groupId,
                  )?.appIds ?? []),
                ];
                if (!ids.includes(dragged)) ids.push(dragged);
                onChange(
                  reorderAppsInGroup(
                    companyId,
                    groupId,
                    moveIdBefore(ids, dragged, app.id),
                  ),
                );
              }}
              type="button"
            >
              <ToolGlyph icon={app.icon} tint={app.tint} />
              <span className="min-w-0 flex-1 truncate text-[13px] tracking-tight">
                {app.label}
              </span>
              {conn ? (
                <span
                  aria-label="Verbunden"
                  className="flex shrink-0 items-center"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button
                    aria-label={`${app.label} starten`}
                    className="rounded-md p-1 text-amber-500/80 transition-colors hover:text-amber-500"
                    onClick={() => onChange(starSoftware(companyId, app.id))}
                    title="★ Software starten"
                    type="button"
                  >
                    <IconStar className="size-3.5" stroke={1.5} />
                  </button>
                </span>
              ) : (
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-sidebar-foreground/25 transition-colors group-hover/row:bg-sidebar-foreground/50"
                />
              )}
            </button>
          </SidebarMenuItem>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-52 rounded-xl p-1.5">
          <ContextMenuItem
            className="gap-2 rounded-lg px-2.5 py-2"
            onClick={() => onChange(openLabApp(companyId, app.id))}
          >
            Öffnen
          </ContextMenuItem>
          {conn ? (
            <ContextMenuItem
              className="gap-2 rounded-lg px-2.5 py-2"
              onClick={() => onChange(starSoftware(companyId, app.id))}
            >
              <IconStar className="size-4" />
              ★ Software starten
            </ContextMenuItem>
          ) : app.builtin ? (
            <ContextMenuItem
              className="gap-2 rounded-lg px-2.5 py-2"
              onClick={() => onConnect(app.id)}
            >
              <IconPlugConnected className="size-4" />
              Connect
            </ContextMenuItem>
          ) : null}
          {groupId ? (
            <ContextMenuItem
              className="gap-2 rounded-lg px-2.5 py-2"
              onClick={() => onChange(removeAppFromGroups(companyId, app.id))}
            >
              <IconFolder className="size-4" />
              Aus Gruppe entfernen
            </ContextMenuItem>
          ) : null}
          {!app.builtin ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="gap-2 rounded-lg px-2.5 py-2 text-destructive focus:text-destructive"
                onClick={() =>
                  onChange(removeCustomLabApp(companyId, app.id))
                }
              >
                <IconTrash className="size-4" />
                App entfernen
              </ContextMenuItem>
            </>
          ) : conn ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="gap-2 rounded-lg px-2.5 py-2"
                onClick={() => onChange(disconnectTool(companyId, app.id))}
              >
                Trennen
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    </li>
  );
}

/**
 * Collapsed icon rail — show Ordner (folder tiles). Click opens apps in a
 * vertical row underneath, same idea as Unternehmen Gruppen.
 */
export function LabIconRail({
  companyId,
  className,
}: {
  companyId: string | null;
  className?: string;
}) {
  const [state, setState] = useState(() =>
    companyId ? getLevel3Browser(companyId) : null,
  );

  useEffect(() => {
    if (!companyId) return;
    setState(getLevel3Browser(companyId));
    return subscribeLevel3Browser(() =>
      setState(getLevel3Browser(companyId)),
    );
  }, [companyId]);

  if (!companyId || !state) return null;

  const { groups, ungrouped } = labAppsByGroup(state);

  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto pt-1 pb-2",
        className,
      )}
    >
      {groups.length === 0 && ungrouped.length === 0 ? (
        <span
          className="flex size-9 items-center justify-center rounded-[10px] bg-sky-100 text-sky-700 ring-1 ring-sky-200/80"
          title="Keine Gruppen"
        >
          <IconFolder className="size-4" />
        </span>
      ) : null}

      {groups.map((group) => {
        const open = !group.collapsed;
        const visual = visualFor(group.id);
        const FolderIcon = visual.icon;
        return (
          <div
            className={cn(
              "flex flex-col items-center gap-1",
              open && "mb-0.5",
            )}
            key={group.id}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    aria-expanded={open}
                    aria-label={`${group.label} · ${group.apps.length} Apps`}
                    className={cn(
                      "relative flex size-9 items-center justify-center overflow-hidden rounded-[10px] bg-gradient-to-br shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] ring-1 transition-transform duration-200 hover:scale-[1.04]",
                      visual.accent,
                      visual.ring,
                      open && "ring-2",
                    )}
                    onClick={() =>
                      setState(
                        setTabGroupOpen(companyId, group.id, !open),
                      )
                    }
                    type="button"
                  >
                    <FolderIcon
                      className="size-4 text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.25)]"
                      stroke={1.75}
                    />
                  </button>
                }
              />
              <TooltipContent side="right">
                <span className="font-medium">{group.label}</span>
                <span className="block text-[10px] text-background/70">
                  {group.apps.length} App
                  {group.apps.length === 1 ? "" : "s"}
                  {open ? " · offen" : " — klicken zum Öffnen"}
                </span>
              </TooltipContent>
            </Tooltip>

            {open ? (
              <ul className="flex flex-col items-center gap-1">
                {group.apps.length === 0 ? (
                  <li
                    className="size-1.5 rounded-full bg-sidebar-foreground/25"
                    title="Leerer Ordner"
                  />
                ) : (
                  group.apps.map((app) => {
                    const active =
                      !state.starred && state.activeTool === app.id;
                    return (
                      <li key={app.id}>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                aria-label={app.label}
                                className={cn(
                                  "flex size-8 items-center justify-center rounded-lg transition-colors",
                                  active
                                    ? "bg-sidebar-accent shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
                                    : "hover:bg-sidebar-accent/60",
                                )}
                                onClick={() =>
                                  setState(openLabApp(companyId, app.id))
                                }
                                type="button"
                              >
                                <ToolGlyph icon={app.icon} tint={app.tint} />
                              </button>
                            }
                          />
                          <TooltipContent side="right">
                            <span className="font-medium">{app.label}</span>
                            <span className="block text-[10px] text-background/70">
                              {group.label}
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      </li>
                    );
                  })
                )}
              </ul>
            ) : null}
          </div>
        );
      })}

      {ungrouped.length > 0 ? (
        <div className="mt-1 flex flex-col items-center gap-1">
          {groups.length > 0 ? (
            <span className="my-0.5 h-px w-5 bg-sidebar-border/80" />
          ) : null}
          {ungrouped.map((app) => {
            const active = !state.starred && state.activeTool === app.id;
            return (
              <Tooltip key={app.id}>
                <TooltipTrigger
                  render={
                    <button
                      aria-label={app.label}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg transition-colors",
                        active
                          ? "bg-sidebar-accent shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
                          : "hover:bg-sidebar-accent/60",
                      )}
                      onClick={() =>
                        setState(openLabApp(companyId, app.id))
                      }
                      type="button"
                    >
                      <ToolGlyph icon={app.icon} tint={app.tint} />
                    </button>
                  }
                />
                <TooltipContent side="right">{app.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function LabFolderIcon({ apps }: { apps: LabApp[] }) {
  const preview = apps.slice(0, 4);
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px]",
        "bg-gradient-to-b from-[#7ec8f5] to-[#3b9de0] shadow-sm ring-1 ring-black/10",
      )}
    >
      <span className="absolute inset-[3px] grid grid-cols-2 grid-rows-2 gap-[2px] overflow-hidden rounded-[7px] bg-white/25 p-[2px]">
        {Array.from({ length: 4 }).map((_, i) => {
          const app = preview[i];
          if (!app) {
            return (
              <span className="rounded-[3px] bg-white/35" key={`empty-${i}`} />
            );
          }
          return (
            <span
              className="flex items-center justify-center overflow-hidden rounded-[3px] bg-white/70"
              key={app.id}
            >
              <img
                alt=""
                className="size-2.5 object-contain"
                src={toolIconUrl(app.icon)}
              />
            </span>
          );
        })}
      </span>
    </span>
  );
}

function ToolGlyph({ icon, tint }: { icon: string; tint: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `${tint}18` }}
      >
        <IconDiamond
          className="size-3.5 text-sidebar-foreground/50"
          stroke={1.5}
        />
      </span>
    );
  }
  return (
    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-black/5">
      <img
        alt=""
        className="size-4 object-contain"
        onError={() => setFailed(true)}
        src={toolIconUrl(icon)}
      />
    </span>
  );
}

function AddAppInline({
  companyId,
  groupId,
  onCancel,
  onDone,
}: {
  companyId: string;
  groupId?: string;
  onCancel: () => void;
  onDone: (next: Level3BrowserState) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  return (
    <div className="space-y-2 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium">App-Symbol</p>
        <button
          className="text-[10px] text-sidebar-foreground/40 hover:text-sidebar-foreground"
          onClick={onCancel}
          type="button"
        >
          Abbrechen
        </button>
      </div>
      <Input
        className="h-7 border-sidebar-border bg-background text-[11px]"
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Name"
        value={label}
      />
      <Input
        className="h-7 border-sidebar-border bg-background text-[11px]"
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        value={url}
      />
      <Button
        className="h-7 w-full"
        disabled={!label.trim() || !url.trim()}
        onClick={() =>
          onDone(addCustomLabApp(companyId, { label, url, groupId }))
        }
        size="sm"
        type="button"
      >
        Hinzufügen
      </Button>
    </div>
  );
}

function ConnectInline({
  companyId,
  toolId,
  existing,
  onClose,
  onDone,
}: {
  companyId: string;
  toolId: string;
  existing?: ReturnType<typeof getConnection>;
  onClose: () => void;
  onDone: (next: Level3BrowserState) => void;
}) {
  const apps = labAppsByGroup(getLevel3Browser(companyId));
  const all = [...apps.groups.flatMap((g) => g.apps), ...apps.ungrouped];
  const preset = all.find((a: LabApp) => a.id === toolId);
  const [projectId, setProjectId] = useState(existing?.projectId ?? "");
  const [projectUrl, setProjectUrl] = useState(existing?.projectUrl ?? "");
  const [githubUrl, setGithubUrl] = useState(existing?.githubUrl ?? "");

  return (
    <div className="space-y-2 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium">Connect · {preset?.label}</p>
        <button
          className="text-[10px] text-sidebar-foreground/40 hover:text-sidebar-foreground"
          onClick={onClose}
          type="button"
        >
          Abbrechen
        </button>
      </div>
      <p className="text-[10px] text-sidebar-foreground/40">
        {toolId === "lovable"
          ? LOVABLE_MCP_HINT
          : "Projekt-URL + optional GitHub"}
      </p>
      <Input
        className="h-7 border-sidebar-border bg-background text-[11px]"
        onChange={(e) => setProjectId(e.target.value)}
        placeholder="Project ID"
        value={projectId}
      />
      <Input
        className="h-7 border-sidebar-border bg-background text-[11px]"
        onChange={(e) => setProjectUrl(e.target.value)}
        placeholder="Preview-URL"
        value={projectUrl}
      />
      <Input
        className="h-7 border-sidebar-border bg-background text-[11px]"
        onChange={(e) => setGithubUrl(e.target.value)}
        placeholder="GitHub"
        value={githubUrl}
      />
      <Button
        className="h-7 w-full gap-1"
        onClick={() => {
          onDone(
            connectTool(companyId, toolId, {
              projectId,
              projectUrl,
              githubUrl,
            }),
          );
        }}
        size="sm"
        type="button"
      >
        <IconPlugConnected className="size-3.5" />
        Connect
      </Button>
    </div>
  );
}
