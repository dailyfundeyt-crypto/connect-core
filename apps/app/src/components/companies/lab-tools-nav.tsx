import {
  IconArrowBarDown,
  IconArrowBarUp,
  IconArrowDown,
  IconArrowUp,
  IconBrain,
  IconChartCandle,
  IconChartPie,
  IconComponents,
  IconDiamond,
  IconFileText,
  IconFolder,
  IconFolderPlus,
  IconHammer,
  IconLayoutColumns,
  IconPencil,
  IconNews,
  IconPlus,
  IconPlugConnected,
  IconSearch,
  IconStar,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  moveIdBefore,
  moveIdToEnd,
  moveIdToSlot,
  moveIdToStart,
} from "@/lib/companies/sidebar-order";
import {
  addCustomLabApp,
  connectTool,
  createTabGroup,
  deleteTabGroup,
  disconnectTool,
  DND_LAB_APP,
  DND_LAB_GROUP,
  DND_VAULT_NOTE,
  getConnection,
  getLevel3Browser,
  labAppsByGroup,
  linkVaultNoteToGroup,
  LOVABLE_MCP_HINT,
  moveAppToGroup,
  removeAppFromGroups,
  removeCustomLabApp,
  reorderAppsInGroup,
  reorderTabGroups,
  resolveTabUrl,
  runLocalWebSearch,
  selectLabApp,
  setTabGroupOpen,
  starSoftware,
  subscribeLevel3Browser,
  toolIconUrl,
  unstarToBrowser,
  type LabApp,
  type Level3BrowserState,
  localWebSearchUrl,
  resolveLabApp,
  updateCustomLabApp,
  allLabApps,
} from "@/lib/companies/level3-tools";
import { openInHeliumTab, openSplitInHelium } from "@/lib/ui/open-window";
import { NotesSidebarSection } from "@/components/companies/notes-sidebar-section";
import { NewFolderDialog } from "@/components/companies/notes-sidebar-section";
import {
  getOpenVaultPath,
  setOpenVaultPath,
  subscribeNotes,
} from "@/lib/companies/notes";
import { BookmarkTransfer } from "@/components/companies/lab-bookmark-transfer";
import {
  isDesktopApp,
  navigateDesktopBrowser,
} from "@/lib/desktop-bridge";
import { cn } from "@/lib/utils";

function openLabApp(companyId: string, appId: string): Level3BrowserState {
  // Outside Connect Desktop (Helium / normal browser): open the app as a NEW Helium tab (or focus
  // the tab that already shows it) and leave Connect exactly as it is — no state change, no
  // in-app preview/iframe page.
  if (!isDesktopApp()) {
    const prev = getLevel3Browser(companyId);
    const app = resolveLabApp(prev, appId);
    // Split-Link: both URLs side by side (left / right half), see openSplitInHelium.
    if (app?.kind === "split" && app.url && app.url2) {
      openSplitInHelium(app.url, app.url2);
      return prev;
    }
    const url =
      getConnection(prev, appId)?.projectUrl?.trim() || app?.url?.trim();
    if (url) openInHeliumTab(url);
    return prev;
  }
  const next = selectLabApp(companyId, appId);
  const url = resolveTabUrl(next);
  if (url) {
    navigateDesktopBrowser(url);
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
  /** Own app / Split-Link being edited (Rechtsklick › Bearbeiten). */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  /*
   * Used by "Neue Notiz" to land the file in the Brain rather than the
   * browser's localStorage. The Brain tree is query-cached; once a file lands
   * there, this client tells the cache so the sidebar re-reads.
   */
  const queryClient = useQueryClient();

  const [openVaultPath, setOpenVaultPathState] = useState<string | null>(() =>
    getOpenVaultPath(companyId),
  );

  useEffect(() => {
    setOpenVaultPathState(getOpenVaultPath(companyId));
    return subscribeNotes(() =>
      setOpenVaultPathState(getOpenVaultPath(companyId)),
    );
  }, [companyId]);

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
          if (!isDesktopApp()) {
            // Helium: search opens as a new tab, Connect stays unchanged.
            openInHeliumTab(localWebSearchUrl(search));
            return;
          }
          const next = runLocalWebSearch(companyId, search);
          setState(next);
          navigateDesktopBrowser(resolveTabUrl(next));
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
            {groups.map((group, groupIndex) => {
              const open = !group.collapsed;
              const folderDrop = dragOverId === `group:${group.id}`;
              const isOverGroup = dragOverGroup?.id === group.id;
              const isOverBefore = isOverGroup && dragOverGroup.position === "before";
              const isOverAfter = isOverGroup && dragOverGroup.position === "after";
              const visual = visualFor(group.id);
              return (
                <li
                  key={group.id}
                  className={cn(
                    "relative transition-all",
                    isOverBefore &&
                      "before:absolute before:-top-[2px] before:left-1 before:right-1 before:h-[3px] before:rounded-full before:bg-sky-500 before:z-20",
                    isOverAfter &&
                      "after:absolute after:-bottom-[2px] after:left-1 after:right-1 after:h-[3px] after:rounded-full after:bg-sky-500 after:z-20",
                  )}
                >
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
                          !types.includes(DND_LAB_APP) &&
                          !types.includes(DND_VAULT_NOTE)
                        ) {
                          return;
                        }
                        event.preventDefault();
                        if (types.includes(DND_LAB_GROUP)) {
                          event.dataTransfer.dropEffect = "move";
                          const rect = event.currentTarget.getBoundingClientRect();
                          const isAfter = event.clientY > rect.top + rect.height / 2;
                          setDragOverGroup({
                            id: group.id,
                            position: isAfter ? "after" : "before",
                          });
                          setDragOverId(null);
                          return;
                        }
                        event.dataTransfer.dropEffect = types.includes(DND_VAULT_NOTE)
                          ? "copy"
                          : "move";
                        setDragOverGroup(null);
                        setDragOverId(`group:${group.id}`);
                      }}
                      onDragLeave={() => {
                        setDragOverId((id) =>
                          id === `group:${group.id}` ? null : id,
                        );
                        setDragOverGroup((prev) =>
                          prev?.id === group.id ? null : prev,
                        );
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragOverId(null);
                        const noteDataRaw = event.dataTransfer.getData(DND_VAULT_NOTE);
                        if (noteDataRaw) {
                          try {
                            const { path, name } = JSON.parse(noteDataRaw);
                            setState(linkVaultNoteToGroup(companyId, path, name, group.id));
                          } catch {
                            const cleanName = noteDataRaw.split("/").pop() ?? "Notiz";
                            setState(linkVaultNoteToGroup(companyId, noteDataRaw, cleanName, group.id));
                          }
                          setState(setTabGroupOpen(companyId, group.id, true));
                          setDragOverGroup(null);
                          return;
                        }
                        const groupId = event.dataTransfer.getData(DND_LAB_GROUP);
                        const appId = event.dataTransfer.getData(DND_LAB_APP);
                        if (groupId) {
                          const ids = groups.map((g) => g.id);
                          const placeAfter =
                            dragOverGroup?.id === group.id
                              ? dragOverGroup.position === "after"
                              : false;
                          setState(
                            reorderTabGroups(
                              companyId,
                              moveIdToSlot(ids, groupId, group.id, placeAfter),
                            ),
                          );
                          setDragOverGroup(null);
                          return;
                        }
                        if (appId) {
                          setState(moveAppToGroup(companyId, appId, group.id));
                          setState(
                            setTabGroupOpen(companyId, group.id, true),
                          );
                        }
                        setDragOverGroup(null);
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
                    <ContextMenuContent className="min-w-56 rounded-xl p-1.5">
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
                        className="gap-2 rounded-lg px-2.5 py-2"
                        disabled={groupIndex === 0}
                        onClick={() => {
                          const ids = groups.map((g) => g.id);
                          setState(
                            reorderTabGroups(
                              companyId,
                              moveIdToStart(ids, group.id),
                            ),
                          );
                        }}
                      >
                        <IconArrowBarUp className="size-4" />
                        Nach ganz oben
                      </ContextMenuItem>

                      <ContextMenuItem
                        className="gap-2 rounded-lg px-2.5 py-2"
                        disabled={groupIndex === 0}
                        onClick={() => {
                          const ids = groups.map((g) => g.id);
                          const prevGroup = groups[groupIndex - 1];
                          if (prevGroup) {
                            setState(
                              reorderTabGroups(
                                companyId,
                                moveIdToSlot(
                                  ids,
                                  group.id,
                                  prevGroup.id,
                                  false,
                                ),
                              ),
                            );
                          }
                        }}
                      >
                        <IconArrowUp className="size-4" />
                        Eins nach oben
                      </ContextMenuItem>

                      <ContextMenuItem
                        className="gap-2 rounded-lg px-2.5 py-2"
                        disabled={groupIndex === groups.length - 1}
                        onClick={() => {
                          const ids = groups.map((g) => g.id);
                          const nextGroup = groups[groupIndex + 1];
                          if (nextGroup) {
                            setState(
                              reorderTabGroups(
                                companyId,
                                moveIdToSlot(
                                  ids,
                                  group.id,
                                  nextGroup.id,
                                  true,
                                ),
                              ),
                            );
                          }
                        }}
                      >
                        <IconArrowDown className="size-4" />
                        Eins nach unten
                      </ContextMenuItem>

                      <ContextMenuItem
                        className="gap-2 rounded-lg px-2.5 py-2"
                        disabled={groupIndex === groups.length - 1}
                        onClick={() => {
                          const ids = groups.map((g) => g.id);
                          setState(
                            reorderTabGroups(
                              companyId,
                              moveIdToEnd(ids, group.id),
                            ),
                          );
                        }}
                      >
                        <IconArrowBarDown className="size-4" />
                        Nach ganz unten
                      </ContextMenuItem>

                      <ContextMenuSeparator />

                      <ContextMenuItem
                        className="gap-2 rounded-lg px-2.5 py-2 text-destructive focus:text-destructive"
                        onClick={() => {
                          const msg =
                            group.apps.length > 0
                              ? `Gruppe „${group.label}" löschen? Die ${group.apps.length} App(s) werden ebenfalls entfernt.`
                              : `Gruppe „${group.label}" löschen?`;
                          if (window.confirm(msg)) {
                            setState(setTabGroupOpen(companyId, group.id, false));
                            setTimeout(() => {
                              setState(deleteTabGroup(companyId, group.id));
                            }, 0);
                          }
                        }}
                      >
                        <IconTrash className="size-4" />
                        Gruppe löschen
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                    {/*
                     * The apps inside this folder.
                     *
                     * This block was missing: the row folded the group and showed its
                     * count and a chevron, the click wrote `collapsed` to the store
                     * correctly, and then the loop moved straight on to the next
                     * group. So every folder claimed to hold its apps -- "Tool Stack"
                     * said 5 -- and clicking it changed nothing, because there was no
                     * list to reveal. The apps were in the store and in `group.apps`
                     * the whole time; nothing ever put them on screen.
                     *
                     * Guarded by `open` so a folder only spends rows on the rows it
                     * has, and `group.apps.length` means an empty folder renders
                     * nothing rather than an empty bordered box.
                     */}
                    {open && group.apps.length > 0 ? (
                      <ul className="mt-0.5 flex flex-col gap-0.5 pl-3">
                        {group.apps.map((app) => (
                          <AppRow
                            app={app}
                            companyId={companyId}
                            dragOverId={dragOverId}
                            groupId={group.id}
                            key={app.id}
                            onChange={setState}
                            onConnect={setConnectId}
                            onEdit={setEditingId}
                            openVaultPath={openVaultPath}
                            setDragOverId={setDragOverId}
                            state={state}
                          />
                        ))}
                      </ul>
                    ) : null}
              </li>
              );
            })}
            {groups.length > 1 ? (
              <li
                className={cn(
                  "relative h-1 transition-all rounded-md",
                  dragOverId === "groups:bottom" &&
                    "h-2.5 bg-sky-500/20 ring-1 ring-sky-500/50 my-0.5",
                )}
                onDragLeave={() =>
                  setDragOverId((id) => (id === "groups:bottom" ? null : id))
                }
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes(DND_LAB_GROUP)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverId("groups:bottom");
                    setDragOverGroup(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOverId(null);
                  const groupId = event.dataTransfer.getData(DND_LAB_GROUP);
                  if (groupId) {
                    const ids = groups.map((g) => g.id);
                    setState(
                      reorderTabGroups(companyId, moveIdToEnd(ids, groupId)),
                    );
                  }
                }}
              />
            ) : null}
          </ul>
        )}

        {/* Apps that belong to no group. The icon rail rendered these, but the expanded list
            only walked `groups`, so with no groups yet every app a person added was invisible --
            it saved correctly and simply had nowhere to appear. */}
        {ungrouped.length > 0 ? (
          <div className="mt-1.5">
            {groups.length > 0 ? (
              <SidebarGroupLabel className="mb-0.5 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
                Ohne Gruppe
              </SidebarGroupLabel>
            ) : null}
            <ul className="flex flex-col gap-0.5 px-0.5">
              {ungrouped.map((app) => (
                <AppRow
                  app={app}
                  companyId={companyId}
                  dragOverId={dragOverId}
                  key={app.id}
                  onChange={setState}
                  onConnect={setConnectId}
                  onEdit={setEditingId}
                  openVaultPath={openVaultPath}
                  setDragOverId={setDragOverId}
                  state={state}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/*
       * The notes / planning section.
       */}
      <NotesSidebarSection companyId={companyId} />

      {/*
       * The rail actions, below the notes / planning section.
       *
       * Note + note-folder creation lives in the Planung header (`VaultNotesSection`),
       * where the tree already lives — duplicating them here would give the user
       * two ways to do the same thing on the same screen. The rail is for the
       * things that are not in Plannung: a new app, a new tab group, and the
       * bookmark transfer between the browser and the desktop one.
       */}
      <div className="flex flex-wrap items-center gap-0.5 px-0.5">
        <RailAction label="App hinzufügen" onClick={() => setAdding(true)}>
          <IconPlus className="size-3.5" stroke={1.75} />
        </RailAction>
        <RailAction label="Neue Gruppe" onClick={() => createFolder()}>
          <IconFolderPlus className="size-3.5" stroke={1.75} />
        </RailAction>
        {/*
         * The bookmark transfer sits with the other rail actions rather than on
         * its own: it moves apps between this browser and the desktop one, so it
         * belongs with "App hinzufügen" and "Neue Gruppe" — the three are the same
         * kind of thing, and splitting them across two rows made the rail read as
         * two unrelated lists.
         */}
        <BookmarkTransfer
          companyId={companyId}
          onChange={setState}
          state={state}
        />
      </div>
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
      {adding || editingId ? (
        <AddAppInline
          companyId={companyId}
          editApp={
            editingId
              ? allLabApps(state).find((a) => a.id === editingId)
              : undefined
          }
          groupId={groups[0]?.id}
          groups={groups.map((g) => ({ id: g.id, label: g.label }))}
          onCancel={() => {
            setAdding(false);
            setEditingId(null);
          }}
          onDone={(next) => {
            setState(next);
            setAdding(false);
            setEditingId(null);
          }}
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
  onEdit,
  openVaultPath,
}: {
  app: LabApp;
  companyId: string;
  groupId?: string;
  state: Level3BrowserState;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  onChange: (next: Level3BrowserState) => void;
  onConnect: (id: string) => void;
  onEdit?: (id: string) => void;
  openVaultPath?: string | null;
}) {
  const conn = getConnection(state, app.id);
  const active = app.notePath
    ? openVaultPath === app.notePath
    : (!state.starred && state.activeTool === app.id);
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
                if (app.notePath) {
                  if (state.starred) {
                    onChange(unstarToBrowser(companyId));
                  }
                  setOpenVaultPath(companyId, app.notePath);
                  return;
                }
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
                const types = [...event.dataTransfer.types];
                if (!types.includes(DND_LAB_APP) && !types.includes(DND_VAULT_NOTE)) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = types.includes(DND_VAULT_NOTE)
                  ? "copy"
                  : "move";
                setDragOverId(dropKey);
              }}
              onDragLeave={() =>
                setDragOverId(dragOverId === dropKey ? null : dragOverId)
              }
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragOverId(null);
                const noteDataRaw = event.dataTransfer.getData(DND_VAULT_NOTE);
                if (noteDataRaw && groupId) {
                  try {
                    const { path, name } = JSON.parse(noteDataRaw);
                    onChange(linkVaultNoteToGroup(companyId, path, name, groupId));
                  } catch {
                    const cleanName = noteDataRaw.split("/").pop() ?? "Notiz";
                    onChange(linkVaultNoteToGroup(companyId, noteDataRaw, cleanName, groupId));
                  }
                  return;
                }
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
              {app.kind === "split" ? (
                <span
                  className="flex shrink-0 items-center text-sidebar-foreground/40"
                  title="Split-Link: öffnet zwei Seiten nebeneinander"
                >
                  <IconLayoutColumns className="size-3.5" stroke={1.6} />
                </span>
              ) : null}
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
              <span
                className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <button
                  aria-label={
                    app.notePath
                      ? `Notiz-Verlinkung ${app.label} entfernen`
                      : app.builtin
                        ? `${app.label} aus dieser Gruppe entfernen`
                        : `Tab ${app.label} entfernen`
                  }
                  className="rounded-md p-1 text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-destructive"
                  onClick={() => {
                    if (app.builtin) {
                      onChange(removeAppFromGroups(companyId, app.id));
                      return;
                    }
                    onChange(removeCustomLabApp(companyId, app.id));
                  }}
                  title={
                    app.notePath
                      ? "Notiz-Verlinkung entfernen"
                      : app.builtin
                        ? "Aus dieser Gruppe entfernen"
                        : "Tab entfernen"
                  }
                  type="button"
                >
                  <IconX className="size-3.5" stroke={1.75} />
                </button>
              </span>
            </button>
          </SidebarMenuItem>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-52 rounded-xl p-1.5">
          {app.notePath ? (
            <>
              <ContextMenuItem
                className="gap-2 rounded-lg px-2.5 py-2"
                onClick={() => {
                  if (state.starred) {
                    onChange(unstarToBrowser(companyId));
                  }
                  setOpenVaultPath(companyId, app.notePath!);
                }}
              >
                <IconFileText className="size-4" />
                Notiz im Editor öffnen
              </ContextMenuItem>
              {groupId ? (
                <ContextMenuItem
                  className="gap-2 rounded-lg px-2.5 py-2"
                  onClick={() => onChange(removeAppFromGroups(companyId, app.id))}
                >
                  <IconFolder className="size-4" />
                  Aus Gruppe entfernen
                </ContextMenuItem>
              ) : null}
              <ContextMenuSeparator />
              <ContextMenuItem
                className="gap-2 rounded-lg px-2.5 py-2 text-destructive focus:text-destructive"
                onClick={() => onChange(removeCustomLabApp(companyId, app.id))}
              >
                <IconTrash className="size-4" />
                Verlinkung entfernen
              </ContextMenuItem>
            </>
          ) : (
            <>
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
              {!app.builtin && onEdit ? (
                <ContextMenuItem
                  className="gap-2 rounded-lg px-2.5 py-2"
                  onClick={() => onEdit(app.id)}
                >
                  <IconPencil className="size-4" />
                  Bearbeiten
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
            </>
          )}
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
            <div className={cn("group/rail relative", open && "mb-0.5")}>
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
              <button
                aria-label={`Gruppe "${group.label}" löschen`}
                className="absolute -right-0.5 -top-0.5 hidden size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm opacity-0 transition-opacity group-hover/rail:flex group-hover/rail:opacity-100 hover:bg-destructive/90"
                onClick={(e) => {
                  e.stopPropagation();
                  const msg =
                    group.apps.length > 0
                      ? `Gruppe "${group.label}" löschen? Die ${group.apps.length} App(s) werden ebenfalls entfernt.`
                      : `Gruppe "${group.label}" löschen?`;
                  if (window.confirm(msg)) {
                    setState(setTabGroupOpen(companyId, group.id, false));
                    setTimeout(() => {
                      setState(deleteTabGroup(companyId, group.id));
                    }, 0);
                  }
                }}
                title={`Gruppe "${group.label}" löschen`}
                type="button"
              >
                <IconTrash className="size-2.5" stroke={2} />
              </button>
            </div>

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

export function RailAction({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={label}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            onClick={onClick}
            type="button"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
          if (app.kind === "note" || app.notePath || app.icon === "note") {
            return (
              <span
                className="flex items-center justify-center overflow-hidden rounded-[3px] bg-white/90 text-sky-600"
                key={app.id}
              >
                <IconFileText className="size-2.5" stroke={2} />
              </span>
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
  if (icon === "note" || icon === "file-text") {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20">
        <IconFileText className="size-3.5" stroke={1.75} />
      </span>
    );
  }
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
  groups,
  editApp,
  onCancel,
  onDone,
}: {
  companyId: string;
  groupId?: string;
  groups: { id: string; label: string }[];
  /** Set = edit this own app / Split-Link instead of adding a new one. */
  editApp?: LabApp;
  onCancel: () => void;
  onDone: (next: Level3BrowserState) => void;
}) {
  const [kind, setKind] = useState<"browser" | "split">(
    editApp?.kind === "split" ? "split" : "browser",
  );
  const [label, setLabel] = useState(editApp?.label ?? "");
  const [url, setUrl] = useState(editApp?.url ?? "");
  const [url2, setUrl2] = useState(editApp?.url2 ?? "");
  const [icon, setIcon] = useState(
    editApp?.icon && editApp.icon !== "googlechrome" ? editApp.icon : "",
  );
  const [target, setTarget] = useState(groupId ?? groups[0]?.id ?? "");
  const split = kind === "split";
  const ready = Boolean(label.trim() && url.trim() && (!split || url2.trim()));

  const save = () => {
    if (!ready) return;
    if (editApp) {
      onDone(
        updateCustomLabApp(companyId, editApp.id, {
          label,
          url,
          url2: split ? url2 : undefined,
          icon,
          groupId: target || undefined,
        }),
      );
      return;
    }
    onDone(
      addCustomLabApp(companyId, {
        kind: split ? "split" : "browser",
        label,
        url,
        url2: split ? url2 : undefined,
        icon: icon || undefined,
        groupId: target || undefined,
      }),
    );
  };

  return (
    <div className="space-y-2 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium">
          {editApp ? "Bearbeiten" : "App hinzufügen"}
        </p>
        <button
          className="text-[10px] text-sidebar-foreground/40 hover:text-sidebar-foreground"
          onClick={onCancel}
          type="button"
        >
          Abbrechen
        </button>
      </div>
      {editApp ? null : (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-background/60 p-0.5 text-[11px]">
          <button
            className={cn(
              "rounded-md px-2 py-1",
              !split ? "bg-background shadow-sm" : "text-sidebar-foreground/50",
            )}
            onClick={() => setKind("browser")}
            type="button"
          >
            Einzel-App
          </button>
          <button
            className={cn(
              "flex items-center justify-center gap-1 rounded-md px-2 py-1",
              split ? "bg-background shadow-sm" : "text-sidebar-foreground/50",
            )}
            onClick={() => setKind("split")}
            type="button"
          >
            <IconLayoutColumns className="size-3" />
            Split-Link
          </button>
        </div>
      )}
      <Input
        className="h-7 border-sidebar-border bg-background text-[11px]"
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Name"
        value={label}
      />
      <Input
        className="h-7 border-sidebar-border bg-background text-[11px]"
        onChange={(e) => setUrl(e.target.value)}
        placeholder={split ? "URL links (https://…)" : "https://…"}
        value={url}
      />
      {split ? (
        <Input
          className="h-7 border-sidebar-border bg-background text-[11px]"
          onChange={(e) => setUrl2(e.target.value)}
          placeholder="URL rechts (https://…)"
          value={url2}
        />
      ) : null}
      <Input
        className="h-7 border-sidebar-border bg-background text-[11px]"
        onChange={(e) => setIcon(e.target.value)}
        placeholder="Icon (simpleicons-Name, z. B. notion) – optional"
        value={icon}
      />
      {groups.length > 0 ? (
        <select
          aria-label="Gruppe"
          className="h-7 w-full rounded-md border border-sidebar-border bg-background px-1.5 text-[11px]"
          onChange={(e) => setTarget(e.target.value)}
          value={target}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      ) : null}
      {split ? (
        <p className="text-[10px] leading-snug text-sidebar-foreground/45">
          Ein Klick öffnet beide Seiten nebeneinander (linke / rechte Bildschirmhälfte).
        </p>
      ) : null}
      <Button
        className="h-7 w-full"
        disabled={!ready}
        onClick={save}
        size="sm"
        type="button"
      >
        {editApp ? "Speichern" : "Hinzufügen"}
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
