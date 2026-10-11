/**
 * Spark-Notizen — Persistenz.
 *
 * Pattern bewusst identisch zu `app/src/lib/companies/projects.ts` und
 * `app/src/lib/ui/lab-prefs.ts`: `getX()` / `subscribeX()` und ein
 * Storage-Event für Cross-Tab-Sync.
 *
 * Warum localStorage und nicht der Server: Die Erweiterung ist per
 * Definition lokal (Notizen liegen neben den Daten auf der Platte des
 * Nutzers), und Phase 0 hat bewusst kein Server-Schema angefasst. Ein
 * Wechsel auf `client`/`server` später ist eine Änderung genau in dieser
 * Datei — die Komponenten rufen nur die Funktionen hier.
 */

import type { JSONContent } from "@tiptap/core";
import { emptyNoteContent, type SparkNote } from "./types";

const STORAGE_KEY = "connect.spark.notes.v1";
const EVENT = "connect-spark-notes-changed";

type StoreShape = { version: 1; notes: SparkNote[] };

let cache: StoreShape | null = null;

function emptyStore(): StoreShape {
  return { version: 1, notes: [] };
}

function isJsonContent(value: unknown): value is JSONContent {
  return typeof value === "object" && value !== null && "type" in value;
}

/**
 * Eine Notiz gilt nur als gültig, wenn sie die Felder hat, auf die sich der
 * Editor verlässt. Ein halb geschriebener Eintrag aus einem abgebrochenen
 * Schreibvorgang wird verworfen, statt den Editor mit `undefined` zu treffen.
 */
function isSparkNote(value: unknown): value is SparkNote {
  if (typeof value !== "object" || value === null) return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note.id === "string" &&
    typeof note.companyId === "string" &&
    typeof note.title === "string" &&
    isJsonContent(note.content) &&
    (note.folderId === null || typeof note.folderId === "string") &&
    typeof note.createdAt === "string" &&
    typeof note.updatedAt === "string"
  );
}

function read(): StoreShape {
  if (cache) return cache;
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = emptyStore();
      return cache;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as StoreShape).version !== 1 ||
      !Array.isArray((parsed as StoreShape).notes)
    ) {
      cache = emptyStore();
      return cache;
    }
    cache = {
      version: 1,
      notes: (parsed as StoreShape).notes.filter(isSparkNote),
    };
    return cache;
  } catch {
    cache = emptyStore();
    return cache;
  }
}

function write(next: StoreShape): void {
  cache = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /*
     * localStorage voll oder blockiert (privater Modus, Quota). Der
     * In-Memory-Cache ist bereits gesetzt, die Session arbeitet also weiter —
     * nur die Persistenz schlägt fehl. Das ist der bessere Fehler als ein
     * Absturz mitten im Tippen.
     */
  }
}

/** Alle Notizen einer Company, neueste Änderung zuerst. */
export function listNotes(companyId: string): SparkNote[] {
  return read()
    .notes.filter((note) => note.companyId === companyId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getNote(noteId: string): SparkNote | undefined {
  return read().notes.find((note) => note.id === noteId);
}

/**
 * ID mit Zeitstempel-Präfix, damit die Sortierung „neueste zuerst" auch ohne
 * Sortierschritt stimmt und zwei Notizen im selben Millisekundenfenster
 * kollidieren. `crypto.randomUUID` deckt den Rest ab.
 */
function newNoteId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "");
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `note-${stamp}-${random}`;
}

export function createNote(input: {
  companyId: string;
  folderId?: string | null;
  title?: string;
  content?: JSONContent;
}): SparkNote {
  const now = new Date().toISOString();
  const note: SparkNote = {
    id: newNoteId(new Date()),
    companyId: input.companyId,
    title: input.title?.trim() || "",
    content: input.content ?? emptyNoteContent(),
    folderId: input.folderId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const store = read();
  write({ version: 1, notes: [note, ...store.notes] });
  return note;
}

export function updateNote(
  noteId: string,
  patch: Partial<Pick<SparkNote, "title" | "content" | "folderId">>,
): SparkNote | undefined {
  const store = read();
  const index = store.notes.findIndex((note) => note.id === noteId);
  if (index === -1) return undefined;
  const existing = store.notes[index];
  const next: SparkNote = {
    ...existing,
    ...patch,
    title: patch.title !== undefined ? patch.title.trimStart() : existing.title,
    updatedAt: new Date().toISOString(),
  };
  const notes = [...store.notes];
  notes[index] = next;
  write({ version: 1, notes });
  return next;
}

export function deleteNote(noteId: string): void {
  const store = read();
  const notes = store.notes.filter((note) => note.id !== noteId);
  if (notes.length === store.notes.length) return;
  write({ version: 1, notes });
}

/**
 * Wird aufgerufen, wenn eine Gruppe (`ConnectProject`) gelöscht wird.
 *
 * Notizen bleiben erhalten und landen auf `null` („Allgemein"). Sie zu löschen
 * wäre Datenverlust aus einer UI-Aktion heraus, die eigentlich nur eine
 * Agenten-Gruppe aufräumen sollte — siehe `projects.ts`, wo wir denselben
 * Aufruf einhängen.
 */
export function releaseNotesFromFolder(folderId: string): void {
  const store = read();
  const affected = store.notes.filter((note) => note.folderId === folderId);
  if (affected.length === 0) return;
  write({
    version: 1,
    notes: store.notes.map((note) =>
      note.folderId === folderId ? { ...note, folderId: null } : note,
    ),
  });
}

export function subscribeNotes(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onEvent = () => listener();
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}

/** Nur für Tests und den Button „Alles löschen" im Settings-Panel. */
export function clearNotes(companyId: string): void {
  const store = read();
  write({
    version: 1,
    notes: store.notes.filter((note) => note.companyId !== companyId),
  });
}

export const SPARK_NOTES_STORAGE_KEY = STORAGE_KEY;
