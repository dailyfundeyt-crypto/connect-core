import { randomUUID } from "node:crypto";
import type { Database } from "../../db/client";
import {
  getSparkFoldersStore,
  SparkFoldersStore,
  wouldCreateCycle,
} from "../../brain/browser-folders/store";
import type {
  FolderContext,
  SparkNoteRecord,
  SparkFolderRecord,
  SparkLinkRecord,
  BrowserFolderKind,
} from "./types";

export class SparkMcpStore {
  private foldersStore: SparkFoldersStore;
  private notesMap = new Map<string, SparkNoteRecord>();

  constructor(private database?: Database) {
    this.foldersStore = getSparkFoldersStore(database);
  }

  /* ======================================================================== */
  /* Folder Operations                                                        */
  /* ======================================================================== */

  async createFolder(input: {
    id?: string;
    parentId?: string | null;
    name: string;
    kind?: BrowserFolderKind;
    companyId?: string;
    instructionNoteId?: string | null;
  }): Promise<SparkFolderRecord> {
    const created = await this.foldersStore.createFolder({
      id: input.id,
      parentId: input.parentId ?? null,
      name: input.name,
      kind: input.kind ?? "normal",
      ownerScope: input.companyId || "company",
      instructionNoteId: input.instructionNoteId ?? null,
    });

    return {
      id: created.id,
      parentId: created.parentId ?? null,
      name: created.name,
      kind: created.kind,
      ownerScope: created.ownerScope ?? "company",
      instructionNoteId: created.instructionNoteId ?? null,
      createdAt: created.createdAt || new Date().toISOString(),
      updatedAt: created.updatedAt || new Date().toISOString(),
    };
  }

  async renameFolder(folderId: string, newName: string): Promise<SparkFolderRecord> {
    const updated = await this.foldersStore.updateFolder(folderId, {
      name: newName,
    });
    return {
      id: updated.id,
      parentId: updated.parentId ?? null,
      name: updated.name,
      kind: updated.kind,
      ownerScope: updated.ownerScope ?? "company",
      instructionNoteId: updated.instructionNoteId ?? null,
      createdAt: updated.createdAt || new Date().toISOString(),
      updatedAt: updated.updatedAt || new Date().toISOString(),
    };
  }

  async moveFolder(folderId: string, targetParentId: string | null): Promise<SparkFolderRecord> {
    if (folderId === targetParentId) {
      throw new Error(`Ordner "${folderId}" kann nicht in sich selbst verschoben werden.`);
    }

    if (targetParentId) {
      const cycle = await wouldCreateCycle(this.database, folderId, targetParentId);
      if (cycle) {
        throw new Error(
          `Zyklus erkannt: Ordner "${folderId}" kann nicht in seinen eigenen Unterordner "${targetParentId}" verschoben werden.`,
        );
      }
    }

    const updated = await this.foldersStore.moveFolder(folderId, targetParentId);
    return {
      id: updated.id,
      parentId: updated.parentId ?? null,
      name: updated.name,
      kind: updated.kind,
      ownerScope: updated.ownerScope ?? "company",
      instructionNoteId: updated.instructionNoteId ?? null,
      createdAt: updated.createdAt || new Date().toISOString(),
      updatedAt: updated.updatedAt || new Date().toISOString(),
    };
  }

  async markSettings(
    folderId: string,
    isSettings?: boolean,
    kind?: BrowserFolderKind,
  ): Promise<SparkFolderRecord> {
    const targetKind: BrowserFolderKind =
      kind ?? (isSettings === false ? "normal" : "settings");

    const updated = await this.foldersStore.updateFolder(folderId, {
      kind: targetKind,
    });

    return {
      id: updated.id,
      parentId: updated.parentId ?? null,
      name: updated.name,
      kind: updated.kind,
      ownerScope: updated.ownerScope ?? "company",
      instructionNoteId: updated.instructionNoteId ?? null,
      createdAt: updated.createdAt || new Date().toISOString(),
      updatedAt: updated.updatedAt || new Date().toISOString(),
    };
  }

  async getFolder(folderId: string): Promise<SparkFolderRecord | null> {
    const folder = await this.foldersStore.getFolder(folderId);
    if (!folder) return null;
    return {
      id: folder.id,
      parentId: folder.parentId ?? null,
      name: folder.name,
      kind: folder.kind,
      ownerScope: folder.ownerScope ?? "company",
      instructionNoteId: folder.instructionNoteId ?? null,
      createdAt: folder.createdAt || new Date().toISOString(),
      updatedAt: folder.updatedAt || new Date().toISOString(),
    };
  }

  async listFolders(ownerScope?: string): Promise<SparkFolderRecord[]> {
    const folders = await this.foldersStore.listFolders(ownerScope);
    return folders.map((f) => ({
      id: f.id,
      parentId: f.parentId ?? null,
      name: f.name,
      kind: f.kind,
      ownerScope: f.ownerScope ?? "company",
      instructionNoteId: f.instructionNoteId ?? null,
      createdAt: f.createdAt || new Date().toISOString(),
      updatedAt: f.updatedAt || new Date().toISOString(),
    }));
  }

  /**
   * Ermittelt den hierarchischen Pfad vom Wurzelordner bis zum aktuellen Ordner als String-Array.
   */
  async getFolderPath(folderId: string): Promise<string[]> {
    const path: string[] = [];
    let currentId: string | null = folderId;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const folder = await this.getFolder(currentId);
      if (!folder) break;
      path.unshift(folder.name);
      currentId = folder.parentId;
    }

    return path;
  }

  /* ======================================================================== */
  /* Link Operations                                                          */
  /* ======================================================================== */

  async addLink(input: {
    folderId: string;
    url: string;
    title: string;
    noteId?: string | null;
  }): Promise<SparkLinkRecord> {
    const link = await this.foldersStore.addLink({
      folderId: input.folderId,
      url: input.url,
      title: input.title,
      noteId: input.noteId ?? null,
    });

    return {
      id: link.id,
      folderId: link.folderId,
      url: link.url,
      title: link.title,
      noteId: link.noteId ?? null,
      createdAt: link.createdAt || new Date().toISOString(),
      updatedAt: link.updatedAt || new Date().toISOString(),
    };
  }

  async moveLink(linkId: string, targetFolderId: string): Promise<SparkLinkRecord> {
    const link = await this.foldersStore.moveLink(linkId, targetFolderId);
    return {
      id: link.id,
      folderId: link.folderId,
      url: link.url,
      title: link.title,
      noteId: link.noteId ?? null,
      createdAt: link.createdAt || new Date().toISOString(),
      updatedAt: link.updatedAt || new Date().toISOString(),
    };
  }

  async listLinks(folderId?: string): Promise<SparkLinkRecord[]> {
    const links = await this.foldersStore.listLinks(folderId);
    return links.map((l) => ({
      id: l.id,
      folderId: l.folderId,
      url: l.url,
      title: l.title,
      noteId: l.noteId ?? null,
      createdAt: l.createdAt || new Date().toISOString(),
      updatedAt: l.updatedAt || new Date().toISOString(),
    }));
  }

  async getLink(linkId: string): Promise<SparkLinkRecord | null> {
    const link = await this.foldersStore.getLink(linkId);
    if (!link) return null;
    return {
      id: link.id,
      folderId: link.folderId,
      url: link.url,
      title: link.title,
      noteId: link.noteId ?? null,
      createdAt: link.createdAt || new Date().toISOString(),
      updatedAt: link.updatedAt || new Date().toISOString(),
    };
  }

  /* ======================================================================== */
  /* Note Operations (Soft-Delete / Trash Support)                            */
  /* ======================================================================== */

  async createNote(input: {
    title: string;
    content?: string;
    folderId?: string | null;
    companyId?: string;
    noteId?: string;
  }): Promise<SparkNoteRecord> {
    const noteId = input.noteId || `note_${randomUUID().slice(0, 10)}`;
    const now = new Date().toISOString();

    const noteRecord: SparkNoteRecord = {
      id: noteId,
      companyId: input.companyId || "company",
      title: input.title,
      content: input.content || "",
      folderId: input.folderId ?? null,
      isTrashed: false,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.notesMap.set(noteId, noteRecord);

    // Wenn folderId angegeben, auch im browser-folders Store verknüpfen
    if (input.folderId) {
      try {
        await this.foldersStore.attachNote({
          folderId: input.folderId,
          noteId,
          title: input.title,
          content: input.content || "",
          setAsInstruction: true,
        });
      } catch (err) {
        console.warn("[SparkMcpStore] attachNote fallback in createNote:", err);
      }
    }

    return noteRecord;
  }

  async readNote(noteId: string, includeTrashed = false): Promise<SparkNoteRecord | null> {
    // 1. Zuerst in lokalem Cache prüfen
    let note = this.notesMap.get(noteId);

    // 2. Fallback auf foldersStore
    if (!note) {
      const external = await this.foldersStore.readNote(noteId);
      if (external) {
        note = {
          id: external.noteId,
          companyId: "company",
          title: external.title || external.noteId,
          content: external.content || "",
          folderId: external.folderId || null,
          isTrashed: false,
          trashedAt: null,
          createdAt: external.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.notesMap.set(noteId, note);
      }
    }

    if (!note) return null;

    if (note.isTrashed && !includeTrashed) {
      return null;
    }

    return note;
  }

  async updateNote(
    noteId: string,
    patch: {
      title?: string;
      content?: string;
      folderId?: string | null;
    },
  ): Promise<SparkNoteRecord> {
    const existing = await this.readNote(noteId, true);
    if (!existing) {
      throw new Error(`Notiz mit ID "${noteId}" nicht gefunden.`);
    }

    const updated: SparkNoteRecord = {
      ...existing,
      title: patch.title !== undefined ? patch.title : existing.title,
      content: patch.content !== undefined ? patch.content : existing.content,
      folderId: patch.folderId !== undefined ? patch.folderId : existing.folderId,
      updatedAt: new Date().toISOString(),
    };

    this.notesMap.set(noteId, updated);

    // Falls folderId geändert oder aktualisiert wurde
    if (patch.folderId && patch.folderId !== existing.folderId) {
      await this.attachNoteToFolder({
        folderId: patch.folderId,
        noteId,
      });
    }

    return updated;
  }

  /**
   * Soft-delete: Verschiebt die Notiz in den Papierkorb.
   * NIEMALS hart löschen! Die Notiz bleibt erhalten, wird jedoch als `isTrashed: true` markiert.
   */
  async trashNote(noteId: string): Promise<{ note: SparkNoteRecord; trashed: true }> {
    const note = await this.readNote(noteId, true);
    if (!note) {
      throw new Error(`Notiz mit ID "${noteId}" nicht gefunden.`);
    }

    note.isTrashed = true;
    note.trashedAt = new Date().toISOString();
    note.updatedAt = new Date().toISOString();
    this.notesMap.set(noteId, note);

    // Falls die Notiz in einem Ordner als Hauptinstruktion fungierte, Instruktion bereinigen
    if (note.folderId) {
      try {
        const folder = await this.getFolder(note.folderId);
        if (folder && folder.instructionNoteId === noteId) {
          // Nächste nicht-gelöschte Notiz suchen
          const activeNotes = await this.listActiveNotesForFolder(note.folderId);
          const nextInstruction = activeNotes.length > 0 ? activeNotes[0].id : null;
          await this.foldersStore.updateFolder(note.folderId, {
            instructionNoteId: nextInstruction,
          });
        }
      } catch (err) {
        console.warn("[SparkMcpStore] cleanup instructionNoteId error:", err);
      }
    }

    return { note, trashed: true };
  }

  async attachNoteToFolder(input: {
    folderId: string;
    noteId: string;
    setAsInstruction?: boolean;
  }): Promise<SparkNoteRecord> {
    const folder = await this.getFolder(input.folderId);
    if (!folder) {
      throw new Error(`Ordner "${input.folderId}" existiert nicht.`);
    }

    const note = await this.readNote(input.noteId, true);
    if (!note) {
      throw new Error(`Notiz "${input.noteId}" existiert nicht.`);
    }

    note.folderId = input.folderId;
    note.updatedAt = new Date().toISOString();
    this.notesMap.set(input.noteId, note);

    await this.foldersStore.attachNote({
      folderId: input.folderId,
      noteId: input.noteId,
      title: note.title,
      content: note.content,
      setAsInstruction: input.setAsInstruction ?? true,
    });

    return note;
  }

  async listActiveNotesForFolder(folderId: string): Promise<SparkNoteRecord[]> {
    const notes: SparkNoteRecord[] = [];
    for (const note of this.notesMap.values()) {
      if (note.folderId === folderId && !note.isTrashed) {
        notes.push(note);
      }
    }

    // Auch im underlying folder store nachsehen
    const folderNotes = await this.foldersStore.listFolderNotes(folderId);
    for (const fn of folderNotes) {
      if (!this.notesMap.has(fn.noteId)) {
        const n: SparkNoteRecord = {
          id: fn.noteId,
          companyId: "company",
          title: fn.title || fn.noteId,
          content: fn.content || "",
          folderId,
          isTrashed: false,
          trashedAt: null,
          createdAt: fn.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.notesMap.set(fn.noteId, n);
        notes.push(n);
      }
    }

    return notes;
  }

  /* ======================================================================== */
  /* Folder Context Operation                                                 */
  /* ======================================================================== */

  /**
   * Liefert Links + Notizen eines Ordners.
   * Regel: Eine Notiz im selben Ordner wie Links ist die Arbeitsanweisung für diese Links.
   * Liefert FolderContext-Objekt laut Contract v06.
   */
  async getFolderContext(folderId: string): Promise<FolderContext> {
    const folder = await this.getFolder(folderId);
    if (!folder) {
      throw new Error(`Ordner mit ID "${folderId}" existiert nicht.`);
    }

    const path = await this.getFolderPath(folderId);
    const links = await this.listLinks(folderId);
    const activeNotes = await this.listActiveNotesForFolder(folderId);

    // Notizen als instructions zusammenfassen
    let instructions = "";
    if (folder.instructionNoteId) {
      const explicitInstructionNote = activeNotes.find((n) => n.id === folder.instructionNoteId);
      if (explicitInstructionNote && explicitInstructionNote.content.trim()) {
        instructions = explicitInstructionNote.content.trim();
      }
    }

    if (!instructions && activeNotes.length > 0) {
      // Wenn keine explizite Instruktionsnotiz gesetzt ist, fassen wir alle aktiven Notizen zusammen
      instructions = activeNotes
        .map((n) => `### ${n.title}\n${n.content.trim()}`)
        .join("\n\n");
    }

    return {
      folderId: folder.id,
      path,
      links: links.map((l) => ({
        id: l.id,
        url: l.url,
        title: l.title,
      })),
      notes: activeNotes.map((n) => ({
        id: n.id,
        title: n.title,
        excerpt: n.content.slice(0, 160).trim(),
      })),
      instructions: instructions || undefined,
    };
  }

  // Für Test-Resets
  clearForTests(): void {
    this.notesMap.clear();
  }
}

let sharedStore: SparkMcpStore | null = null;

export function getSparkMcpStore(database?: Database): SparkMcpStore {
  if (!sharedStore || database) {
    sharedStore = new SparkMcpStore(database);
  }
  return sharedStore;
}
