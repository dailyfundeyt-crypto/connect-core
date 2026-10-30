import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { SidebarGroupLabel } from "@/components/ui/sidebar";
import { VaultQuickSearch } from "@/components/companies/vault-quick-search";
import { VaultTemplatePicker } from "@/components/companies/vault-template-picker";
import { VaultImportButton } from "@/components/companies/vault-import-button";
import { matchesHotkey, getHotkey } from "@/lib/hotkeys/hotkeys";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { IconFilter, IconSearch, IconSortAscending, IconSortDescending, IconTemplate } from "@tabler/icons-react";
import {
  brainKeys,
  brainStatusQueryOptions,
  brainTreeQueryOptions,
  createBrainFolder,
  createBrainNote,
  deleteBrainFolder,
  deleteBrainNote,
  VAULT_PREFIX,
  type BrainFileInfo,
} from "@/lib/brain/queries";
import { RenameNoteDialog, type RenameDialogRequest } from "@/components/brain/rename-note-dialog";
import {
  DND_VAULT_NOTE,
  getLevel3Browser,
  linkVaultNoteToGroup,
  subscribeLevel3Browser,
} from "@/lib/companies/level3-tools";
import { setOpenVaultPath } from "@/lib/companies/notes";
import { NewFolderDialog } from "@/components/companies/notes-sidebar-section";
import { DeleteConfirmDialog } from "@/components/settings/delete-confirm-dialog";
import { cn } from "@/lib/utils";

/**
 * The Obsidian vault, listed as folders and files in the notes sidebar.
 *
 * The Brain already walks the whole vault and hands over every markdown file with
 * its relative path (`Vault/Projekte/…/x.md`). Turning those paths into a tree here
 * is the whole job: no second scan on the client, no second index, and a folder
 * that exists on disk shows up because it is in the paths rather than because
 * somebody remembered to register it.
 *
 * Read-only here on purpose. A file opened from this list is opened in the Brain
 * reader, where writing already goes through `PUT /api/brain/note`. Editing it in
 * the notes editor instead would write a *second*, differently-named file into the
 * same folder, and the vault would grow a copy of everything.
 */
type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[]; count: number }
  | { kind: "file"; name: string; path: string; size: number };

/** `Projekte/Alpha/Brief.md` → a folder node holding one file. */
function buildTree(files: BrainFileInfo[]): TreeNode[] {
  const roots: TreeNode[] = [];

  for (const file of files) {
    let path = file.path;
    if (path.startsWith(VAULT_PREFIX)) path = path.slice(VAULT_PREFIX.length);

    const parts = path.split("/").filter(Boolean);
    if (!parts.length) continue;
    const fileName = parts.pop() ?? "";
    const label = fileName.replace(/\.md$/i, "");

    let level = roots;
    let walked = "";
    for (const part of parts) {
      walked = walked ? `${walked}/${part}` : part;
      let folder = level.find(
        (node): node is Extract<TreeNode, { kind: "folder" }> =>
          node.kind === "folder" && node.name === part,
      );
      if (!folder) {
        folder = {
          kind: "folder",
          name: part,
          path: walked,
          children: [],
          count: 0,
        };
        level.push(folder);
      }
      folder.count += 1;
      level = folder.children;
    }
    level.push({
      kind: "file",
      name: label,
      path: file.path,
      size: file.size,
    });
  }

  // Folders first, then files, each alphabetically: a folder you can step into
  // belongs above the leaf it contains, not below it.
  const sort = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name, "de")
        : a.kind === "folder"
          ? -1
          : 1,
    );
    for (const node of nodes) if (node.kind === "folder") sort(node.children);
    return nodes;
  };
  return sort(roots);
}

/** How many `.md` files sit in this subtree — shown next to the folder name. */
function countFiles(nodes: TreeNode[]): number {
  return nodes.reduce(
    (sum, node) =>
      sum + (node.kind === "file" ? 1 : countFiles(node.children)),
    0,
  );
}

export function VaultNotesSection({
  companyId,
  onOpen,
  onReveal,
  selectedPath,
}: {
  companyId?: string;
  onOpen: (path: string) => void;
  /** Shows the path in the Windows Explorer. Optional: the web build has no Explorer. */
  onReveal?: (path: string) => void;
  selectedPath: string | null;
}) {
  const queryClient = useQueryClient();
  const tree = useQuery(brainTreeQueryOptions());
  const status = useQuery(brainStatusQueryOptions());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [targetParentFolder, setTargetParentFolder] = useState("");
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<{ path: string; name: string } | null>(null);
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<{ path: string; name: string } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameRequest, setRenameRequest] = useState<RenameDialogRequest>({ rename: null, create: null });
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<"alpha" | "mtime">("alpha");
  const [tabGroups, setTabGroups] = useState(() =>
    companyId ? getLevel3Browser(companyId).tabGroups : [],
  );

  const vaultName = useMemo(() => {
    const configured = status.data?.available ? (status.data.vaultPath || status.data.path || "") : "";
    const last = configured.split(/[\\/]/).filter(Boolean).pop();
    return last || "Spark Brain";
  }, [status.data]);

  const openCreateNote = (folder: string = "00 Inbox") => {
    setRenameRequest({
      rename: null,
      create: { folder },
    });
    setRenameOpen(true);
  };

  const openRenameNote = (path: string, currentTitle: string) => {
    setRenameRequest({
      rename: { path, currentTitle },
      create: null,
    });
    setRenameOpen(true);
  };

  useEffect(() => {
    if (!companyId) return;
    setTabGroups(getLevel3Browser(companyId).tabGroups);
    return subscribeLevel3Browser(() => {
      setTabGroups(getLevel3Browser(companyId).tabGroups);
    });
  }, [companyId]);

  /*
   * Cmd/Ctrl+K opens the quick-search palette from anywhere on the page — even
   * when focus is inside the editor or an input — so the user does not have
   * to first move the cursor back to the sidebar. `getHotkey` is what the
   * Settings panel renders, so the combo stays in sync with whatever the
   * user re-binds there.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!matchesHotkey(event, getHotkey("vault-search").combo)) return;
      event.preventDefault();
      setQuickSearchOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const handleDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    try {
      await deleteBrainFolder(deleteFolderTarget.path);
      setDeleteFolderTarget(null);
      void queryClient.invalidateQueries({ queryKey: brainKeys.all });
    } catch (err) {
      console.error("[Ordner löschen] Fehler:", err);
    }
  };

  /*
   * The note handler is the same shape as the folder one: the dialog uses
   * a typed-name confirmation, the server takes a `.connect-history/`
   * safety backup before unlinking, and the brain query cache is invalidated
   * so the sidebar tree, the editor (if the deleted file was open) and the
   * backlinks panel all refresh themselves. When the deleted file happens
   * to be the one currently open in the right-hand editor, we also clear
   * the lab's "open vault path" so the panel resets to its empty state
   * instead of staring at a 404 the next time the editor re-queries.
   */
  const handleDeleteNote = async () => {
    if (!deleteNoteTarget) return;
    try {
      await deleteBrainNote(deleteNoteTarget.path);
      if (companyId) setOpenVaultPath(companyId, null);
      setDeleteNoteTarget(null);
      void queryClient.invalidateQueries({ queryKey: brainKeys.all });
    } catch (err) {
      console.error("[Notiz löschen] Fehler:", err);
    }
  };

  const createNoteInFolder = (folder: string = "00 Inbox") => {
    openCreateNote(folder);
  };

  const handleCreateFolder = async (name: string) => {
    try {
      await createBrainFolder({ parent: targetParentFolder, name });
      setFolderDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: brainKeys.all });
    } catch (err) {
      console.error("[Neuer Ordner] Fehler:", err);
    }
  };

  const sortedFiles = useMemo(() => {
    if (!tree.data?.available) return [] as BrainFileInfo[];
    const files = [...tree.data.files];
    files.sort((a, b) => {
      if (sort === "mtime") return b.mtime.localeCompare(a.mtime);
      return a.path.localeCompare(b.path);
    });
    return files;
  }, [tree.data, sort]);

  const filteredFiles = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return sortedFiles;
    return sortedFiles.filter((file) => file.path.toLowerCase().includes(needle));
  }, [sortedFiles, filter]);

  const nodes = useMemo(() => {
    return buildTree(filteredFiles);
  }, [filteredFiles]);

  const visibleTotal = filter.trim() ? countFiles(nodes) : sortedFiles.length;

  if (tree.isPending) {
    return (
      <p className="mt-2 px-2 text-[11px] text-sidebar-foreground/40">
        Ordner werden geladen …
      </p>
    );
  }

  if (!tree.data?.available) {
    return (
      <p className="mt-2 px-2 text-[11px] text-sidebar-foreground/40">
        Kein Spark verbunden — Ordner nicht verfügbar.
      </p>
    );
  }

  if (!nodes.length) {
    return (
      <p className="mt-2 px-2 text-[11px] text-sidebar-foreground/40">
        Keine Markdown-Dateien im Vault.
      </p>
    );
  }

  const renderNode = (node: TreeNode, depth: number) => {
    if (node.kind === "file") {
      const active = node.path === selectedPath;
      return (
        <li key={node.path}>
          <ContextMenu>
            <ContextMenuTrigger
              className={cn(
                "group/note-row flex w-full cursor-grab items-center rounded-lg text-left transition-colors active:cursor-grabbing",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
              draggable
              onClick={() => onOpen(node.path)}
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  DND_VAULT_NOTE,
                  JSON.stringify({ path: node.path, name: node.name }),
                );
                event.dataTransfer.setData("text/plain", node.name);
                event.dataTransfer.effectAllowed = "copy";
              }}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
            >
              <span className="flex w-full items-center gap-2 py-1.5 pr-2">
                <IconFileText className="size-3.5 shrink-0 opacity-50" stroke={1.75} />
                <span className="min-w-0 flex-1 truncate text-[12px]">
                  {node.name}
                </span>
              </span>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuItem onClick={() => onOpen(node.path)}>
                Im Editor öffnen
              </ContextMenuItem>
              <ContextMenuItem onClick={() => openRenameNote(node.path, node.name)}>
                <IconPencil className="mr-2 size-3.5" />
                Notiz umbenennen …
              </ContextMenuItem>
              {tabGroups.length > 0 ? (
                <ContextMenuSub>
                  <ContextMenuSubTrigger className="gap-2">
                    <IconFolder className="size-3.5 opacity-60" />
                    In Gruppe verlinken
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-52">
                    {tabGroups.map((g) => (
                      <ContextMenuItem
                        key={g.id}
                        onClick={() => {
                          if (companyId) {
                            linkVaultNoteToGroup(companyId, node.path, node.name, g.id);
                          }
                        }}
                      >
                        <span className="truncate">{g.label}</span>
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              ) : null}
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onReveal?.(node.path)}>
                Pfad kopieren
              </ContextMenuItem>
              <ContextMenuItem
                className="text-destructive focus:bg-destructive/15 focus:text-destructive"
                onClick={() => setDeleteNoteTarget({ path: node.path, name: node.name })}
              >
                <IconTrash className="mr-2 size-3.5" />
                Notiz löschen
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </li>
      );
    }

    const isOpen = !(collapsed[node.path] ?? false);
    return (
      <li key={node.path}>
        <div className="group/folder-row relative flex items-center">
          <ContextMenu>
            <ContextMenuTrigger className="min-w-0 flex-1">
              <button
                aria-expanded={isOpen}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] font-medium text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [node.path]: !isOpen }))
                }
                style={{ paddingLeft: `${8 + depth * 12}px` }}
                type="button"
              >
                <IconChevronRight
                  className={cn(
                    "size-3 shrink-0 transition-transform duration-150",
                    isOpen && "rotate-90",
                  )}
                  stroke={1.75}
                />
                {isOpen ? (
                  <IconFolderOpen className="size-3 shrink-0" stroke={1.75} />
                ) : (
                  <IconFolder className="size-3 shrink-0" stroke={1.75} />
                )}
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                <span className="shrink-0 tabular-nums opacity-60">
                  {countFiles(node.children)}
                </span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuItem onClick={() => openCreateNote(node.path)}>
                <IconPlus className="mr-2 size-3.5" />
                Neue Notiz anlegen
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  setTargetParentFolder(node.path);
                  setFolderDialogOpen(true);
                }}
              >
                <IconFolderPlus className="mr-2 size-3.5" />
                Neuer Unterordner
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onReveal?.(node.path)}>
                Pfad kopieren
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-destructive focus:bg-destructive/15 focus:text-destructive"
                onClick={() => setDeleteFolderTarget({ path: node.path, name: node.name })}
              >
                <IconTrash className="mr-2 size-3.5" />
                Ordner löschen
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <button
            aria-label={`Neue Notiz in ${node.name}`}
            className="absolute right-1 flex size-5 items-center justify-center rounded-md text-sidebar-foreground/40 opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover/folder-row:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              openCreateNote(node.path);
            }}
            title={`Neue Notiz in ${node.name}`}
            type="button"
          >
            <IconPlus className="size-3" stroke={1.75} />
          </button>
        </div>
        {isOpen && node.children.length ? (
          <ul className="mt-0.5 flex list-none flex-col gap-0.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  const total = visibleTotal;

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col px-0.5" data-section="vault-notes">
      <div className="mb-0.5 flex h-7 shrink-0 items-center justify-between px-2">
        <SidebarGroupLabel className="h-auto p-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
          <span className="flex items-center gap-1.5 truncate" title={vaultName}>
            {vaultName}
            <span className="font-semibold tabular-nums text-sidebar-foreground/55">
              {total}
            </span>
          </span>
        </SidebarGroupLabel>
        <div className="flex items-center gap-0.5">
          <Button
            aria-label="Aus Vorlage erstellen"
            className="size-6 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => setTemplatePickerOpen(true)}
            size="icon"
            title="Aus Vorlage erstellen"
            type="button"
            variant="ghost"
          >
            <IconTemplate className="size-3.5" stroke={1.75} />
          </Button>
          <Button
            aria-label={`${vaultName} durchsuchen`}
            className="size-6 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => setQuickSearchOpen(true)}
            size="icon"
            title={`${vaultName} durchsuchen (⌘/Strg+K)`}
            type="button"
            variant="ghost"
          >
            <IconSearch className="size-3.5" stroke={1.75} />
          </Button>
          <Button
            aria-label={`Neuer Ordner in ${vaultName}`}
            className="size-6 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => {
              setTargetParentFolder("");
              setFolderDialogOpen(true);
            }}
            size="icon"
            title={`Neuer Ordner in ${vaultName}`}
            type="button"
            variant="ghost"
          >
            <IconFolderPlus className="size-3.5" stroke={1.75} />
          </Button>
          <Button
            aria-label={`Neue Notiz in ${vaultName}`}
            className="size-6 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => openCreateNote("00 Inbox")}
            size="icon"
            title={`Neue Notiz in ${vaultName}`}
            type="button"
            variant="ghost"
          >
            <IconPlus className="size-3.5" stroke={1.75} />
          </Button>
        </div>
      </div>
      {nodes.length > 0 || filter ? (
        <div className="mb-0.5 flex shrink-0 items-center gap-1 px-2">
          <div className="relative flex h-6 min-w-0 flex-1 items-center rounded-md border border-transparent bg-sidebar-accent/40 px-2 focus-within:border-sidebar-foreground/30 focus-within:bg-sidebar-accent/70">
            <IconFilter className="mr-1 size-3 shrink-0 text-sidebar-foreground/40" stroke={1.5} />
            <input
              aria-label="Notizen in der Sidebar filtern"
              className="h-full min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-sidebar-foreground/40"
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtern nach Pfad…"
              value={filter}
            />
            {filter ? (
              <button
                aria-label="Filter zurücksetzen"
                className="ml-1 rounded p-0.5 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={() => setFilter("")}
                type="button"
              >
                ×
              </button>
            ) : null}
          </div>
          <button
            aria-label={sort === "alpha" ? "Alphabetisch sortiert" : "Nach Änderungszeit sortiert"}
            className="flex size-6 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => setSort((value) => (value === "alpha" ? "mtime" : "alpha"))}
            title={sort === "alpha" ? "Alphabetisch → nach Änderungszeit" : "Nach Änderungszeit → alphabetisch"}
            type="button"
          >
            {sort === "alpha" ? (
              <IconSortAscending className="size-3.5" stroke={1.75} />
            ) : (
              <IconSortDescending className="size-3.5" stroke={1.75} />
            )}
          </button>
        </div>
      ) : null}
      <ul className="no-scrollbar mt-0.5 flex min-h-0 list-none flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain">
        {nodes.map((node) => renderNode(node, 0))}
      </ul>
      <NewFolderDialog
        onCreate={handleCreateFolder}
        onOpenChange={setFolderDialogOpen}
        open={folderDialogOpen}
      />
      {deleteFolderTarget ? (
        <DeleteConfirmDialog
          confirmWord={deleteFolderTarget.name}
          description={`Möchtest du den Ordner „${deleteFolderTarget.name}“ und alle darin enthaltenen Notizen wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
          onConfirm={handleDeleteFolder}
          onOpenChange={(open) => !open && setDeleteFolderTarget(null)}
          open={Boolean(deleteFolderTarget)}
          title="Ordner löschen"
        />
      ) : null}
      {deleteNoteTarget ? (
        <DeleteConfirmDialog
          confirmWord={deleteNoteTarget.name}
          description={`Möchtest du die Notiz „${deleteNoteTarget.name}.md“ wirklich löschen? Der Server legt vorher eine Sicherung in „.connect-history/“ an, sodass du den Schritt rückgängig machen kannst.`}
          onConfirm={handleDeleteNote}
          onOpenChange={(open) => !open && setDeleteNoteTarget(null)}
          open={Boolean(deleteNoteTarget)}
          title="Notiz löschen"
        />
      ) : null}
      {companyId ? (
        <VaultQuickSearch
          companyId={companyId}
          onOpenChange={setQuickSearchOpen}
          open={quickSearchOpen}
        />
      ) : null}
      {companyId ? (
        <VaultTemplatePicker
          companyId={companyId}
          onOpenChange={setTemplatePickerOpen}
          open={templatePickerOpen}
        />
      ) : null}
      {companyId ? (
        <div className="mt-1 shrink-0 px-2 pb-1">
          <VaultImportButton companyId={companyId} folder="00 Inbox" />
        </div>
      ) : null}
      <RenameNoteDialog
        onOpenChange={setRenameOpen}
        onSaved={(newPath) => {
          onOpen(newPath);
          if (companyId) setOpenVaultPath(companyId, newPath);
        }}
        open={renameOpen}
        request={renameRequest}
      />
    </div>
  );
}