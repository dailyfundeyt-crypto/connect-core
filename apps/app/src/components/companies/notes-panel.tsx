import {
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconFileText,
  IconFolder,
  IconLink,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  copyNote,
  createNote,
  deleteNote,
  getNotes,
  getOpenNoteId,
  noteLabel,
  setOpenNoteId,
  subscribeNotes,
  updateNote,
  type Note,
  type NoteBlock,
} from "@/lib/companies/notes";
import {
  backlinksFor,
  blocksToMarkdown,
  markdownToBlocks,
  wikilinkResolver,
} from "@/lib/companies/notes-markdown";
import { NoteBlockEditor } from "@/components/companies/note-editor/note-block-editor";
import { FormatBubble } from "@/components/companies/note-editor/format-bubble";
import { cn } from "@/lib/utils";

/** How long after the last keystroke we write. Short enough that nothing is lost. */
const AUTOSAVE_DELAY_MS = 500;

export type NotesFolder = { id: string; label: string };

/**
 * The notes surface for one company.
 *
 * Lives inside the Lab main panel rather than on its own route, because that is where the sidebar
 * "+" sits and where the user is already looking. The rule the panel follows: there is always a
 * note to type into. When nothing is stored it creates an empty one; when the open note is deleted
 * it falls back to the most recent one, and to a fresh empty note when the list is empty.
 *
 * Light, like the rest of this panel (`bg-[#f5f5f7]`, `text-neutral-900`). Every colour here is a
 * neutral or a black-alpha — the same tokens the worklog uses — so the two never disagree.
 */
export function NotesPanel({
  companyId,
  folders,
}: {
  companyId: string;
  /** Folders the sidebar can create notes into, in display order. */
  folders: NotesFolder[];
}) {
  const [notes, setNotes] = useState<Note[]>(() => getNotes(companyId).notes);
  const [copied, setCopied] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => {
    const stored = getNotes(companyId).notes;
    return stored[0]?.id ?? null;
  });

  useEffect(() => {
    const refresh = () => setNotes(getNotes(companyId).notes);
    refresh();
    return subscribeNotes(refresh);
  }, [companyId]);

  /* The confirmation has to disappear on its own — nothing else on screen will replace it. */
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 4000);
    return () => clearTimeout(timer);
  }, [copied]);

  const open = useMemo(
    () => notes.find((n) => n.id === openId) ?? null,
    [notes, openId],
  );

  /*
   * ALWAYS SOMETHING TO WRITE INTO.
   *
   * Three ways this panel can end up with nothing open, and all three end here: the company has no
   * notes yet, the open note was deleted in another tab, or the stored id points at a note that is
   * gone. Creating one is the fix, and it is deliberately a real (persisted) note rather than a
   * scratch buffer — an unsaved draft would vanish on reload and the user would think their typing
   * was lost.
   */
  useEffect(() => {
    if (open) return;
    const next = notes[0] ?? createNote(companyId);
    setOpenId(next.id);
    setOpenNoteId(companyId, next.id);
  }, [open, notes, companyId]);

  /*
   * The sidebar owns the selection.
   *
   * Both live in different component trees, so the panel cannot be handed the id as a prop. Instead
   * it follows the stored one: the sidebar writes `setOpenNoteId`, the store fires `NOTES_CHANGED`,
   * and the panel picks that up. One source of truth means clicking a note in the list and creating
   * one from the "+" button cannot disagree about what is on screen.
   */
  useEffect(() => {
    const sync = () => setOpenId(getOpenNoteId(companyId));
    sync();
    return subscribeNotes(sync);
  }, [companyId]);

  const select = useCallback(
    (id: string) => {
      setOpenId(id);
      setOpenNoteId(companyId, id);
    },
    [companyId],
  );

  const remove = useCallback(
    (note: Note) => {
      if (
        !window.confirm(`Notiz „${noteLabel(note)}" wirklich löschen?`)
      ) {
        return;
      }
      deleteNote(companyId, note.id);
      // The effect above opens the next one, or creates an empty note when none is left.
    },
    [companyId],
  );

  const move = useCallback(
    (note: Note, folderId: string | null) => {
      updateNote(companyId, note.id, { folderId });
    },
    [companyId],
  );

  if (!open) return null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-black/8 bg-white/92 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <IconFileText className="size-4 text-neutral-400" stroke={1.5} />
          <span className="text-[12px] font-medium">Notizen</span>
          <FolderMenu
            folders={folders}
            note={open}
            onMove={(folderId) => move(open, folderId)}
          />
          <div className="ml-auto flex items-center gap-1">
            <CopyToFolderMenu
              companyId={companyId}
              folders={folders}
              note={open}
              onCopied={(label) => setCopied(label)}
            />
            <Button
              aria-label="Als Markdown-Datei speichern"
              className="size-7 rounded-lg text-neutral-500"
              onClick={() => downloadNote(open)}
              size="icon"
              title="Als .md speichern"
              type="button"
              variant="ghost"
            >
              <IconDownload className="size-4" stroke={1.5} />
            </Button>
            <Button
              aria-label="Notiz löschen"
              className="size-7 rounded-lg text-neutral-500 hover:text-red-600"
              onClick={() => remove(open)}
              size="icon"
              title="Notiz löschen"
              type="button"
              variant="ghost"
            >
              <IconTrash className="size-4" stroke={1.5} />
            </Button>
          </div>
        </div>
      </header>

      <NoteEditor
        companyId={companyId}
        key={open.id}
        note={open}
        notes={notes}
        onOpenNote={select}
      />

      {/*
        A copy is silent otherwise: the original stays put and the panel opens a note that looks
        identical, so nothing on screen would say the action happened. Auto-clears after 4s.
      */}
      {copied ? (
        <p
          className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-neutral-900/92 px-3.5 py-1.5 text-[12px] text-white shadow-lg backdrop-blur"
          role="status"
        >
          In {copied} kopiert
        </p>
      ) : null}
    </div>
  );
}

/**
 * Title + body, autosaving.
 *
 * Mounted with `key={note.id}` so switching notes starts a clean editor — otherwise the textarea
 * would keep the previous note's draft for a frame and, on a fast click through, overwrite the
 * wrong note. The timer is per-instance, so a pending save from the note you just left is not
 * cancelled by unmounting the one you are looking at.
 */
function NoteEditor({
  companyId,
  note,
  notes,
  onOpenNote,
}: {
  companyId: string;
  note: Note;
  /** Every note in this company, so links can be resolved and backlinks found. */
  notes: Note[];
  onOpenNote: (id: string) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveBody = useRef<{ title?: string; blocks?: NoteBlock[] }>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  /*
   * OLD NOTES GET CONVERTED ON OPEN, NOT ON INSTALL.
   *
   * Every note written before the block editor has a `body` and no `blocks`. Reading its Markdown
   * into blocks here means it opens as a real document immediately, and the conversion is written
   * back the first time anything is saved. Converting in bulk up front would touch every note in
   * every company on upgrade, which is a lot of localStorage writes for a change nobody asked for,
   * and a user with fifty notes would lose them all if the conversion had a bug.
   */
  const initialBlocks = useMemo<NoteBlock[]>(
    () => note.blocks ?? markdownToBlocks(note.body, wikilinkResolver(notes)),
    [note.blocks, note.body, notes],
  );

  /*
   * Notes offered behind `[[`, and the notes that link here.
   *
   * Both are derived from the same list, so a note created a moment ago is linkable immediately and
   * its backlinks show up without a reload. Backlinks are recomputed from the stored blocks rather
   * than from the live editor state — the editor writes to the store on a debounce, so reading the
   * live blocks would omit a link the user just typed until the save fired.
   */
  const wikiNotes = useMemo(
    () =>
      notes
        .filter((candidate) => candidate.id !== note.id)
        .map((candidate) => ({ id: candidate.id, title: noteLabel(candidate) }))
        .filter((candidate) => candidate.title !== "Ohne Titel"),
    [notes, note.id],
  );

  const backlinks = useMemo(
    () =>
      backlinksFor(notes, note.id, (candidate) =>
        candidate.blocks ?? markdownToBlocks(candidate.body),
      ),
    [notes, note.id],
  );

  // Debounced write: a sentence must not cause fifteen localStorage writes.
  const scheduleSave = useCallback(
    (patch: { title?: string; blocks?: NoteBlock[] }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        // `body` is written alongside so the Markdown export and any older client still see text.
        updateNote(companyId, note.id, {
          ...patch,
          ...(patch.blocks ? { body: blocksToMarkdown(patch.blocks) } : {}),
        });
        setSavedAt(
          new Date().toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      }, AUTOSAVE_DELAY_MS);
    },
    [companyId, note.id],
  );

  // A timer still waiting when the note is left would be lost, so the pending patch is flushed.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (saveBody.current.title || saveBody.current.blocks) {
        updateNote(companyId, note.id, {
          ...saveBody.current,
          ...(saveBody.current.blocks
            ? { body: blocksToMarkdown(saveBody.current.blocks) }
            : {}),
        });
      }
    },
    [companyId, note.id],
  );

  const editTitle = (value: string) => {
    setTitle(value);
    saveBody.current = { ...saveBody.current, title: value };
    scheduleSave({ title: value });
  };

  const setBlocks = useCallback(
    (blocks: NoteBlock[]) => {
      saveBody.current = { ...saveBody.current, blocks };
      scheduleSave({ blocks });
    },
    [scheduleSave],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
      <div className="mx-auto w-full max-w-3xl px-6 pb-24 pt-10">
        <input
          aria-label="Notiz-Titel"
          className="w-full bg-transparent text-[2rem] font-bold leading-[1.15] tracking-[-0.02em] outline-none placeholder:text-neutral-300"
          onChange={(event) => editTitle(event.target.value)}
          placeholder="Neue Seite"
          value={title}
        />

        <div className="mt-3">
          <NoteBlockEditor
            blocks={initialBlocks}
            onBlocksChange={setBlocks}
            onOpenNote={onOpenNote}
            wikiNotes={wikiNotes}
          />
        </div>

        {backlinks.length > 0 ? (
          <section className="mt-12 border-t border-black/8 pt-6">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-400">
              Verknüpft von
            </h2>
            <ul className="flex flex-col gap-1">
              {backlinks.map((source) => (
                <li key={source.id}>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                    onClick={() => onOpenNote(source.id)}
                    type="button"
                  >
                    <IconLink className="size-3.5 shrink-0 text-neutral-400" stroke={1.5} />
                    <span className="truncate">{noteLabel(source)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {/* The formatting bar follows the browser selection, so it lives at the document level. */}
      <FormatBubble containerRef={scrollRef} />

      {savedAt ? (
        <p className="mx-auto w-full max-w-3xl px-6 pb-6 text-[11px] text-neutral-400">
          Gespeichert {savedAt}
        </p>
      ) : null}
    </div>
  );
}

/** Moves the open note into a folder, or back to "Allgemein". */
function FolderMenu({
  folders,
  note,
  onMove,
}: {
  folders: NotesFolder[];
  note: Note;
  onMove: (folderId: string | null) => void;
}) {
  const current = folders.find((f) => f.id === note.folderId)?.label ?? "Allgemein";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="h-7 max-w-[12rem] gap-1.5 rounded-lg px-2 text-xs text-neutral-600"
            size="sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconFolder className="size-3.5 shrink-0" stroke={1.5} />
        <span className="truncate">{current}</span>
        <IconChevronDown className="size-3 shrink-0 opacity-60" stroke={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-xl p-1.5">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide opacity-60">
          Gruppe
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={() => onMove(null)}
        >
          <IconFolder className="size-4" stroke={1.5} />
          Allgemein
        </DropdownMenuItem>
        {folders.length > 0 ? <DropdownMenuSeparator /> : null}
        {folders.map((folder) => (
          <DropdownMenuItem
            className="gap-2 rounded-lg px-2.5 py-2"
            key={folder.id}
            onClick={() => onMove(folder.id)}
          >
            <IconFolder className="size-4" stroke={1.5} />
            <span className="truncate">{folder.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Copies the open note into another folder, or into "Allgemein".
 *
 * Separate from the folder picker next to it, which *moves*. Both are needed: filing a draft under
 * a second area is common, and moving the only copy to do it would leave a gap behind.
 */
function CopyToFolderMenu({
  companyId,
  folders,
  note,
  onCopied,
}: {
  companyId: string;
  folders: NotesFolder[];
  note: Note;
  onCopied: (folderLabel: string) => void;
}) {
  const copy = (folderId: string | null) => {
    const made = copyNote(companyId, note.id, folderId);
    if (!made) return;
    setOpenNoteId(companyId, made.id);
    onCopied(
      folders.find((f) => f.id === folderId)?.label ?? "Allgemein",
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Notiz in Ordner kopieren"
            className="size-7 rounded-lg text-neutral-500"
            title="In Ordner kopieren"
            type="button"
            variant="ghost"
          />
        }
      >
        <IconCopy className="size-4" stroke={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-xl p-1.5">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide opacity-60">
          In Ordner kopieren
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={() => copy(null)}
        >
          <IconFolder className="size-4" stroke={1.5} />
          Allgemein
        </DropdownMenuItem>
        {folders.length > 0 ? <DropdownMenuSeparator /> : null}
        {folders.map((folder) => (
          <DropdownMenuItem
            className="gap-2 rounded-lg px-2.5 py-2"
            key={folder.id}
            onClick={() => copy(folder.id)}
          >
            <IconFolder className="size-4" stroke={1.5} />
            <span className="truncate">{folder.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function downloadNote(note: Note): void {
  const markdown = noteMarkdown(note);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(noteLabel(note) || "notiz")
    .replace(/[\\/:*?"<>|]/g, "-")
    .slice(0, 60)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function noteMarkdown(note: Note): string {
  /*
   * Prefer the blocks, fall back to the body. A note that has never been opened in the block
   * editor has no blocks yet, and exporting its raw body is exactly right — that is still the only
   * copy of the text.
   */
  const content = note.blocks
    ? blocksToMarkdown(note.blocks)
    : note.body.trim();
  return [`# ${noteLabel(note)}`, "", content].join("\n");
}

/** Kept for the sidebar's compact trigger — it needs the same visual weight as `RailAction`. */
export const notesTriggerClass = cn(
  "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]",
);
