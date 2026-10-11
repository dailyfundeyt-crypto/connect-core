"use client";

import {
  IconArrowLeft,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconFolder,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { NoteEditor } from "@/extensions/spark/editor/note-editor";
import { noteLabel } from "@/extensions/spark/notes/format";
import { noteFileName, toMarkdown } from "@/extensions/spark/notes/markdown";
import {
  deleteNote,
  getNote,
  subscribeNotes,
  updateNote,
} from "@/extensions/spark/notes/store";
import type { SparkNote } from "@/extensions/spark/notes/types";
import {
  type ConnectProject,
  listProjects,
  subscribeProjects,
} from "@/lib/companies/projects";

/**
 * Notiz-Editor — Hauptbereich des Workspace.
 *
 * Eigene Route (`?note=` an der Company-Workspace), kein Dialog: der Editor
 * braucht Höhe, und ein Dialog über einem Chat, in dem man denselben Text auch
 * bespricht, ist genau die falsche Ebene.
 *
 * Der Titel ist ein eigenes Feld, kein H1 im Dokument. Grund: er muss in der
 * Sidebar und in der Notizliste stehen, ohne das Dokument zu verändern, und
 * `listNotes` soll ihn lesen können, ohne den Inhalt zu parsen.
 */
export function NoteWorkspace({
  companyId,
  noteId,
}: {
  companyId: string;
  noteId: string;
}) {
  const navigate = useNavigate();
  const [note, setNote] = useState<SparkNote | undefined>(() =>
    getNote(noteId),
  );
  const [projects, setProjects] = useState<ConnectProject[]>(() =>
    listProjects(companyId),
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const refresh = () => setNote(getNote(noteId));
    refresh();
    return subscribeNotes(refresh);
  }, [noteId]);

  useEffect(() => {
    const refresh = () => setProjects(listProjects(companyId));
    refresh();
    return subscribeProjects(refresh);
  }, [companyId]);

  const close = useCallback(() => {
    void navigate({
      to: "/company/$companyId",
      params: { companyId },
      search: { level: 2 },
    });
  }, [companyId, navigate]);

  const onTitleChange = useCallback(
    (title: string) => {
      updateNote(noteId, { title });
    },
    [noteId],
  );

  const onMove = useCallback(
    (folderId: string | null) => {
      updateNote(noteId, { folderId });
    },
    [noteId],
  );

  const onDelete = useCallback(() => {
    if (
      note &&
      !window.confirm(`Notiz „${noteLabel(note)}" wirklich löschen?`)
    ) {
      return;
    }
    deleteNote(noteId);
    close();
  }, [note, noteId, close]);

  const onCopyMarkdown = useCallback(() => {
    if (!note) return;
    const markdown = toMarkdown({ ...note, content: note.content });
    void navigator.clipboard
      .writeText(markdown)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* Zwischenablage blockiert — der Export-Knopf bleibt trotzdem da. */
      });
  }, [note]);

  const onDownload = useCallback(() => {
    if (!note) return;
    const markdown = toMarkdown(note);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = noteFileName(note);
    anchor.click();
    URL.revokeObjectURL(url);
  }, [note]);

  /*
   * Gelöscht zwischen Klick und Render (z. B. in einem zweiten Tab): statt
   * einer leeren Editorfläche mit kaputten Aktionen lieber zurück zur
   * Gruppenansicht.
   */
  useEffect(() => {
    if (note) return;
    close();
  }, [note, close]);

  const folderLabel = useMemo(() => {
    if (!note?.folderId) return "Allgemein";
    return projects.find((p) => p.id === note.folderId)?.name ?? "Allgemein";
  }, [note, projects]);

  if (!note) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <SidebarToggleBar />

      <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2 sm:px-4">
        <Button
          aria-label="Zurück zur Übersicht"
          className="size-8 shrink-0 rounded-lg text-muted-foreground"
          onClick={close}
          size="icon"
          title="Zurück"
          type="button"
          variant="ghost"
        >
          <IconArrowLeft aria-hidden className="size-4" stroke={1.75} />
        </Button>

        <FolderPicker label={folderLabel} onMove={onMove} projects={projects} />

        <div className="ml-auto flex items-center gap-1">
          <Button
            className="hidden h-8 gap-1.5 rounded-lg px-2.5 text-xs sm:inline-flex"
            onClick={onCopyMarkdown}
            size="sm"
            type="button"
            variant="ghost"
          >
            <IconCopy aria-hidden className="size-3.5" stroke={1.75} />
            {copied ? "Kopiert" : "Markdown"}
          </Button>
          <Button
            aria-label="Als Markdown-Datei speichern"
            className="size-8 rounded-lg text-muted-foreground"
            onClick={onDownload}
            size="icon"
            title="Als .md speichern"
            type="button"
            variant="ghost"
          >
            <IconDownload aria-hidden className="size-4" stroke={1.75} />
          </Button>
          <Button
            aria-label="Notiz löschen"
            className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            size="icon"
            title="Notiz löschen"
            type="button"
            variant="ghost"
          >
            <IconTrash aria-hidden className="size-4" stroke={1.75} />
          </Button>
        </div>
      </header>

      {/*
       * Notion-Look: Titel und Text teilen sich eine schmale, linksbündige
       * Spalte und hängen ohne Trennlinie aneinander. Beide sind schmal
       * genug, dass eine Zeile mit ~70 Zeichen noch passt — alles darüber
       * liest sich wie Fließtext und nicht wie Code.
       */}
      <div className="spark-doc-column">
        <input
          aria-label="Notiz-Titel"
          className="w-full bg-transparent text-[2.125rem] font-bold leading-[1.15] tracking-[-0.02em] text-foreground outline-none placeholder:font-bold placeholder:text-foreground/20 sm:text-[2.5rem]"
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Neue Seite"
          value={note.title}
        />
      </div>

      <NoteEditor note={note} />
    </div>
  );
}

/** Verschiebt die Notiz in eine Gruppe oder zurück nach „Allgemein". */
function FolderPicker({
  label,
  projects,
  onMove,
}: {
  label: string;
  projects: ConnectProject[];
  onMove: (folderId: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="h-8 max-w-[10rem] gap-1.5 rounded-lg px-2.5 text-xs"
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconFolder aria-hidden className="size-3.5 shrink-0" stroke={1.75} />
        <span className="truncate">{label}</span>
        <IconChevronDown aria-hidden className="size-3 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-xl p-1.5">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide opacity-60">
          Gruppe
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={() => onMove(null)}
        >
          <IconFolder aria-hidden className="size-4" />
          Allgemein
        </DropdownMenuItem>
        {projects.length > 0 ? <DropdownMenuSeparator /> : null}
        {projects.map((project) => (
          <DropdownMenuItem
            className="gap-2 rounded-lg px-2.5 py-2"
            key={project.id}
            onClick={() => onMove(project.id)}
          >
            <IconFolder aria-hidden className="size-4" />
            <span className="truncate">{project.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Spark ist aus, aber die URL zeigt eine Notiz.
 *
 * Sichtbar und benannt statt still zur Übersicht umgeleitet: wer hier landet,
 * hat auf eine Notiz geklickt. Ihm zu sagen, dass es sie nicht gibt, wäre
 * falsch — sie gibt es, nur ist das Modul abgeschaltet.
 */
export function SparkDisabledNote() {
  return (
    <>
      <SidebarToggleBar />
      <Empty className="m-6 border border-dashed">
        <EmptyHeader>
          <EmptyTitle>Spark ist ausgeschaltet</EmptyTitle>
          <EmptyDescription>
            Für Notizen muss die Erweiterung „Spark" aktiv sein. Du kannst sie
            unter Einstellungen → Erweiterungen einschalten.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}

/** Spark ist an, aber die Notiz-Id aus der URL existiert nicht (mehr). */
export function MissingNote() {
  return (
    <>
      <SidebarToggleBar />
      <Empty className="m-6 border border-dashed">
        <EmptyHeader>
          <EmptyTitle>Notiz nicht gefunden</EmptyTitle>
          <EmptyDescription>
            Diese Notiz wurde gelöscht oder gehört zu einer anderen Firma.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
