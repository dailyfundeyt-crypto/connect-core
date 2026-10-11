import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { IconChevronRight, IconFileText, IconFolder, IconFolderOpen } from "@tabler/icons-react";
import { SidebarGroupLabel } from "@/components/ui/sidebar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  brainTreeQueryOptions,
  VAULT_PREFIX,
  type BrainFileInfo,
} from "@/lib/brain/queries";
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
  onOpen,
  onReveal,
  selectedPath,
}: {
  onOpen: (path: string) => void;
  /** Shows the path in the Windows Explorer. Optional: the web build has no Explorer. */
  onReveal?: (path: string) => void;
  selectedPath: string | null;
}) {
  const tree = useQuery(brainTreeQueryOptions());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const nodes = useMemo(() => {
    if (!tree.data?.available) return [];
    /*
     * Every markdown file the Brain knows about, not just the `Vault/`-prefixed
     * half.
     *
     * The sidebar lists two things that are one thing on disk. The notes this
     * browser owns live in their own folders and are listed above; the vault
     * holds the rest of `Plannung` and is listed here. Which is which is decided
     * on the server by whether a path is inside the Brain folder, and when the
     * Brain *is* the vault — `Plannung` with no `.obsidian` above it, which is how
     * a fresh install is configured — there is no such split: every file comes
     * back once, without a `Vault/` marker. Filtering on that marker then matched
     * nothing and the section rendered empty, which is where "the notes do not
     * load" came from.
     *
     * So the marker is treated as optional rather than required: files that carry
     * it are shown without it, and files that do not are shown as they are. The
     * Brain-side list already owns its folders, so anything still reaching here
     * is what belongs under the vault heading.
     */
    return buildTree(tree.data.files);
  }, [tree.data]);

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
        Kein Brain verbunden — Ordner nicht verfügbar.
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
                "w-full rounded-lg text-left transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
            >
              <span className="flex w-full items-center gap-2 py-1.5 pr-2">
                <IconFileText className="size-3.5 shrink-0 opacity-50" stroke={1.75} />
                <span className="min-w-0 flex-1 truncate text-[12px]">
                  {node.name}
                </span>
              </span>
            </ContextMenuTrigger>
            {/*
             * The row and the menu are siblings, for the reason the note row already
             * documents: an interactive element inside the trigger also runs the
             * trigger's own handler, so the file would open under the menu.
             */}
            <ContextMenuContent className="w-56">
              <ContextMenuItem onClick={() => onOpen(node.path)}>
                Im Editor öffnen
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onReveal?.(node.path)}>
                Im Explorer anzeigen
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </li>
      );
    }

    const isOpen = !(collapsed[node.path] ?? false);
    return (
      <li key={node.path}>
        <ContextMenu>
          <ContextMenuTrigger className="w-full rounded-lg text-left">
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
          {/*
           * A folder opens on its own contents rather than with itself selected:
           * there is no file to put in front of you, and selecting the folder alone
           * would show an empty-looking Explorer window.
           */}
          <ContextMenuContent className="w-56">
            <ContextMenuItem onClick={() => onReveal?.(node.path)}>
              Im Explorer öffnen
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {isOpen && node.children.length ? (
          <ul className="mt-0.5 flex flex-col gap-0.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  const total = countFiles(nodes);

  return (
    /*
     * The vault lists every markdown file the Brain knows about -- 2093 of them
     * in `Plannung` -- and it rendered them into one flat `<ul>` with no cap. That
     * is a 72000px block: the browser groups below it sat at y=7954, seven screens
     * past the fold, and appeared to have vanished. Nothing had been removed; it
     * was simply below a list that grew without bound.
     *
     * So the tree gets its own capped, scrollable box, the same way the notes list
     * does, and the heading stays outside it so the count is always visible. This
     * is the last section in the rail, so `flex-1` here is safe: there is nothing
     * below it to push out.
     */
    <div className="mt-3 flex min-h-0 flex-1 flex-col px-0.5" data-section="vault-notes">
      <SidebarGroupLabel className="mb-0.5 flex h-7 shrink-0 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
        Plannung
        <span className="font-semibold tabular-nums text-sidebar-foreground/55">
          {total}
        </span>
      </SidebarGroupLabel>
      <ul className="no-scrollbar mt-0.5 min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain">
        {nodes.map((node) => renderNode(node, 0))}
      </ul>
    </div>
  );
}