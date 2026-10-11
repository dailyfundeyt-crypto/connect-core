"use client";

import {
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconFolderPlus,
  IconNote,
  IconPlus,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
  type FolderNames,
  folderName,
  noteLabel,
} from "@/extensions/spark/notes/format";
import {
  createFolder,
  deleteFolder,
  GENERAL_FOLDER_ID,
  listFolders,
  notesInFolder,
  slugForFolder,
  subscribeFolders,
  type NoteFolder,
} from "@/extensions/spark/notes/folders";
import { type NewFolderResult, NewFolderDialog } from "@/extensions/spark/components/new-folder-dialog";
import {
  createNote,
  deleteNote,
  listNotes,
  releaseNotesFromFolder,
  subscribeNotes,
} from "@/extensions/spark/notes/store";
import { notePreview, type SparkNote } from "@/extensions/spark/notes/types";
import {
  type ConnectProject,
  listProjects,
  subscribeProjects,
} from "@/lib/companies/projects";
import { subscribeCompanies } from "@/lib/companies/store";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

/**
 * Spark-Notizen — Sidebar-Bereich.
 *
 * Aufbau, absichtlich gleich zur Gruppen-Navigation darüber, damit das
 * Einsetzen nicht wie ein fremdes Bauteil wirkt: Label „Notizen", eine
 * Kopfzeile mit Plus-Knopf, darunter die Notizen nach Gruppe sortiert.
 *
 * Zuständigkeiten:
 * - **Plus-Knopf** legt eine leere Notiz an und öffnet sie sofort. Ohne diese
 *   Bedienung muss man die Notiz erst in einer fremden Route suchen.
 * - **Kontextmenü** auf jeder Notiz: Umbenennen, Verschieben, Löschen.
 * - **Suche** filtert Titel und Vorspautext; eine leere Liste bei aktiver
 *   Suche sagt das, statt „Keine Notizen" zu behaupten.
 *
 * Verschwindet komplett, wenn die Spark-Erweiterung in den Einstellungen
 * deaktiviert ist — dafür sorgt `ExtensionsSidebarSlot`, nicht diese Datei.
 */
export function SparkNotesNav({ searching }: { searching: boolean }) {
  const navigate = useNavigate();
  const { state: sidebarState } = useSidebar();
  const iconRail = sidebarState === "collapsed";

  const [companyId, setCompanyId] = useState<string | null>(() =>
    readActiveCompanyId(),
  );
  const [notes, setNotes] = useState<SparkNote[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [projects, setProjects] = useState<ConnectProject[]>([]);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  /*
   * Eine offene Suche und eine geschlossene Gruppe schließen sich nicht
   * aus, aber die Liste soll dann nicht trotzdem filtern — wer nach etwas
   * sucht, will alles sehen, was passt, wo auch immer es liegt.
   */
  useEffect(() => {
    if (searching) setQuery("");
  }, [searching]);

  useEffect(() => {
    const sync = () => setCompanyId(readActiveCompanyId());
    sync();
    window.addEventListener("connect-active-company", sync);
    window.addEventListener("storage", sync);
    const offCompanies = subscribeCompanies(sync);
    return () => {
      window.removeEventListener("connect-active-company", sync);
      window.removeEventListener("storage", sync);
      offCompanies();
    };
  }, []);

  useEffect(() => {
    const refresh = () => setNotes(companyId ? listNotes(companyId) : []);
    refresh();
    return subscribeNotes(refresh);
  }, [companyId]);

  useEffect(() => {
    const refresh = () => setFolders(companyId ? listFolders(companyId) : []);
    refresh();
    return subscribeFolders(refresh);
  }, [companyId]);

  useEffect(() => {
    const refresh = () => setProjects(companyId ? listProjects(companyId) : []);
    refresh();
    return subscribeProjects(refresh);
  }, [companyId]);

  const folderNames = useMemo<FolderNames>(() => {
    const names: FolderNames = {};
    for (const project of projects) names[project.id] = project.name;
    return names;
  }, [projects]);

  /*
   * Ordner kommen aus dem Ordner-Store, nicht aus den Agenten-Gruppen.
   * Beides ist ein „folderId" auf der Notiz, aber es sind verschiedene Konzepte —
   * siehe `notes/folders.ts`. Die Gruppennamen bleiben als Auflösung für Notizen,
   * die noch an eine Gruppe hängen, damit beim Umstieg nichts ins Leere zeigt.
   */
  const grouped = useMemo(
    () => groupByFolder(notes, folders, folderNames, query.trim().toLowerCase()),
    [notes, folders, folderNames, query],
  );

  const openNote = useCallback(
    (note: SparkNote) => {
      if (!companyId) return;
      void navigate({
        to: "/company/$companyId",
        params: { companyId },
        search: { level: 2, note: note.id },
      });
    },
    [companyId, navigate],
  );

  const addNote = useCallback(() => {
    if (!companyId) return;
    const note = createNote({ companyId });
    openNote(note);
  }, [companyId, openNote]);

  /*
   * Der Vault-Pfad folgt dem Namen, ist aber nicht der Name: „Wissen & mehr"
   * wird zu „Wissen mehr", weil `&` auf Windows im Verzeichnisnamen stört.
   * `slugForFolder` entscheidet das, nicht der Dialog.
   */
  const addFolder = useCallback(
    (result: NewFolderResult) => {
      if (!companyId || !result) return;
      createFolder({
        companyId,
        name: result.name,
        vaultPath: slugForFolder(result.name),
      });
    },
    [companyId],
  );

  const removeFolder = useCallback(
    (folder: NoteFolder) => {
      if (!companyId) return;
      const orphans = notesInFolder(notes, folder.id);
      const message =
        orphans > 0
          ? `Ordner „${folder.name}" löschen? ${orphans} Notiz${orphans === 1 ? "" : "en"} wandern danach nach „Allgemein" — es geht nichts verloren.`
          : `Ordner „${folder.name}" löschen?`;
      if (!window.confirm(message)) return;
      deleteFolder(companyId, folder.id);
      releaseNotesFromFolder(folder.id);
    },
    [companyId, notes],
  );

  /*
   * Ohne Company gibt es keinen Speicherort. Das ist ein echter Zustand
   * (Onboarding noch nicht abgeschlossen) und kein Fehler — deshalb der Text
   * sagt, was zu tun ist, statt eine leere Liste zu zeigen.
   */
  if (!companyId) return null;

  if (iconRail) {
    return (
      <div className="mb-3 flex flex-col items-center">
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarMenuItem className="group-data-[collapsible=icon]:flex">
                <SidebarMenuButton
                  aria-label="Neue Notiz"
                  className="size-9 justify-center rounded-xl text-sidebar-foreground/55"
                  onClick={addNote}
                />
              </SidebarMenuItem>
            }
          >
            <IconPlus aria-hidden className="size-4" stroke={1.75} />
          </TooltipTrigger>
          <TooltipContent side="right">Neue Notiz</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  const isSearching = query.trim().length > 0;
  const totalMatching = grouped.reduce(
    (sum, group) => sum + group.notes.length,
    0,
  );

  return (
    <div className="mb-3" data-extension="spark">
      <div className="flex items-center pr-1">
        <SidebarGroupLabel className="mb-0.5 h-7 flex-1 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
          Notizen
        </SidebarGroupLabel>
        <Button
          aria-label="Neuer Ordner"
          className="size-6 shrink-0 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={() => setFolderDialogOpen(true)}
          size="icon"
          title="Neuer Ordner"
          type="button"
          variant="ghost"
        >
          <IconFolderPlus aria-hidden className="size-3.5" stroke={1.75} />
        </Button>
        <Button
          aria-label="Neue Notiz"
          className="size-6 shrink-0 rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={addNote}
          size="icon"
          title="Neue Notiz"
          type="button"
          variant="ghost"
        >
          <IconPlus aria-hidden className="size-3.5" stroke={1.75} />
        </Button>
      </div>

      <NewFolderDialog
        onCreate={addFolder}
        onOpenChange={setFolderDialogOpen}
        open={folderDialogOpen}
      />

      {notes.length > 4 ? (
        <div className="relative mb-1 px-0.5">
          <IconSearch
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sidebar-foreground/40"
            stroke={1.75}
          />
          <input
            aria-label="Notizen durchsuchen"
            className="h-7 w-full rounded-lg border border-transparent bg-sidebar-accent/50 pr-2 pl-7 text-xs outline-none placeholder:text-sidebar-foreground/40 focus:border-sidebar-border focus-visible:ring-2 focus-visible:ring-ring/40"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Notizen suchen…"
            type="search"
            value={query}
          />
        </div>
      ) : null}

      {notes.length === 0 ? (
        <EmptyNotes onCreate={addNote} />
      ) : isSearching && totalMatching === 0 ? (
        <p className="px-2 py-1.5 text-[11px] text-sidebar-foreground/45">
          Nichts gefunden für „{query.trim()}".
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 px-0.5">
          {grouped.map((group) => {
            const isOpen = !isSearching && !(collapsed[group.key] ?? false);
            return (
              <li key={group.key}>
                {group.key === GENERAL_FOLDER_ID && grouped.length === 1 ? null : (
                  <FolderRow
                    count={group.notes.length}
                    folder={group.folder}
                    isOpen={isOpen}
                    label={group.label}
                    onDelete={group.folder ? () => removeFolder(group.folder!) : undefined}
                    onToggle={() =>
                      setCollapsed((prev) => ({
                        ...prev,
                        [group.key]: !(prev[group.key] ?? false),
                      }))
                    }
                  />
                )}

                {isOpen ? (
                  <ul className="mt-0.5 flex flex-col gap-0.5">
                    {group.notes.map((note) => (
                      <li key={note.id}>
                        <NoteRow
                          note={note}
                          onOpen={() => openNote(note)}
                          onDelete={() => {
                            if (
                              window.confirm(
                                `Notiz „${noteLabel(note)}" wirklich löschen?`,
                              )
                            ) {
                              deleteNote(note.id);
                            }
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * One folder line: collapse toggle plus, for real folders, a context menu.
 *
 * Split out because the row now has two independent targets — the button that
 * folds the list and the menu that renames or deletes — and folding both into
 * one element made the menu swallow the click.
 */
function FolderRow({
  count,
  folder,
  isOpen,
  label,
  onDelete,
  onToggle,
}: {
  count: number;
  folder: NoteFolder | undefined;
  isOpen: boolean;
  label: string;
  onDelete: (() => void) | undefined;
  onToggle: () => void;
}) {
  const toggle = (
    <button
      aria-expanded={isOpen}
      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] font-medium tracking-tight text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      onClick={onToggle}
      type="button"
    >
      <IconFolder aria-hidden className="size-3" stroke={1.75} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{count}</span>
      <IconChevronRight
        aria-hidden
        className={cn(
          "size-3 shrink-0 transition-transform duration-150",
          isOpen && "rotate-90",
        )}
        stroke={1.75}
      />
    </button>
  );

  // „Allgemein" and leftover agent groups have no folder to act on.
  if (!folder || !onDelete) return toggle;

  return (
    <ContextMenu>
      <ContextMenuTrigger>{toggle}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-48 rounded-xl p-1.5">
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          <IconTrash className="size-4" />
          Ordner löschen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function NoteRow({
  note,
  onOpen,
  onDelete,
}: {
  note: SparkNote;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const activeNoteId = useParams({
    strict: false,
    select: (params) => (params as { note?: string }).note,
  });
  const preview = notePreview(note.content, 48);
  const isOpen = activeNoteId === note.id;

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <SidebarMenuItem>
          <SidebarMenuButton
            className={cn(
              "h-auto items-start gap-2.5 rounded-xl px-2 py-1.5",
              isOpen && "bg-sidebar-accent",
            )}
            isActive={isOpen}
            onClick={onOpen}
            tooltip={noteLabel(note)}
          >
            <span
              aria-hidden
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-700 ring-1 ring-sky-200/80 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800/60"
            >
              <IconFileText className="size-3.5" stroke={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] tracking-tight">
                {noteLabel(note)}
              </span>
              <span className="block truncate text-[11px] text-sidebar-foreground/45">
                {preview || relativeTime(note.updatedAt)}
              </span>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52 rounded-xl p-1.5">
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={onOpen}
        >
          <IconNote className="size-4" />
          Öffnen
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          <IconTrash className="size-4" />
          Notiz löschen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Leerzustand: ein Satz, ein Knopf. Kein toter Bereich. */
function EmptyNotes({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      onClick={onCreate}
      type="button"
    >
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 ring-1 ring-sky-200/80 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800/60"
      >
        <IconPlus className="size-3.5" stroke={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">Neue Notiz</span>
        <span className="block truncate text-[11px] text-sidebar-foreground/45">
          Text, Bilder, Tabellen
        </span>
      </span>
    </button>
  );
}

type NoteGroup = {
  key: string;
  label: string;
  /** The stored folder, or `undefined` for „Allgemein" and group leftovers. */
  folder: NoteFolder | undefined;
  notes: SparkNote[];
};

/**
 * Gruppiert nach Ordner und filtert dabei.
 *
 * „Allgemein" kommt nach den benannten Gruppen, nicht davor: eine Notiz ohne
 * Ordner ist die Ausnahme, keine Hauptzeile. Die Treffer werden innerhalb der
 * Gruppe nach Aktualität sortiert — `listNotes` liefert das schon, aber nach
 * dem Filtern bleibt die Reihenfolge nur dann so, wenn wir nicht erneut
 * sortieren.
 */
function groupByFolder(
  notes: SparkNote[],
  folders: NoteFolder[],
  names: FolderNames,
  needle: string,
): NoteGroup[] {
  const matching = needle
    ? notes.filter((note) => {
        const haystack = `${noteLabel(note)} ${notePreview(note.content, 200)}`;
        return haystack.toLowerCase().includes(needle);
      })
    : notes;

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const buckets = new Map<string, SparkNote[]>();
  for (const note of matching) {
    const key = note.folderId ?? GENERAL_FOLDER_ID;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(note);
    else buckets.set(key, [note]);
  }

  const groups: NoteGroup[] = [];
  for (const [key, groupNotes] of buckets) {
    const folder = folderById.get(key);
    groups.push({
      key,
      label: folder
        ? folder.name
        : key === GENERAL_FOLDER_ID
          ? "Allgemein"
          : folderName(key, names),
      folder,
      notes: groupNotes,
    });
  }

  groups.sort((a, b) => {
    if (a.key === GENERAL_FOLDER_ID) return 1;
    if (b.key === GENERAL_FOLDER_ID) return -1;
    return a.label.localeCompare(b.label, "de");
  });

  return groups;
}

function readActiveCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("connect.activeCompanyId");
}
