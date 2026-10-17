import {
  IconBrain,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconPencilPlus,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { BrainMarkdownBody, parseFrontmatter } from "@/components/brain/brain-markdown";
import { BrainNoteReader } from "@/components/brain/brain-note-reader";
import {
  brainBridgeFileQueryOptions,
  brainBridgeSearchQueryOptions,
  brainBridgeTreeQueryOptions,
  bridgeHint,
} from "@/lib/brain/bridge";
import {
  brainTreeQueryOptions,
  createBrainNote,
} from "@/lib/brain/queries";
import { useConnectOnPc } from "@/lib/brain/pc-mode";
import type { ConnectCompany } from "@/lib/companies/catalog";
import type { LabApp, LabFolderNode } from "@/lib/companies/level3-tools";
import { cn } from "@/lib/utils";

/**
 * Handy-Browser-Bereich: Gruppen wie am PC + Brain-Notizen (helium-mobilefix, 17.10.2026).
 *
 * - `flattenLabFolders`: alle Gruppen der Firma in PC-Reihenfolge, Untergruppen als „Eltern › Kind“,
 *   auch leere (vorher blendete das Handy jede Gruppe ohne Link aus – Planung, YouTube, Buecher …).
 * - `MobileBrainNotes`: der Brain-/Obsidian-Ordner (gleiche Quelle wie die PC-Seitenleiste,
 *   /api/brain/tree) als Ordnerliste; Antippen oeffnet `MobileMarkdownView`.
 * - `MobileMarkdownView`: Vollbild-Leseansicht (BrainNoteReader, dunkel) mit „Im Brain zeigen“.
 * - Vercel-Vorschau (kein lokales Brain): Baum, Datei und Suche kommen über die Handy-Brücke vom PC
 *   (`useBrainNotesSource`, lib/brain/bridge.ts); PC aus → Hinweis statt Notizen.
 */

/** Woher kommen die Notizen? Lokal (PC/Tunnel) oder über die Handy-Brücke (Vercel). */
function useBrainNotesSource() {
  const tree = useQuery(brainTreeQueryOptions());
  const { pc, pending } = useConnectOnPc();
  const bridgeMode = !pc && !pending;
  const bridge = useQuery(brainBridgeTreeQueryOptions(bridgeMode));
  const localFiles = tree.data?.available ? tree.data.files : null;
  const bridgeFiles = bridge.data?.kind === "ok" && bridge.data.data.available ? bridge.data.data.files : null;
  const files = localFiles ?? (bridgeMode ? bridgeFiles : null);
  const loading = tree.isPending || (pending && !localFiles) || (bridgeMode && !localFiles && bridge.isPending);
  let hint: string | null = null;
  if (!files && !loading) {
    if (pc) hint = "Kein Brain-Ordner gefunden. Wähle ihn am PC unter Einstellungen › Brain.";
    else if (bridge.data?.kind === "ok" && !bridge.data.data.available)
      hint = `Brain am PC nicht verfügbar: ${bridge.data.data.reason}`;
    else hint = bridgeHint(bridge.data);
  }
  return { files, loading, hint, bridgeMode: bridgeMode && !localFiles, pc };
}

export type FlatLabGroup = { id: string; title: string; depth: number; apps: LabApp[] };

export function flattenLabFolders(roots: LabFolderNode[]): FlatLabGroup[] {
  const out: FlatLabGroup[] = [];
  const walk = (nodes: LabFolderNode[], trail: string[]) => {
    for (const node of nodes) {
      const names = [...trail, node.label];
      out.push({ id: node.id, title: names.join(" › "), depth: trail.length, apps: node.apps });
      if (node.children.length) walk(node.children, names);
    }
  };
  walk(roots, []);
  return out;
}

/** Firmen-Chips über dem Browser-Bereich: Gruppen gehören je Firma – wie am PC wählbar. */
export function MobileBrowserCompanyChips({
  companies,
  activeId,
  onSelect,
}: {
  companies: ConnectCompany[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  if (companies.length < 2) return null;
  return (
    <div className="flex [scrollbar-width:none] gap-2 overflow-x-auto px-5 pb-1 pt-3" data-testid="mobile-browser-companies">
      {companies.map((company) => {
        const active = company.id === activeId;
        return (
          <button
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[14px] transition-colors",
              active
                ? "border-white/25 bg-white/15 font-semibold text-white"
                : "border-white/10 bg-white/[0.04] text-white/60 active:bg-white/10",
            )}
            key={company.id}
            onClick={() => onSelect(company.id)}
            type="button"
          >
            <span
              className="size-4 shrink-0 overflow-hidden rounded-[5px]"
              style={{ background: company.accent || "#334155" }}
            >
              {company.logo ? <img alt="" className="size-full object-cover" src={company.logo} /> : null}
            </span>
            {company.name}
          </button>
        );
      })}
    </div>
  );
}

type BrainFolder = {
  name: string;
  path: string;
  folders: BrainFolder[];
  files: { name: string; path: string }[];
  count: number;
};

function buildBrainFolders(paths: string[]): BrainFolder {
  const root: BrainFolder = { name: "Brain", path: "", folders: [], files: [], count: 0 };
  const index = new Map<string, BrainFolder>([["", root]]);
  for (const path of paths) {
    const parts = path.split("/");
    const fileName = parts.pop() ?? path;
    let current = root;
    current.count += 1;
    let trail = "";
    for (const part of parts) {
      trail = trail ? `${trail}/${part}` : part;
      let next = index.get(trail);
      if (!next) {
        next = { name: part, path: trail, folders: [], files: [], count: 0 };
        index.set(trail, next);
        current.folders.push(next);
      }
      next.count += 1;
      current = next;
    }
    current.files.push({ name: fileName.replace(/\.md$/i, ""), path });
  }
  const sort = (folder: BrainFolder) => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
    folder.files.sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
    for (const child of folder.folders) sort(child);
  };
  sort(root);
  return root;
}

function findFolder(root: BrainFolder, path: string): BrainFolder | null {
  if (!path) return root;
  let current: BrainFolder | undefined = root;
  let trail = "";
  for (const part of path.split("/")) {
    trail = trail ? `${trail}/${part}` : part;
    current = current?.folders.find((f) => f.path === trail);
    if (!current) return null;
  }
  return current ?? null;
}

function FolderRow({ folder, onOpen }: { folder: BrainFolder; onOpen: () => void }) {
  return (
    <li>
      <button
        className="flex w-full select-none items-center gap-4 px-5 py-3 text-left active:bg-white/[0.06]"
        data-testid="mobile-brain-folder"
        onClick={onOpen}
        type="button"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-300">
          <IconFolder className="size-[22px]" stroke={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-semibold tracking-tight text-white">{folder.name}</span>
          <span className="mt-0.5 block text-[14px] text-white/45">
            {folder.count.toLocaleString("de-DE")} {folder.count === 1 ? "Notiz" : "Notizen"}
          </span>
        </span>
        <IconChevronRight className="size-5 shrink-0 text-white/25" stroke={1.75} />
      </button>
    </li>
  );
}

function FileRow({ name, sub, onOpen }: { name: string; sub?: string; onOpen: () => void }) {
  return (
    <li>
      <button
        className="flex w-full select-none items-center gap-4 px-5 py-2.5 text-left active:bg-white/[0.06]"
        data-testid="mobile-brain-file"
        onClick={onOpen}
        type="button"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-white/60">
          <IconFileText className="size-[20px]" stroke={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium text-white">{name}</span>
          {sub ? <span className="mt-0.5 block truncate text-[13px] text-white/40">{sub}</span> : null}
        </span>
      </button>
    </li>
  );
}

const COLLAPSED_KEY = "connect.mobile.brainNotesCollapsed";

export function MobileBrainNotes({
  needle,
  onOpenNote,
}: {
  needle: string;
  onOpenNote: (path: string) => void;
}) {
  const source = useBrainNotesSource();
  const queryClient = useQueryClient();
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const paths = useMemo(() => (source.files ? source.files.map((f) => f.path) : []), [source.files]);
  const root = useMemo(() => buildBrainFolders(paths), [paths]);
  // Über die Brücke zusätzlich im Notiztext suchen (am PC bleibt es bei der Pfadsuche wie bisher).
  const contentSearch = useQuery(brainBridgeSearchQueryOptions(needle, source.bridgeMode && !!source.files));
  const matches = useMemo(() => {
    if (!needle) return [];
    const byName = paths.filter((p) => p.toLowerCase().includes(needle));
    const hits = contentSearch.data?.kind === "ok" && contentSearch.data.data.available ? contentSearch.data.data.hits : [];
    const seen = new Set(byName);
    for (const hit of hits) if (!seen.has(hit.path)) (seen.add(hit.path), byName.push(hit.path));
    return byName.slice(0, 60);
  }, [needle, paths, contentSearch.data]);

  const toggle = () => {
    setCollapsed((current) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, current ? "0" : "1");
      } catch {
        /* privat */
      }
      return !current;
    });
  };

  /*
   * One-tap note creation. The user is asked for a title (a button-shaped
   * prompt is too wide on a phone, so the native dialog is fine), and the
   * file lands in `00 Inbox` — the same default the desktop editor uses.
   * The note is opened immediately on success so the user does not have to
   * dig through the tree to find what they just created.
   */
  const quickCreate = async () => {
    if (busy) return;
    const title = window.prompt("Neue Schnellnotiz", "");
    if (!title) return;
    setBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const safeName = title.trim().replace(/[\\/]+/g, "-").slice(0, 80) || `Notiz ${stamp}`;
      const { path } = await createBrainNote({
        folder: "00 Inbox",
        title: safeName,
        content: `# ${safeName}\n\n`,
      });
      await queryClient.invalidateQueries({ queryKey: ["brain"] });
      onOpenNote(path);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Konnte Notiz nicht anlegen.");
    } finally {
      setBusy(false);
    }
  };

  let body: ReactNode;
  if (source.loading) {
    body = (
      <p className="px-5 py-3 text-[14px] text-white/40">
        {source.bridgeMode ? "Brain wird über deinen PC geladen …" : "Brain wird geladen …"}
      </p>
    );
  } else if (!source.files) {
    body = (
      <p className="px-5 py-3 text-[14px] text-white/45" data-testid="mobile-brain-unavailable">
        {source.hint}
      </p>
    );
  } else if (needle) {
    body = matches.length ? (
      <ul>
        {matches.map((path) => (
          <FileRow
            key={path}
            name={path.split("/").pop()?.replace(/\.md$/i, "") ?? path}
            onOpen={() => onOpenNote(path)}
            sub={path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : undefined}
          />
        ))}
      </ul>
    ) : (
      <p className="px-5 py-3 text-[14px] text-white/40">Keine Notiz gefunden.</p>
    );
  } else {
    body = (
      <ul>
        {root.folders.map((folder) => (
          <FolderRow folder={folder} key={folder.path} onOpen={() => setFolderPath(folder.path)} />
        ))}
        {root.files.map((file) => (
          <FileRow key={file.path} name={file.name} onOpen={() => onOpenNote(file.path)} />
        ))}
      </ul>
    );
  }

  return (
    <section className="pb-1" data-testid="mobile-brain-notes">
      <button
        aria-expanded={!collapsed || !!needle}
        className="flex items-center gap-1.5 px-5 pb-1 pt-4 text-[15px] font-medium tracking-wide text-white/55 active:text-white/80"
        onClick={toggle}
        type="button"
      >
        <IconBrain className="size-[17px]" stroke={1.75} />
        Brain-Notizen
        {source.files ? (
          <span className="text-[13px] font-normal text-white/30">{paths.length.toLocaleString("de-DE")}</span>
        ) : null}
        <IconChevronDown
          className={cn("size-[17px] transition-transform duration-200", collapsed && !needle && "-rotate-90")}
          stroke={1.75}
        />
        {source.files ? (
          <button
            aria-label="Schnellnotiz anlegen"
            className="ml-auto flex size-7 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
            data-testid="mobile-brain-quick-create"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              void quickCreate();
            }}
            type="button"
          >
            <IconPencilPlus className="size-4" stroke={1.75} />
          </button>
        ) : null}
      </button>
      {collapsed && !needle ? null : body}
      <MobileBrainFolderSheet
        folderPath={folderPath}
        onClose={() => setFolderPath(null)}
        onNavigate={setFolderPath}
        onOpenNote={onOpenNote}
        root={root}
      />
    </section>
  );
}

function MobileBrainFolderSheet({
  root,
  folderPath,
  onNavigate,
  onClose,
  onOpenNote,
}: {
  root: BrainFolder;
  folderPath: string | null;
  onNavigate: (path: string) => void;
  onClose: () => void;
  onOpenNote: (path: string) => void;
}) {
  if (folderPath === null) return null;
  const folder = findFolder(root, folderPath);
  const parent = folderPath.includes("/") ? folderPath.slice(0, folderPath.lastIndexOf("/")) : null;
  return (
    <div
      className="dark connect-mobile-home fixed inset-0 z-[80] flex flex-col bg-[#07080c] text-white"
      data-testid="mobile-brain-folder-sheet"
      role="dialog"
      aria-label={folder?.name ?? "Ordner"}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-2 pb-1.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          aria-label="Zurück"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white active:bg-white/10"
          onClick={() => (parent ? onNavigate(parent) : onClose())}
          type="button"
        >
          <IconChevronLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold">{folder?.name ?? "Ordner"}</p>
          {parent ? <p className="truncate text-[12px] text-white/40">{parent}</p> : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {folder ? (
          <ul>
            {folder.folders.map((child) => (
              <FolderRow folder={child} key={child.path} onOpen={() => onNavigate(child.path)} />
            ))}
            {folder.files.map((file) => (
              <FileRow key={file.path} name={file.name} onOpen={() => onOpenNote(file.path)} />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-[14px] text-white/45">Ordner nicht gefunden.</p>
        )}
      </div>
    </div>
  );
}

/** Vollbild-Markdown-Ansicht einer Brain-Notiz (Handy). Wiki-Links springen innerhalb der Ansicht. */
export function MobileMarkdownView({ path, onClose }: { path: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  const source = useBrainNotesSource();
  const [stack, setStack] = useState<string[]>([]);
  useEffect(() => setStack(path ? [path] : []), [path]);
  const files = useMemo(() => (source.files ? source.files.map((f) => f.path) : []), [source.files]);
  if (!path || stack.length === 0) return null;
  const current = stack[stack.length - 1];
  const title = current.split("/").pop()?.replace(/\.md$/i, "") ?? current;
  const back = () => (stack.length > 1 ? setStack((s) => s.slice(0, -1)) : onClose());
  return (
    <div
      className="dark fixed inset-0 z-[95] flex flex-col bg-[#07080c] text-foreground"
      data-testid="mobile-markdown-view"
      role="dialog"
      aria-label={title}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-2 pb-1.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          aria-label="Zurück"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white active:bg-white/10"
          onClick={back}
          type="button"
        >
          <IconChevronLeft className="size-6" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[16px] font-semibold text-white">{title}</p>
        {source.bridgeMode ? null : <button
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-medium text-white active:bg-white/20"
          data-testid="mobile-markdown-show-in-brain"
          onClick={() => {
            onClose();
            void navigate({ to: "/brain", search: { focus: current } });
          }}
          type="button"
        >
          <IconBrain className="size-4" stroke={1.8} />
          Im Brain zeigen
        </button>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] [&_.brain-reader>div:first-child]:flex-wrap [&_.brain-reader>div:first-child]:gap-y-1 [&_.brain-reader>div:first-child]:[overflow-wrap:normal]">
        {source.bridgeMode ? (
          <BridgeNoteReader files={files} onOpen={(next) => setStack((s) => [...s, next])} path={current} />
        ) : (
          <BrainNoteReader files={files} onOpen={(next) => setStack((s) => [...s, next])} path={current} />
        )}
      </div>
    </div>
  );
}

/** Notiz über die Handy-Brücke (Vercel): gleiche Darstellung wie BrainNoteReader, nur lesend, ohne Rückverweise. */
function BridgeNoteReader({ path, files, onOpen }: { path: string; files: string[]; onOpen: (path: string) => void }) {
  const file = useQuery(brainBridgeFileQueryOptions(path, true));
  if (file.isPending) return <p className="px-1 pt-6 text-[14px] text-white/45">Notiz wird vom PC geladen …</p>;
  const answer = file.data;
  if (!answer || answer.kind !== "ok" || !answer.data.available) {
    const reason =
      answer?.kind === "ok" && !answer.data.available ? answer.data.reason : bridgeHint(answer);
    return (
      <p className="px-1 pt-6 text-[14px] text-white/55" data-testid="mobile-markdown-bridge-error">
        {reason}
      </p>
    );
  }
  const { properties, body } = parseFrontmatter(answer.data.file.content);
  const crumbs = path.replace(/\.md$/i, "").split("/");
  const titleProp = properties.find((p) => p.key === "title")?.values[0];
  const firstLine = body.trimStart().split("\n")[0] ?? "";
  const h1 = firstLine.startsWith("# ") ? firstLine.slice(2).trim() : null;
  const title = h1 ?? titleProp ?? crumbs[crumbs.length - 1];
  const rest = h1 ? body.trimStart().slice(firstLine.length) : body;
  return (
    <article className="brain-reader px-1 pt-2 pb-10" data-testid="mobile-markdown-bridge">
      <div className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
        <span>Brain</span>
        {crumbs.map((crumb, index) => (
          <span className="flex items-center gap-1" key={`${crumb}-${index}`}>
            <IconChevronRight className="size-3 opacity-50" />
            <span className={index === crumbs.length - 1 ? "text-foreground/80" : undefined}>{crumb}</span>
          </span>
        ))}
        <span className="ml-auto shrink-0 pl-3">
          {new Date(answer.data.file.mtime).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}
        </span>
      </div>
      <h1 className="!mt-0 !mb-3 !border-0 !text-[2.1rem] !leading-tight !font-bold">{title}</h1>
      <BrainMarkdownBody files={files} fromPath={path} markdown={rest} onOpen={onOpen} />
    </article>
  );
}
