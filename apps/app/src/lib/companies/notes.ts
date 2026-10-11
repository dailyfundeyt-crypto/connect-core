/**
 * Notes — a notepad per company, stored locally.
 *
 * Shaped after `worklog.ts`: one `localStorage` key holding a map of companyId to state, one
 * `setNotes()` that stamps `updatedAt` and notifies subscribers, and a `normalize()` that repairs
 * anything a hand-edited or older blob might be missing. The same reasons apply — notes are a
 * different concern from the Lab browser tree and from the work log, so a corrupt one cannot take
 * the others down.
 *
 * Each note belongs to a folder (`folderId`) rather than only to the company, because the sidebar
 * shows notes grouped by folder and a note created from the "+" button has to land in a specific
 * one. `folderId: null` is the ungrouped bucket and always renders last.
 *
 * `body` is plain text on purpose. The first version of this feature wanted rich text (headings,
 * lists, tables) and needed a ProseMirror instance to render it; plain text needs a textarea, can
 * be exported as Markdown without a serializer, and cannot half-render. Rich formatting can come
 * later without a migration, because the field it would need is still free.
 */

export type Note = {
  id: string;
  /** Folder this note lives in. `null` = ungrouped ("Allgemein"). */
  folderId: string | null;
  title: string;
  body: string;
  /**
   * The rich document, when the note has one.
   *
   * Kept alongside `body` rather than replacing it: every note written before the block editor
   * exists has a `body` and no `blocks`, and those must keep opening and exporting unchanged. The
   * editor writes both, `body` stays the Markdown fallback, and the first block editor release
   * converts on open. Deleting `body` now would mean a migration and a way to lose text.
   */
  blocks?: NoteBlock[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Inline marks. `code`, `link` and `wikilink` carry a value; the rest are flags.
 *
 * `wikilink` is the Obsidian-style `[[Note]]`. It stores the target's **id**, not its title, and
 * that is the whole reason it is a mark rather than just text: a note gets renamed, and every link
 * pointing at it by name would silently turn into dead text. Resolving the title happens at render
 * time, so a rename needs no migration.
 */
export type NoteMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "code" }
  | { type: "link"; href: string }
  | { type: "wikilink"; noteId: string };

/** A styled run of text. `text` is plain — nesting one styled span inside another is not a thing. */
export type NoteSpan = { text: string; marks?: NoteMark[] };

export type NoteBlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "number"
  | "todo"
  | "toggle"
  | "quote"
  | "callout"
  | "code"
  | "divider"
  | "image"
  | "table";

export type NoteBlock = {
  id: string;
  type: NoteBlockType;
  spans: NoteSpan[];
  /** Nesting depth for list items. 0 = top level. */
  indent?: number;
  /** `todo` only. */
  checked?: boolean;
  /** `toggle` only: the children live in the block itself so folding is one field. */
  collapsed?: boolean;
  children?: NoteBlock[];
  /** `callout` only, an emoji. */
  emoji?: string;
  /** `code` only, a language hint for the label. */
  language?: string;
  /** `image` only: a data URL or a remote URL. */
  url?: string;
  caption?: string;
  /** `table` only. */
  table?: {
    /** First row is the header and is rendered as one. */
    rows: string[][];
    headerRow: boolean;
  };
};

export type NotesState = {
  companyId: string;
  notes: Note[];
  updatedAt: string;
};

const KEY = "connect.notes.v1";

/**
 * Fired after any change to the note list.
 *
 * Exported because the sidebar's "+" button lives in a different component tree from the panel that
 * shows the notes. Both go through the store, both need to be told.
 */
export const NOTES_CHANGED = "connect:notes";

const EVENT = NOTES_CHANGED;

function emptyState(companyId: string): NotesState {
  return { companyId, notes: [], updatedAt: "" };
}

function readAll(): Record<string, NotesState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, NotesState>;
  } catch {
    // A corrupt blob must not break the app; the list simply starts empty.
    return {};
  }
}

function writeAll(all: Record<string, NotesState>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
    /*
     * Same-tab listeners. The `storage` event only fires in *other* tabs, so without this the panel
     * and the sidebar would keep showing the state from before the write — the sidebar "+" creates a
     * note and the panel it should open would never learn about it.
     */
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Quota exceeded or storage disabled. The UI keeps working from React state and retries on the
    // next edit.
  }
}

/** Repairs anything a hand-edited or older blob might be missing, so callers never see undefined. */
function normalize(state: NotesState): NotesState {
  const notes = Array.isArray(state.notes) ? state.notes : [];
  return {
    companyId: state.companyId,
    notes: notes
      .filter((n): n is Note => Boolean(n && typeof n.id === "string"))
      .map((n) => ({
        id: n.id,
        folderId: typeof n.folderId === "string" ? n.folderId : null,
        title: typeof n.title === "string" ? n.title : "",
        body: typeof n.body === "string" ? n.body : "",
        // Older blobs have no blocks at all; `undefined` is what tells the editor to fall back to
        // the plain body rather than showing an empty document.
        ...(Array.isArray(n.blocks) ? { blocks: n.blocks } : {}),
        createdAt: typeof n.createdAt === "string" ? n.createdAt : "",
        updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : "",
      })),
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : "",
  };
}

export function getNotes(companyId: string): NotesState {
  const raw = readAll()[companyId];
  if (!raw) return emptyState(companyId);
  return normalize({ ...raw, companyId });
}

export function setNotes(
  companyId: string,
  patch: Partial<Omit<NotesState, "companyId" | "updatedAt">>,
): NotesState {
  const all = readAll();
  const prev = getNotes(companyId);
  const next: NotesState = {
    ...prev,
    ...patch,
    companyId,
    updatedAt: new Date().toISOString(),
  };
  all[companyId] = next;
  writeAll(all);
  return next;
}

export function subscribeNotes(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/**
 * Which note is open, per company.
 *
 * Stored separately from the notes themselves so that switching the visible note does not rewrite
 * the list. `null` means "no note open" — the panel shows the empty state instead of guessing.
 */
export function getOpenNoteId(companyId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`${KEY}.open.${companyId}`);
  } catch {
    return null;
  }
}

export function setOpenNoteId(companyId: string, noteId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (noteId === null) {
      window.localStorage.removeItem(`${KEY}.open.${companyId}`);
      return;
    }
    window.localStorage.setItem(`${KEY}.open.${companyId}`, noteId);
  } catch {
    // Same as writeAll: the editor still works, the selection just is not remembered.
  }
}

/**
 * Creates an empty note and returns it, so the caller can open it straight from the result.
 *
 * Always creates a genuinely empty note — the "always show an empty note" rule is about the panel
 * rendering a blank editor when nothing is stored yet, not about pre-filling a title. A note that
 * arrives with text in it is a note the user did not write.
 */
export function createNote(
  companyId: string,
  folderId: string | null = null,
): Note {
  const now = new Date().toISOString();
  const note: Note = {
    id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    folderId,
    title: "",
    body: "",
    createdAt: now,
    updatedAt: now,
  };
  setNotes(companyId, { notes: [note, ...getNotes(companyId).notes] });
  return note;
}

export function updateNote(
  companyId: string,
  noteId: string,
  patch: Partial<Pick<Note, "title" | "body" | "folderId" | "blocks">>,
): NotesState {
  return setNotes(companyId, {
    notes: getNotes(companyId).notes.map((n) =>
      n.id === noteId
        ? { ...n, ...patch, updatedAt: new Date().toISOString() }
        : n,
    ),
  });
}

/**
 * Copies a note into another folder, leaving the original where it is.
 *
 * A move already exists (`updateNote` with a `folderId`), so this is deliberately not one: a user
 * filing the same reference under a second company area wants both copies, not an empty space where
 * the note used to be. Deep-copied because the block tree is mutated in place by the editor's undo
 * history — sharing the array would make typing in the copy rewrite the original.
 *
 * Returns the new note so the caller can open it, or null when the id does not exist.
 */
export function copyNote(
  companyId: string,
  noteId: string,
  folderId: string | null = null,
): Note | null {
  const source = getNotes(companyId).notes.find((n) => n.id === noteId);
  if (!source) return null;
  const now = new Date().toISOString();
  const copy: Note = {
    ...source,
    id: `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    folderId,
    // The block ids are referenced by the slash menu, the drag rail and the undo history. Two notes
    // sharing them would make every "update this block" hit the wrong document.
    ...(source.blocks ? { blocks: cloneBlocks(source.blocks) } : {}),
    createdAt: now,
    updatedAt: now,
  };
  setNotes(companyId, { notes: [copy, ...getNotes(companyId).notes] });
  return copy;
}

/** Structural copy of a block tree, with fresh ids on every block. */
function cloneBlocks(blocks: NoteBlock[]): NoteBlock[] {
  // One counter for the whole tree, not a timestamp per block: a toggle's children recurse, and two
  // blocks stamped in the same millisecond would come out with the same id and every later "update
  // this block" would hit the wrong one.
  let seq = 0;
  const nextId = () =>
    `b-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random()
      .toString(36)
      .slice(2, 5)}`;

  return blocks.map((block) => ({
    ...block,
    id: nextId(),
    spans: block.spans.map((span) => ({
      ...span,
      ...(span.marks ? { marks: span.marks.map((mark) => ({ ...mark })) } : {}),
    })),
    ...(block.children ? { children: cloneBlocks(block.children) } : {}),
  }));
}

export function deleteNote(companyId: string, noteId: string): NotesState {
  const next = setNotes(companyId, {
    notes: getNotes(companyId).notes.filter((n) => n.id !== noteId),
  });
  if (getOpenNoteId(companyId) === noteId) setOpenNoteId(companyId, null);
  return next;
}

/** Newest first. The sidebar and the picker both want that order. */
export function listNotes(companyId: string, folderId?: string | null): Note[] {
  const all = getNotes(companyId).notes;
  const scoped =
    folderId === undefined ? all : all.filter((n) => n.folderId === folderId);
  return [...scoped].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The sidebar label. A note with no title shows the first line of its body, then a placeholder. */
export function noteLabel(note: Note): string {
  if (note.title.trim()) return note.title.trim();
  const firstLine = note.body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? "Ohne Titel";
}

/* ------------------------------------------------------------------ *
 * Note folders
 *
 * A note folder is its own thing, not a tab group.
 *
 * The first version of the "+" button called `createTabGroup`, which filed the
 * folder under "Gruppen" — above the notes, in the app tree, next to Vercel and
 * Daytona. A person looking for a folder *of notes* looked in the notes list and
 * found nothing, because the folder they had just made was rendered as a browser
 * tab group. Two different objects, two different lists, one storage key less.
 *
 * So folders live here, next to the notes they file, and are listed under the
 * "Notizen" label where they are used.
 * ------------------------------------------------------------------ */

export type NoteFolder = {
  id: string;
  /** Display name, trimmed, never empty. */
  label: string;
  /** ISO-8601. */
  createdAt: string;
};

const FOLDER_KEY = "connect.notes.folders.v1";

function readFolders(companyId: string): NoteFolder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FOLDER_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return [];
    const all = (parsed as Record<string, unknown>)[companyId];
    if (!Array.isArray(all)) return [];
    return all.filter(
      (entry): entry is NoteFolder =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as NoteFolder).id === "string" &&
        typeof (entry as NoteFolder).label === "string" &&
        (entry as NoteFolder).label.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function writeFolders(companyId: string, folders: NoteFolder[]): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(FOLDER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const all =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    window.localStorage.setItem(
      FOLDER_KEY,
      JSON.stringify({ ...all, [companyId]: folders }),
    );
    // The same event the notes use, so one `subscribeNotes` refreshes both lists
    // and a folder that appears or disappears does not need its own wiring.
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* Storage full or blocked: the in-session list is unchanged, nothing breaks. */
  }
}

/** Folders of one company, oldest first. */
export function listNoteFolders(companyId: string): NoteFolder[] {
  return [...readFolders(companyId)].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

export function createNoteFolder(companyId: string, label: string): NoteFolder {
  const name = label.trim();
  if (!name) throw new Error("Ordnername fehlt.");
  /*
   * Timestamp in the id: ordering does not need a sort step, and two folders
   * made in the same millisecond cannot collide the way a bare random suffix
   * occasionally can.
   */
  const folder: NoteFolder = {
    id: `nf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label: name,
    createdAt: new Date().toISOString(),
  };
  writeFolders(companyId, [...readFolders(companyId), folder]);
  return folder;
}

export function renameNoteFolder(
  companyId: string,
  folderId: string,
  label: string,
): void {
  const name = label.trim();
  if (!name) return;
  writeFolders(
    companyId,
    readFolders(companyId).map((folder) =>
      folder.id === folderId
        ? { ...folder, label: name }
        : folder,
    ),
  );
}

/**
 * Deletes a folder and returns its notes to "Allgemein".
 *
 * The notes are kept on purpose: deleting a folder is tidying up, not throwing
 * away work. Anything else would lose text to a click on a minus.
 */
export function deleteNoteFolder(
  companyId: string,
  folderId: string,
): NotesState {
  writeFolders(
    companyId,
    readFolders(companyId).filter((folder) => folder.id !== folderId),
  );
  return setNotes(companyId, {
    notes: getNotes(companyId).notes.map((note) =>
      note.folderId === folderId ? { ...note, folderId: null } : note,
    ),
  });
}