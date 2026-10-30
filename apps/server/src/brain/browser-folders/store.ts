import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  mockBrowserFolders,
  mockFolderLinks,
  mockFolderNotes,
} from "../../contracts/swarm-v3/mocks";
import type {
  BrowserFolder,
  BrowserFolderKind,
  FolderLink,
  FolderNote,
  FolderWithDetails,
  FolderContextResponse,
  CreateFolderInput,
  UpdateFolderInput,
  CreateLinkInput,
  AttachNoteInput,
} from "./types";

/* ========================================================================== */
/* In-Memory Store & Initial Seed State                                       */
/* ========================================================================== */

const inMemoryFolders = new Map<string, BrowserFolder>();
const inMemoryLinks = new Map<string, FolderLink>();
const inMemoryNotes = new Map<string, FolderNote>(); // key: `${folderId}:${noteId}` or `noteId`
const notesCatalog = new Map<string, { noteId: string; title: string; content: string }>();

function initSeedData() {
  if (inMemoryFolders.size === 0) {
    for (const folder of mockBrowserFolders) {
      inMemoryFolders.set(folder.id, { ...folder });
    }
  }
  if (inMemoryLinks.size === 0) {
    for (const link of mockFolderLinks) {
      inMemoryLinks.set(link.id, { ...link });
    }
  }
  if (inMemoryNotes.size === 0) {
    for (const note of mockFolderNotes) {
      inMemoryNotes.set(`${note.folderId}:${note.noteId}`, { ...note });
      notesCatalog.set(note.noteId, {
        noteId: note.noteId,
        title: note.title || note.noteId,
        content: note.content || "",
      });
    }
  }
}

// Initialise memory immediately
initSeedData();

/* ========================================================================== */
/* Database Schema Initialization                                             */
/* ========================================================================== */

let dbInitPromise: Promise<void> | null = null;

export async function ensureBrowserFoldersTables(database?: Database): Promise<void> {
  if (!database) return;
  dbInitPromise ??= (async () => {
    try {
      await database.execute(sql`
        CREATE TABLE IF NOT EXISTS browser_folders (
          id text PRIMARY KEY NOT NULL,
          parent_id text REFERENCES browser_folders(id) ON DELETE SET NULL,
          name text NOT NULL,
          kind text DEFAULT 'normal' NOT NULL CHECK (kind IN ('normal', 'settings')),
          owner_scope text DEFAULT 'company' NOT NULL,
          instruction_note_id text,
          created_at timestamptz DEFAULT now() NOT NULL,
          updated_at timestamptz DEFAULT now() NOT NULL
        );
      `);

      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS browser_folders_parent_idx ON browser_folders(parent_id);
      `);
      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS browser_folders_kind_idx ON browser_folders(kind);
      `);

      await database.execute(sql`
        CREATE TABLE IF NOT EXISTS folder_links (
          id text PRIMARY KEY NOT NULL,
          folder_id text NOT NULL REFERENCES browser_folders(id) ON DELETE CASCADE,
          url text NOT NULL,
          title text NOT NULL,
          note_id text,
          created_at timestamptz DEFAULT now() NOT NULL,
          updated_at timestamptz DEFAULT now() NOT NULL
        );
      `);

      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS folder_links_folder_idx ON folder_links(folder_id);
      `);

      await database.execute(sql`
        CREATE TABLE IF NOT EXISTS folder_notes (
          folder_id text NOT NULL REFERENCES browser_folders(id) ON DELETE CASCADE,
          note_id text NOT NULL,
          title text,
          content text,
          created_at timestamptz DEFAULT now() NOT NULL,
          PRIMARY KEY (folder_id, note_id)
        );
      `);

      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS folder_notes_note_idx ON folder_notes(note_id);
      `);

      await database.execute(sql`
        CREATE OR REPLACE VIEW folders AS SELECT * FROM browser_folders;
      `);
    } catch (err) {
      console.warn("[SparkFoldersStore] ensureBrowserFoldersTables error:", err);
      dbInitPromise = null;
    }
  })();
  return dbInitPromise;
}

/* ========================================================================== */
/* Cycle Detection Logic                                                      */
/* ========================================================================== */

/**
 * Checks whether moving `folderId` under `targetParentId` would cause a hierarchy cycle.
 * Traverses parent pointers from `targetParentId` upwards.
 */
export async function wouldCreateCycle(
  database: Database | undefined,
  folderId: string,
  targetParentId: string | null
): Promise<boolean> {
  if (!targetParentId) return false;
  if (folderId === targetParentId) return true;

  let currentParent: string | null = targetParentId;
  const visited = new Set<string>();

  while (currentParent) {
    if (currentParent === folderId) {
      return true;
    }
    if (visited.has(currentParent)) {
      // Loop already present
      return true;
    }
    visited.add(currentParent);

    // Look up parent
    const parentFolder = await getFolderByIdInternal(database, currentParent);
    if (!parentFolder || !parentFolder.parentId) {
      break;
    }
    currentParent = parentFolder.parentId;
  }

  return false;
}

async function getFolderByIdInternal(
  database: Database | undefined,
  id: string
): Promise<BrowserFolder | null> {
  if (database) {
    try {
      await ensureBrowserFoldersTables(database);
      const rows = (await database.execute(sql`
        SELECT id, parent_id as "parentId", name, kind, owner_scope as "ownerScope",
               instruction_note_id as "instructionNoteId",
               created_at as "createdAt", updated_at as "updatedAt"
        FROM browser_folders
        WHERE id = ${id}
        LIMIT 1
      `)) as any[];

      if (Array.isArray(rows) && rows.length > 0) {
        return {
          id: String(rows[0].id),
          parentId: rows[0].parentId ? String(rows[0].parentId) : null,
          name: String(rows[0].name),
          kind: rows[0].kind as BrowserFolderKind,
          ownerScope: rows[0].ownerScope ? String(rows[0].ownerScope) : "company",
          instructionNoteId: rows[0].instructionNoteId ? String(rows[0].instructionNoteId) : null,
          createdAt: rows[0].createdAt ? new Date(rows[0].createdAt).toISOString() : undefined,
          updatedAt: rows[0].updatedAt ? new Date(rows[0].updatedAt).toISOString() : undefined,
        };
      }
    } catch {
      // Fallback to memory
    }
  }

  return inMemoryFolders.get(id) || null;
}

/* ========================================================================== */
/* Spark Folder Operations                                                    */
/* ========================================================================== */

export class SparkFoldersStore {
  constructor(private database?: Database) {}

  /**
   * Lists all browser folders, optionally filtered by ownerScope.
   */
  async listFolders(ownerScope?: string): Promise<BrowserFolder[]> {
    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        const query = ownerScope
          ? sql`
              SELECT id, parent_id as "parentId", name, kind, owner_scope as "ownerScope",
                     instruction_note_id as "instructionNoteId",
                     created_at as "createdAt", updated_at as "updatedAt"
              FROM browser_folders
              WHERE owner_scope = ${ownerScope}
              ORDER BY created_at ASC
            `
          : sql`
              SELECT id, parent_id as "parentId", name, kind, owner_scope as "ownerScope",
                     instruction_note_id as "instructionNoteId",
                     created_at as "createdAt", updated_at as "updatedAt"
              FROM browser_folders
              ORDER BY created_at ASC
            `;
        const rows = (await this.database.execute(query)) as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map((r) => ({
            id: String(r.id),
            parentId: r.parentId ? String(r.parentId) : null,
            name: String(r.name),
            kind: (r.kind || "normal") as BrowserFolderKind,
            ownerScope: r.ownerScope ? String(r.ownerScope) : "company",
            instructionNoteId: r.instructionNoteId ? String(r.instructionNoteId) : null,
            createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
            updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
          }));
        }
      } catch (err) {
        console.warn("[SparkFoldersStore] DB listFolders fallback:", err);
      }
    }

    let list = Array.from(inMemoryFolders.values());
    if (ownerScope) {
      list = list.filter((f) => f.ownerScope === ownerScope);
    }
    return list;
  }

  /**
   * Retrieves a folder with all associated links, notes, and child folders.
   */
  async getFolder(id: string): Promise<FolderWithDetails | null> {
    const folder = await getFolderByIdInternal(this.database, id);
    if (!folder) return null;

    const links = await this.listLinks(id);
    const notes = await this.listFolderNotes(id);
    const allFolders = await this.listFolders();
    const subfolders = allFolders.filter((f) => f.parentId === id);

    let instructionNote: FolderNote | null = null;
    if (folder.instructionNoteId) {
      instructionNote = notes.find((n) => n.noteId === folder.instructionNoteId) || null;
      if (!instructionNote) {
        const cat = notesCatalog.get(folder.instructionNoteId);
        if (cat) {
          instructionNote = {
            folderId: folder.id,
            noteId: cat.noteId,
            title: cat.title,
            content: cat.content,
          };
        }
      }
    }
    if (!instructionNote && notes.length > 0) {
      // First attached note acts as instruction note
      instructionNote = notes[0];
    }

    return {
      ...folder,
      links,
      notes,
      subfolders,
      instructionNote,
    };
  }

  /**
   * Creates a new folder.
   */
  async createFolder(input: CreateFolderInput): Promise<BrowserFolder> {
    const id = input.id || `folder_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const folder: BrowserFolder = {
      id,
      parentId: input.parentId ?? null,
      name: input.name,
      kind: input.kind ?? "normal",
      ownerScope: input.ownerScope ?? "company",
      instructionNoteId: input.instructionNoteId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    if (folder.parentId) {
      const parent = await getFolderByIdInternal(this.database, folder.parentId);
      if (!parent) {
        throw new Error(`Elternordner mit ID "${folder.parentId}" existiert nicht.`);
      }
    }

    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        await this.database.execute(sql`
          INSERT INTO browser_folders (id, parent_id, name, kind, owner_scope, instruction_note_id, created_at, updated_at)
          VALUES (${folder.id}, ${folder.parentId}, ${folder.name}, ${folder.kind}, ${folder.ownerScope}, ${folder.instructionNoteId}, NOW(), NOW())
        `);
      } catch (err) {
        console.warn("[SparkFoldersStore] DB createFolder fallback:", err);
      }
    }

    inMemoryFolders.set(folder.id, folder);
    return folder;
  }

  /**
   * Updates an existing folder.
   */
  async updateFolder(id: string, input: UpdateFolderInput): Promise<BrowserFolder> {
    const existing = await getFolderByIdInternal(this.database, id);
    if (!existing) {
      throw new Error(`Ordner mit ID "${id}" nicht gefunden.`);
    }

    if (input.parentId !== undefined && input.parentId !== existing.parentId) {
      const hasCycle = await wouldCreateCycle(this.database, id, input.parentId);
      if (hasCycle) {
        throw new Error(`Zyklus erkannt: Ordner "${id}" kann nicht in "${input.parentId}" verschoben werden.`);
      }
    }

    const updated: BrowserFolder = {
      ...existing,
      name: input.name ?? existing.name,
      kind: input.kind ?? existing.kind,
      ownerScope: input.ownerScope ?? existing.ownerScope,
      instructionNoteId: input.instructionNoteId !== undefined ? input.instructionNoteId : existing.instructionNoteId,
      parentId: input.parentId !== undefined ? input.parentId : existing.parentId,
      updatedAt: new Date().toISOString(),
    };

    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        await this.database.execute(sql`
          UPDATE browser_folders
          SET name = ${updated.name},
              kind = ${updated.kind},
              owner_scope = ${updated.ownerScope},
              instruction_note_id = ${updated.instructionNoteId},
              parent_id = ${updated.parentId},
              updated_at = NOW()
          WHERE id = ${id}
        `);
      } catch (err) {
        console.warn("[SparkFoldersStore] DB updateFolder fallback:", err);
      }
    }

    inMemoryFolders.set(id, updated);
    return updated;
  }

  /**
   * Deletes a folder and all its links and note associations.
   */
  async deleteFolder(id: string): Promise<boolean> {
    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        await this.database.execute(sql`DELETE FROM browser_folders WHERE id = ${id}`);
      } catch (err) {
        console.warn("[SparkFoldersStore] DB deleteFolder fallback:", err);
      }
    }

    inMemoryFolders.delete(id);
    for (const [key, link] of inMemoryLinks.entries()) {
      if (link.folderId === id) {
        inMemoryLinks.delete(key);
      }
    }
    for (const [key, note] of inMemoryNotes.entries()) {
      if (note.folderId === id) {
        inMemoryNotes.delete(key);
      }
    }
    return true;
  }

  /**
   * Moves a folder under another parent folder, preventing hierarchy cycles.
   */
  async moveFolder(folderId: string, newParentId: string | null): Promise<BrowserFolder> {
    const folder = await getFolderByIdInternal(this.database, folderId);
    if (!folder) {
      throw new Error(`Ordner mit ID "${folderId}" nicht gefunden.`);
    }

    if (newParentId) {
      const parent = await getFolderByIdInternal(this.database, newParentId);
      if (!parent) {
        throw new Error(`Zielordner "${newParentId}" nicht gefunden.`);
      }
      const cycle = await wouldCreateCycle(this.database, folderId, newParentId);
      if (cycle) {
        throw new Error(`Zyklus erkannt: Ordner "${folder.name}" (${folderId}) kann nicht in seinen eigenen Unterordner verschoben werden.`);
      }
    }

    return this.updateFolder(folderId, { parentId: newParentId });
  }

  /* ======================================================================== */
  /* Link Operations                                                          */
  /* ======================================================================== */

  async listLinks(folderId?: string): Promise<FolderLink[]> {
    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        const query = folderId
          ? sql`
              SELECT id, folder_id as "folderId", url, title, note_id as "noteId",
                     created_at as "createdAt", updated_at as "updatedAt"
              FROM folder_links
              WHERE folder_id = ${folderId}
              ORDER BY created_at ASC
            `
          : sql`
              SELECT id, folder_id as "folderId", url, title, note_id as "noteId",
                     created_at as "createdAt", updated_at as "updatedAt"
              FROM folder_links
              ORDER BY created_at ASC
            `;
        const rows = (await this.database.execute(query)) as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map((r) => ({
            id: String(r.id),
            folderId: String(r.folderId),
            url: String(r.url),
            title: String(r.title),
            noteId: r.noteId ? String(r.noteId) : null,
            createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
            updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
          }));
        }
      } catch (err) {
        console.warn("[SparkFoldersStore] DB listLinks fallback:", err);
      }
    }

    let list = Array.from(inMemoryLinks.values());
    if (folderId) {
      list = list.filter((l) => l.folderId === folderId);
    }
    return list;
  }

  async getLink(id: string): Promise<FolderLink | null> {
    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        const rows = (await this.database.execute(sql`
          SELECT id, folder_id as "folderId", url, title, note_id as "noteId",
                 created_at as "createdAt", updated_at as "updatedAt"
          FROM folder_links
          WHERE id = ${id}
          LIMIT 1
        `)) as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          return {
            id: String(rows[0].id),
            folderId: String(rows[0].folderId),
            url: String(rows[0].url),
            title: String(rows[0].title),
            noteId: rows[0].noteId ? String(rows[0].noteId) : null,
            createdAt: rows[0].createdAt ? new Date(rows[0].createdAt).toISOString() : undefined,
            updatedAt: rows[0].updatedAt ? new Date(rows[0].updatedAt).toISOString() : undefined,
          };
        }
      } catch {}
    }
    return inMemoryLinks.get(id) || null;
  }

  async addLink(input: CreateLinkInput): Promise<FolderLink> {
    const folder = await getFolderByIdInternal(this.database, input.folderId);
    if (!folder) {
      throw new Error(`Zielordner "${input.folderId}" existiert nicht.`);
    }

    const id = input.id || `link_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const link: FolderLink = {
      id,
      folderId: input.folderId,
      url: input.url,
      title: input.title,
      noteId: input.noteId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        await this.database.execute(sql`
          INSERT INTO folder_links (id, folder_id, url, title, note_id, created_at, updated_at)
          VALUES (${link.id}, ${link.folderId}, ${link.url}, ${link.title}, ${link.noteId}, NOW(), NOW())
        `);
      } catch (err) {
        console.warn("[SparkFoldersStore] DB addLink fallback:", err);
      }
    }

    inMemoryLinks.set(link.id, link);
    return link;
  }

  async moveLink(linkId: string, targetFolderId: string): Promise<FolderLink> {
    const link = await this.getLink(linkId);
    if (!link) {
      throw new Error(`Link mit ID "${linkId}" existiert nicht.`);
    }
    const targetFolder = await getFolderByIdInternal(this.database, targetFolderId);
    if (!targetFolder) {
      throw new Error(`Zielordner "${targetFolderId}" existiert nicht.`);
    }

    const updated: FolderLink = {
      ...link,
      folderId: targetFolderId,
      updatedAt: new Date().toISOString(),
    };

    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        await this.database.execute(sql`
          UPDATE folder_links
          SET folder_id = ${targetFolderId}, updated_at = NOW()
          WHERE id = ${linkId}
        `);
      } catch (err) {
        console.warn("[SparkFoldersStore] DB moveLink fallback:", err);
      }
    }

    inMemoryLinks.set(linkId, updated);
    return updated;
  }

  async deleteLink(linkId: string): Promise<boolean> {
    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        await this.database.execute(sql`DELETE FROM folder_links WHERE id = ${linkId}`);
      } catch (err) {
        console.warn("[SparkFoldersStore] DB deleteLink fallback:", err);
      }
    }
    inMemoryLinks.delete(linkId);
    return true;
  }

  /* ======================================================================== */
  /* Note Operations                                                          */
  /* ======================================================================== */

  async listFolderNotes(folderId: string): Promise<FolderNote[]> {
    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        const rows = (await this.database.execute(sql`
          SELECT folder_id as "folderId", note_id as "noteId", title, content, created_at as "createdAt"
          FROM folder_notes
          WHERE folder_id = ${folderId}
          ORDER BY created_at ASC
        `)) as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map((r) => ({
            folderId: String(r.folderId),
            noteId: String(r.noteId),
            title: r.title ? String(r.title) : undefined,
            content: r.content ? String(r.content) : undefined,
            createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
          }));
        }
      } catch (err) {
        console.warn("[SparkFoldersStore] DB listFolderNotes fallback:", err);
      }
    }

    return Array.from(inMemoryNotes.values()).filter((n) => n.folderId === folderId);
  }

  async readNote(noteId: string): Promise<FolderNote | null> {
    const cat = notesCatalog.get(noteId);
    if (cat) {
      return {
        folderId: "",
        noteId: cat.noteId,
        title: cat.title,
        content: cat.content,
      };
    }
    const note = Array.from(inMemoryNotes.values()).find((n) => n.noteId === noteId);
    return note || null;
  }

  async createNote(input: {
    noteId?: string;
    folderId: string;
    title: string;
    content: string;
  }): Promise<FolderNote> {
    const noteId = input.noteId || `note_${randomUUID().slice(0, 8)}`;
    notesCatalog.set(noteId, {
      noteId,
      title: input.title,
      content: input.content,
    });

    return this.attachNote({
      folderId: input.folderId,
      noteId,
      title: input.title,
      content: input.content,
      setAsInstruction: true,
    });
  }

  async attachNote(input: AttachNoteInput): Promise<FolderNote> {
    const folder = await getFolderByIdInternal(this.database, input.folderId);
    if (!folder) {
      throw new Error(`Ordner "${input.folderId}" existiert nicht.`);
    }

    const existingCatalog = notesCatalog.get(input.noteId);
    const existingNote = inMemoryNotes.get(`${input.folderId}:${input.noteId}`);
    const resolvedTitle = input.title || existingCatalog?.title || existingNote?.title || `Notiz: ${input.noteId}`;
    const resolvedContent = input.content !== undefined ? input.content : (existingCatalog?.content || existingNote?.content || "");

    const noteRecord: FolderNote = {
      folderId: input.folderId,
      noteId: input.noteId,
      title: resolvedTitle,
      content: resolvedContent,
      createdAt: new Date().toISOString(),
    };

    notesCatalog.set(input.noteId, {
      noteId: input.noteId,
      title: resolvedTitle,
      content: resolvedContent,
    });

    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        await this.database.execute(sql`
          INSERT INTO folder_notes (folder_id, note_id, title, content, created_at)
          VALUES (${noteRecord.folderId}, ${noteRecord.noteId}, ${noteRecord.title}, ${noteRecord.content}, NOW())
          ON CONFLICT (folder_id, note_id)
          DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content
        `);
      } catch (err) {
        console.warn("[SparkFoldersStore] DB attachNote fallback:", err);
      }
    }

    inMemoryNotes.set(`${noteRecord.folderId}:${noteRecord.noteId}`, noteRecord);

    if (input.setAsInstruction || !folder.instructionNoteId) {
      await this.updateFolder(folder.id, { instructionNoteId: input.noteId });
    }

    return noteRecord;
  }

  async detachNote(folderId: string, noteId: string): Promise<boolean> {
    if (this.database) {
      try {
        await ensureBrowserFoldersTables(this.database);
        await this.database.execute(sql`
          DELETE FROM folder_notes
          WHERE folder_id = ${folderId} AND note_id = ${noteId}
        `);
      } catch (err) {
        console.warn("[SparkFoldersStore] DB detachNote fallback:", err);
      }
    }

    inMemoryNotes.delete(`${folderId}:${noteId}`);

    const folder = await getFolderByIdInternal(this.database, folderId);
    if (folder && folder.instructionNoteId === noteId) {
      const remaining = await this.listFolderNotes(folderId);
      const nextInstruction = remaining.length > 0 ? remaining[0].noteId : null;
      await this.updateFolder(folderId, { instructionNoteId: nextInstruction });
    }

    return true;
  }

  /* ======================================================================== */
  /* Folder Context Operation                                                 */
  /* ======================================================================== */

  /**
   * Returns links + associated instruction note for the folder.
   * Rule: "Liegt eine Notiz im selben Ordner wie Links, gehört sie dazu und erklärt, was mit dem Link zu tun ist."
   */
  async getFolderContext(folderId: string): Promise<FolderContextResponse> {
    const details = await this.getFolder(folderId);
    if (!details) {
      throw new Error(`Ordner "${folderId}" existiert nicht.`);
    }

    const defaultInstruction = details.instructionNote?.content ||
      "Verarbeite die enthaltenen Links im Kontext dieses Arbeitsbereichs.";

    const mappedLinks = details.links.map((link) => {
      let specificInstruction = defaultInstruction;
      if (link.noteId) {
        const linkNote = details.notes.find((n) => n.noteId === link.noteId) || notesCatalog.get(link.noteId);
        if (linkNote?.content) {
          specificInstruction = linkNote.content;
        }
      }
      return {
        id: link.id,
        url: link.url,
        title: link.title,
        noteId: link.noteId ?? null,
        associatedInstruction: specificInstruction,
      };
    });

    return {
      folder: {
        id: details.id,
        parentId: details.parentId,
        name: details.name,
        kind: details.kind,
        ownerScope: details.ownerScope,
        instructionNoteId: details.instructionNoteId,
        createdAt: details.createdAt,
        updatedAt: details.updatedAt,
      },
      instructionNote: details.instructionNote || null,
      instructionText: defaultInstruction,
      links: mappedLinks,
    };
  }
}

let defaultStore: SparkFoldersStore | null = null;

export function getSparkFoldersStore(database?: Database): SparkFoldersStore {
  if (!defaultStore || database) {
    defaultStore = new SparkFoldersStore(database);
  }
  return defaultStore;
}
