import {
  IconChevronRight,
  IconCopy,
  IconDots,
  IconFolder,
  IconFolderPlus,
  IconNote,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { RenameFolderDialog } from "@/components/companies/rename-folder-dialog";
import { revealInExplorer } from "@/lib/brain/queries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SidebarGroupLabel } from "@/components/ui/sidebar";
import { VaultNotesSection } from "@/components/companies/vault-notes-section";
import {
  copyNote,
  createNote,
  createNoteFolder,
  deleteNote,
  deleteNoteFolder,
  renameNoteFolder,
  getNotes,
  getOpenNoteId,
  getOpenVaultPath,
  listNoteFolders,
  listNotes,
  noteLabel,
  setOpenNoteId,
  setOpenVaultPath,
  subscribeNotes,
  updateNote,
  type Note,
  type NoteFolder,
} from "@/lib/companies/notes";
import { DND_NOTE, DND_NOTE_FROM } from "@/lib/companies/level3-tools";
import { cn } from "@/lib/utils";

export type NotesFolder = { id: string; label: string };

/**
 * The "new folder" dialog, local to the sidebar.
 *
 * Replaces `window.prompt`, which was what the group list used: a native prompt
 * cannot be styled, cannot be reached by the keyboard shortcut we would want, and
 * it says nothing about what a folder *is* — here it explains that notes filed
 * here become Markdown files in the Brain.
 *
 * Local rather than shared because only the sidebar creates folders today; a
 * shared module would be a guess about where else it is needed.
 */
export function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    // Focus without a delay would race the dialog's own mount animation; one
    // frame is enough for the element to exist and the keyboard path to work.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const trimmed = name.trim();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Ordner</DialogTitle>
          <DialogDescription>
            Notizen in diesem Ordner landen als Markdown-Dateien in deinem Brain
            und tauchen dort im Graphen auf.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed) return;
            onCreate(trimmed);
          }}
        >
          <Input
            aria-label="Ordnername"
            autoComplete="off"
            className="h-9"
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="z.B. Kundengespräche"
            ref={inputRef}
            value={name}
          />
          <DialogFooter className="mt-5">
            <Button
              onClick={() => onOpenChange(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Abbrechen
            </Button>
            <Button disabled={!trimmed} size="sm" type="submit">
              Ordner anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The notes list in the Lab sidebar, with the folders that hold them.
 *
 * The folders live under the "Notizen" label, not up in the app-group tree.
 *
 * The first version of this section had no folders of its own and filed notes
 * under tab groups, which put "Kundengespräche" up next to Vercel and Daytona —
 * a browser tab called like a notes folder. A note folder is a different object
 * from an app group and now has its own store in `notes.ts`, so it is listed and
 * created here, where someone looking for it will look.
 */
export function NotesSidebarSection({ companyId }: { companyId: string }) {
  const [notes, setNotes] = useState<Note[]>(() => getNotes(companyId).notes);
  const [noteFolders, setNoteFolders] = useState<NoteFolder[]>(() =>
    listNoteFolders(companyId),
  );
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  /*
   * Which folder the rename dialog is editing, or `null` when it is closed.
   *
   * The id rather than the folder itself: the tree re-reads from storage on every
   * change, so a folder captured in state would go stale the moment the dialog was
   * open and rename the wrong thing.
   */
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  /*
   * Why "Im Explorer öffnen" did not happen, or `null` when it did.
   *
   * A string in the sidebar rather than a toast: this build has no toast library,
   * and adding one for one message would be a bigger change than the message. It
   * clears itself after a few seconds because the common failure is the permanent
   * one -- running in a browser, where Explorer cannot be started at all -- and
   * that should not sit in the rail forever.
   */
  const [revealError, setRevealError] = useState<string | null>(null);

  const revealVaultPath = (path: string) => {
    void revealInExplorer(path)
      .then((reason) => {
        if (!reason) return;
        setRevealError(reason);
        window.setTimeout(() => setRevealError(null), 5000);
      })
      .catch(() =>
        setRevealError("Der Explorer ließ sich nicht öffnen."),
      );
  };
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});

  /*
   * Which note or vault file is open, and the callback that opens one.
   *
   * Both come from `lib/companies/notes`, which keeps the open item in
   * localStorage under a per-company key and announces changes on
   * `NOTES_CHANGED`. That is why this section takes a single `companyId` instead
   * of three props threaded through the sidebar: the reader lives in the main
   * panel, a different component tree, and the two cannot pass props to each
   * other. They already share this store, so they share it again here rather than
   * the sidebar growing state it does not own.
   *
   * `onOpenVaultFile` goes through the store rather than becoming a router link:
   * a link would put a folder of the whole vault into the URL and lose the
   * panel's own state.
   */
  const [openNoteId, setOpenNoteIdState] = useState<string | null>(() =>
    getOpenNoteId(companyId),
  );
  const [openVaultPath, setOpenVaultPathState] = useState<string | null>(() =>
    getOpenVaultPath(companyId),
  );

  useEffect(() => {
    setOpenNoteIdState(getOpenNoteId(companyId));
    setOpenVaultPathState(getOpenVaultPath(companyId));
    return subscribeNotes(() => {
      setOpenNoteIdState(getOpenNoteId(companyId));
      setOpenVaultPathState(getOpenVaultPath(companyId));
    });
  }, [companyId]);

  const selectNote = (id: string | null) => setOpenNoteId(companyId, id);
  const onOpenVaultFile = (path: string) => setOpenVaultPath(companyId, path);

  /*
   * Folders share the notes' subscription on purpose: `createNoteFolder` fires the
   * same event, so one listener keeps both lists honest and a folder cannot appear
   * without its name showing up.
   */
  useEffect(() => {
    const refresh = () => setNoteFolders(listNoteFolders(companyId));
    refresh();
    return subscribeNotes(refresh);
  }, [companyId]);

  // Newest first. Only notes filed under no folder live in "Allgemein".
  const loose = useMemo(
    () => listNotes(companyId, null),
    [companyId, notes],
  );

  const total = notes.length;

  /**
   * Folders as the row's context menu wants them: id plus label.
   *
   * Built here rather than passed in, because the folders are now this
   * component's own — the caller used to own them and they were app groups, which
   * is the thing this change removed.
   */
  const folderChoices: NotesFolder[] = noteFolders.map((folder) => ({
    id: folder.id,
    label: folder.label,
  }));

  const add = (folderId: string | null) => {
    const note = createNote(companyId, folderId);
    selectNote(note.id);
  };

  const open = (note: Note) => selectNote(note.id);

  /*
   * A copy is a second note, not a move. Opening the new one straight away is what makes the action
   * feel like "put this there too" rather than "something moved and I lost sight of it".
   */
  const copy = (note: Note, folderId: string | null) => {
    const made = copyNote(companyId, note.id, folderId);
    if (made) selectNote(made.id);
  };

  /*
   * A move leaves the note in place for the reader “” there is no new note and nothing to open “” so
   * the open id is deliberately left alone. Dragging the note you are reading is not a request to
   * navigate somewhere.
   */
  const move = (note: Note, folderId: string | null) => {
    if ((note.folderId ?? null) === folderId) return;
    updateNote(companyId, note.id, { folderId });
  };

  const remove = (note: Note) => {
    if (
      !window.confirm(
        `Notiz „${noteLabel(note)}“ wirklich löschen?\n\nDie Notiz wird aus Connect entfernt.`,
      )
    ) {
      return;
    }
    deleteNote(companyId, note.id);
  };

  /*
   * Deleting a folder is tidying up, not throwing work away -- `deleteNoteFolder`
   * sends its notes back to "Allgemein" rather than deleting them, and the dialog
   * says so by name and count. A folder that held work therefore needs no extra
   * warning, but it does need to say what will happen to that work, because
   * "löschen" next to a non-empty folder otherwise reads as deleting the notes.
   */
  const removeFolder = (folder: NoteFolder, count: number) => {
    const body =
      count > 0
        ? `Der Ordner „${folder.label}“ wird gelöscht.\n\nDie ${count} ${
            count === 1 ? "Notiz wandert" : "Notizen wandern"
          } nach „Allgemein“. Nichts geht verloren.`
        : `Der Ordner „${folder.label}“ wird gelöscht.`;
    if (!window.confirm(body)) return;
    deleteNoteFolder(companyId, folder.id);
  };

  const rename = (folder: NoteFolder) => setRenameFolderId(folder.id);
  const renameFolder = noteFolders.find((f) => f.id === renameFolderId);

  return (
    <>
      {/*
       * The list is capped and scrolls on its own.
       *
       * With the notes left to size themselves they grew to fill the whole rail:
       * measured, the section reached 1088px in a 1201px rail and pushed the
       * browser groups down to y=7954, which is seven screens below the fold. The
       * apps were in the store the whole time and simply never appeared, which is
       * what "the tabs disappear under the notes" was.
       *
       * `flex-1` is not enough on its own, and that is the whole trap. It sets
       * `flex-basis: 0` and `flex-grow: 1`, so the element grows into the leftover
       * space -- but `min-height: auto` still applies, and a flex item refuses to
       * shrink below its content height. This list holds 2362 rows, so it won:
       * `flex-1` on both this section and the group list above meant each grew to
       * fill the rail, and whichever came last in the layout pushed the other out
       * of view entirely.
       *
       * So the notes take a capped share of the rail (`max-h-[45%]`) and scroll
       * inside that box. The groups above keep their own scroll area, and neither
       * can push the other out of sight any more.
       *
       * The header stays outside the scroll area so "Notizen" and its count never
       * scroll away.
       */}
      <div
        className="mt-3 flex max-h-[45%] shrink-0 flex-col overflow-hidden px-0.5"
        data-section="notes"
      >
      <div className="flex items-center pr-1">
        <SidebarGroupLabel className="mb-0.5 h-7 flex-1 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
          Notizen
        </SidebarGroupLabel>
        {/*
         * No create buttons here any more.
         *
         * "Neue Notiz" and "Neuer Notiz-Ordner" sit in the rail's single action
         * row, next to "App hinzufügen" and "Neue Gruppe". They used to sit on this
         * header as well, which meant the same two actions existed twice on screen
         * in two different styles, and the header pair read as app-folder buttons
         * because that is what the buttons next to them were. One row, one of each.
         *
         * The header keeps its label and the count only.
         */}
      </div>

      <NewFolderDialog
        onCreate={(name) => {
          createNoteFolder(companyId, name);
          setFolderDialogOpen(false);
        }}
        onOpenChange={setFolderDialogOpen}
        open={folderDialogOpen}
      />

      {/*
       * Renaming is a dialog rather than an inline field: the row is the trigger, and
       * turning the row itself into an input would mean the click that opened the
       * menu also has to land in a text field. `renameNoteFolder` ignores an empty
       * name, so Abbrechen and an emptied field behave the same way -- nothing is
       * written.
       */}
      <RenameFolderDialog
        folder={renameFolder ?? null}
        onOpenChange={(open) => {
          if (!open) setRenameFolderId(null);
        }}
        onRename={(name) => {
          if (renameFolderId) renameNoteFolder(companyId, renameFolderId, name);
          setRenameFolderId(null);
        }}
      />

      {/*
       * The folders, listed here rather than up in the group tree.
       *
       * Each one owns its notes underneath it, and the "Allgemein" bucket comes
       * last — a note without a folder is the exception, not the headline.
       *
       * This and the "Allgemein" bucket below share one scroll area, so the
       * header above stays put and the notes scroll under it. `no-scrollbar`
       * hides the track: a second scrollbar inside a scrolling sidebar is noise,
       * and the wheel over the list still works. The empty state sits inside it
       * too, so "no notes yet" grows and scrolls exactly like a full list does.
       */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {total === 0 ? (
        <button
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={() => add(null)}
          type="button"
        >
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-sky-100 text-sky-700 ring-1 ring-sky-200/80 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800/60">
            <IconNote className="size-4" stroke={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">Neue Notiz</span>
            <span className="block truncate text-[11px] text-sidebar-foreground/45">
              Text, Ideen, Notizen
            </span>
          </span>
</button>
      ) : null}

      {noteFolders.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {noteFolders.map((folder) => {
            const inFolder = listNotes(companyId, folder.id);
            const isOpen = !(collapsedFolders[folder.id] ?? false);
            return (
              <li key={folder.id}>
                <div className="group/nf flex items-center gap-1">
                  <button
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] font-medium tracking-tight text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    onClick={() =>
                      setCollapsedFolders((prev) => ({
                        ...prev,
                        [folder.id]: !isOpen,
                      }))
                    }
                    type="button"
                  >
                    <IconChevronRight
                      aria-hidden
                      className={cn(
                        "size-3 shrink-0 transition-transform duration-150",
                        isOpen && "rotate-90",
                      )}
                      stroke={1.75}
                    />
                    <IconFolder
                      aria-hidden
                      className="size-3 shrink-0"
                      stroke={1.75}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {folder.label}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {inFolder.length}
                    </span>
                  </button>
                  {/* Icon-only on purpose: the row is 288px wide and a second
                      "+" label would push the folder name into an ellipsis. */}
                  <button
                    aria-label={`Neue Notiz in ${folder.label}`}
                    className="flex size-5 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/40 opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/nf:opacity-100"
                    onClick={() => add(folder.id)}
                    title={`Neue Notiz in ${folder.label}`}
                    type="button"
                  >
                    <IconPlus className="size-3" stroke={1.75} />
                  </button>
                  {/*
                   * Sibling of the row, not a child of it, for the reason the note
                   * row documents: a button inside the trigger also runs the
                   * trigger's own handler, so the folder would fold and the menu
                   * would open underneath it. Here it would fold the folder and
                   * delete it, which is worse.
                   */}
                  <DropdownMenu>
                    {/*
                     * Base UI, so no `asChild` and no nested button: the trigger
                     * renders the button itself and takes the class and the label.
                     */}
                    <DropdownMenuTrigger
                      aria-label={`Ordner ${folder.label} bearbeiten`}
                      className="flex size-5 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/40 opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/nf:opacity-100 data-[state=open]:opacity-100"
                      title={`Ordner ${folder.label} bearbeiten`}
                    >
                      <IconDots className="size-3" stroke={1.75} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => rename(folder)}>
                        Ordner umbenennen
                      </DropdownMenuItem>
                      {/*
                       * Last, and red: it is the only item in the menu that cannot be
                       * undone from here, so it sits apart from the ones that can.
                       */}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => removeFolder(folder, inFolder.length)}
                        variant="destructive"
                      >
                        Ordner löschen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {isOpen && inFolder.length > 0 ? (
                  <ul className="mt-0.5 flex flex-col gap-0.5 pl-4">
                    {inFolder.map((note) => (
                      <NoteRow
                        companyId={companyId}
                        folders={folderChoices}
                        key={note.id}
                        note={note}
                        onCopy={copy}
                        onMove={move}
                        onOpen={open}
                        onRemove={remove}
                        selected={note.id === openNoteId}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {loose.length > 0 ? (
        <div className="mt-1">
          <SidebarGroupLabel className="mb-0.5 flex h-7 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
            Allgemein
            <span className="font-semibold tabular-nums text-sidebar-foreground/55">
              {loose.length}
            </span>
          </SidebarGroupLabel>
          <ul className="mt-0.5 flex flex-col gap-0.5 pl-4">
            {loose.map((note) => (
              <NoteRow
                companyId={companyId}
                folders={folderChoices}
                key={note.id}
                note={note}
                onCopy={copy}
                onMove={move}
                onOpen={open}
                onRemove={remove}
                selected={note.id === openNoteId}
              />
            ))}
          </ul>
        </div>
      ) : null}
      </div>

      {/*
       * The Obsidian vault, below the notes this browser owns.
       *
       * Separate heading, separate store, read-only: a file listed here lives on
       * disk and is opened in the Brain reader rather than the notes editor, so
       * editing it cannot quietly fork a second copy into the same folder.
       *
       * The vault list only earns its place when something can open what it
       * lists. Without a handler the rows would be decoration that looks
       * clickable, so it is left out entirely rather than shown inert.
       */}
      <VaultNotesSection
        onOpen={onOpenVaultFile}
        onReveal={revealVaultPath}
        selectedPath={openVaultPath ?? null}
      />
      {revealError ? (
        <p className="mt-1 px-2 text-[11px] text-destructive" role="status">
          {revealError}
        </p>
      ) : null}
      </div>
    </>
  );
}

/**
 * One note in the list.
 *
 * Exported so the folder tree can render a folder's notes directly beneath it. Filing a note is a
 * per-note decision, so every row carries the full folder list: drag it somewhere, or right-click
 * and pick a folder — neither is left out for anyone using a trackpad or the keyboard.
 */
export function NoteRow({
  companyId,
  folders,
  note,
  onCopy,
  onMove,
  onOpen,
  onRemove,
  selected,
}: {
  companyId: string;
  folders: NotesFolder[];
  note: Note;
  onCopy: (note: Note, folderId: string | null) => void;
  onMove: (note: Note, folderId: string | null) => void;
  onOpen: (note: Note) => void;
  onRemove: (note: Note) => void;
  selected: boolean;
}) {
  const currentLabel =
    folders.find((folder) => folder.id === note.folderId)?.label ?? "Allgemein";

  return (
    <ContextMenu>
      {/*
       * The row and the trash button are siblings, not parent and child.
       *
       * Putting the button inside the trigger would mean every click on it also
       * ran the trigger's own handler: the menu would open and the note would
       * open underneath it. The file already lost time to Base UI listening for a
       * `mouseup` that a nested `draggable` swallowed, so a second nested
       * interactive element inside a trigger is not a risk worth taking. As a
       * sibling the button stops the event and does exactly one thing.
       */}
      <div className="group/note relative">
        <ContextMenuTrigger
          className={cn(
            "w-full rounded-lg text-left transition-colors",
            selected
              ? "bg-sidebar-accent text-sidebar-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          )}
          onClick={() => onOpen(note)}
        >
          {/*
           * The drag handle lives inside the trigger rather than on it.
           *
           * Base UI's context menu tells a right-click from a drag by waiting for the `mouseup` that
           * follows. On a `draggable` element that `mouseup` is consumed by the drag gesture, so the
           * menu closed again instead of opening. Keeping `draggable` on this inner element leaves the
           * trigger's own listeners untouched, and the drag still starts anywhere on the row because
           * the trigger is not a separate layout box.
           */}
          <span
            className="flex w-full cursor-grab items-center gap-2 py-1.5 pl-2 pr-7 active:cursor-grabbing"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DND_NOTE, note.id);
              event.dataTransfer.setData(DND_NOTE_FROM, note.folderId ?? "");
              event.dataTransfer.effectAllowed = "move";
            }}
          >
            <IconNote className="size-3.5 shrink-0 opacity-50" stroke={1.75} />
            <span className="min-w-0 flex-1 truncate text-[12px]">
              {noteLabel(note)}
            </span>
          </span>
        </ContextMenuTrigger>
        {/*
         * Visible on hover, always reachable by keyboard — and always visible on
         * touch, where there is no hover to reveal it.
         *
         * The sidebar is `md:block`, so the phone layout is a separate component
         * and this row is not the one being used there. The rule is here anyway:
         * a control that only exists while a mouse happens to be over it is
         * invisible on a touch screen and unreachable by `Tab` without a visible
         * focus ring, which is the same bug wearing a different hat.
         *
         * `focus-visible:opacity-100` is what makes the keyboard path work — the
         * button is `opacity-0` for the mouse, and a keyboard user would otherwise
         * be tabbing into something they cannot see.
         *
         * The confirm lives in `onRemove` rather than here, so the row, the
         * context menu and any future caller all ask the same question the same
         * way.
         */}
        <button
          aria-label={`Notiz ${noteLabel(note)} löschen`}
          className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/40 opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-destructive focus-visible:opacity-100 group-hover/note:opacity-100 [@media(hover:none)]:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onRemove(note);
          }}
          title="Notiz löschen"
          type="button"
        >
          <IconTrash className="size-3" stroke={1.75} />
        </button>
      </div>
      <ContextMenuContent className="min-w-52 rounded-xl p-1.5">
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={() => onOpen(note)}
        >
          <IconNote className="size-4" stroke={1.75} />
          Öffnen
        </ContextMenuItem>
        <ContextMenuSeparator />
        {/*
         * Every label needs its own group around it.
         *
         * `ContextMenuLabel` is Base UI's `GroupLabel`, which reads a context that only exists inside
         * a `Group`. Rendering one directly in the popup threw "Base UI error #31" and took the whole
         * app down the first time the menu was opened.
         */}
        <ContextMenuGroup>
          <ContextMenuLabel className="text-[11px] uppercase tracking-wide opacity-60">
            In Ordner verschieben
          </ContextMenuLabel>
          <ContextMenuItem
            className="gap-2 rounded-lg px-2.5 py-2"
            onClick={() => onMove(note, null)}
            disabled={note.folderId === null}
          >
            <IconFolder className="size-4" stroke={1.75} />
            Allgemein
          </ContextMenuItem>
          {folders.map((folder) => (
            <ContextMenuItem
              className="gap-2 rounded-lg px-2.5 py-2"
              key={folder.id}
              onClick={() => onMove(note, folder.id)}
            >
              <IconFolder className="size-4" stroke={1.75} />
              <span className="truncate">{folder.label}</span>
              {note.folderId === folder.id ? (
                <span className="ml-auto text-[10px] opacity-60">aktuell</span>
              ) : null}
            </ContextMenuItem>
          ))}
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuLabel className="text-[11px] uppercase tracking-wide opacity-60">
            In Ordner kopieren
          </ContextMenuLabel>
          <ContextMenuItem
            className="gap-2 rounded-lg px-2.5 py-2"
            onClick={() => onCopy(note, null)}
          >
            <IconCopy className="size-4" stroke={1.75} />
            Allgemein
          </ContextMenuItem>
          {folders.map((folder) => (
            <ContextMenuItem
              className="gap-2 rounded-lg px-2.5 py-2"
              key={`copy-${folder.id}`}
              onClick={() => onCopy(note, folder.id)}
            >
              <IconCopy className="size-4" stroke={1.75} />
              <span className="truncate">{folder.label}</span>
            </ContextMenuItem>
          ))}
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-destructive"
          onClick={() => onRemove(note)}
        >
          <IconTrash className="size-4" stroke={1.75} />
          Notiz löschen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
