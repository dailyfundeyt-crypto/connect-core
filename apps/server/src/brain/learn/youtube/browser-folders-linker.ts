/**
 * Browser-Folders Linker for YouTube (Lane 5)
 *
 * Connects YouTube folders and videos into Browser-Folders (swarm-v3 Lane 3):
 * - Links folder hierarchy into `browser_folders` without duplicating data
 * - Registers video URLs in `folder_links`
 * - Links generated Spark notes in `folder_notes`
 */

import postgres from "postgres";
import { randomUUID } from "node:crypto";
import type { YtVideoRecord } from "./types";
import { resolveDatabaseUrl } from "../index/indexer";

export interface BrowserFolderLinkResult {
  folderId: string;
  folderName: string;
  linkId?: string;
  noteLinked: boolean;
}

export class BrowserFoldersLinker {
  private sql: ReturnType<typeof postgres> | null = null;
  private dbUrl: string;
  private memoryFolders = new Map<string, string>(); // name -> id

  constructor(customDbUrl?: string) {
    this.dbUrl = customDbUrl || resolveDatabaseUrl();
  }

  private async getSql(): Promise<ReturnType<typeof postgres> | null> {
    if (!this.sql) {
      try {
        this.sql = postgres(this.dbUrl, {
          max: 2,
          idle_timeout: 5,
          connect_timeout: 3,
        });
      } catch (err: any) {
        console.warn("[BrowserFoldersLinker] Postgres connection failed:", err?.message);
        this.sql = null;
      }
    }
    return this.sql;
  }

  /**
   * Ensures browser_folders tables exist.
   */
  async ensureTables(): Promise<void> {
    const sql = await this.getSql();
    if (!sql) return;

    try {
      await sql`
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
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS folder_links (
          id text PRIMARY KEY NOT NULL,
          folder_id text NOT NULL REFERENCES browser_folders(id) ON DELETE CASCADE,
          url text NOT NULL,
          title text NOT NULL,
          note_id text,
          created_at timestamptz DEFAULT now() NOT NULL,
          updated_at timestamptz DEFAULT now() NOT NULL
        );
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS folder_notes (
          folder_id text NOT NULL REFERENCES browser_folders(id) ON DELETE CASCADE,
          note_id text NOT NULL,
          title text,
          content text,
          created_at timestamptz DEFAULT now() NOT NULL,
          PRIMARY KEY (folder_id, note_id)
        );
      `;
    } catch (err: any) {
      console.warn("[BrowserFoldersLinker] ensureTables error:", err?.message);
    }
  }

  /**
   * Finds or creates a BrowserFolder for the given YouTube subfolder.
   */
  async ensureFolder(folderPath: string): Promise<string> {
    const sql = await this.getSql();
    const cleanPath = folderPath.replace(/^[\\/]+|[\\/]+$/g, "");
    const parts = cleanPath.split(/[\\/]+/);

    // Root folder is usually "YouTube"
    const rootName = parts[0] || "YouTube";
    const subName = parts[1] || "Allgemein";

    if (this.memoryFolders.has(cleanPath)) {
      return this.memoryFolders.get(cleanPath)!;
    }

    if (!sql) {
      const mockId = `bf_${cleanPath.replace(/[^a-zA-Z0-9]/g, "_")}`;
      this.memoryFolders.set(cleanPath, mockId);
      return mockId;
    }

    try {
      await this.ensureTables();

      // 1. Find or create root folder "YouTube"
      let rootId: string;
      const existingRoots = await sql`
        SELECT id FROM browser_folders WHERE name = ${rootName} AND parent_id IS NULL LIMIT 1
      `;
      if (existingRoots.length > 0) {
        rootId = existingRoots[0].id;
      } else {
        rootId = `bf_yt_root_${randomUUID().slice(0, 8)}`;
        await sql`
          INSERT INTO browser_folders (id, parent_id, name, kind, owner_scope)
          VALUES (${rootId}, NULL, ${rootName}, 'normal', 'company')
        `;
      }

      // 2. Find or create child folder
      let childId: string;
      const existingChildren = await sql`
        SELECT id FROM browser_folders WHERE name = ${subName} AND parent_id = ${rootId} LIMIT 1
      `;
      if (existingChildren.length > 0) {
        childId = existingChildren[0].id;
      } else {
        childId = `bf_yt_${randomUUID().slice(0, 8)}`;
        await sql`
          INSERT INTO browser_folders (id, parent_id, name, kind, owner_scope)
          VALUES (${childId}, ${rootId}, ${subName}, 'normal', 'company')
        `;
      }

      this.memoryFolders.set(cleanPath, childId);
      return childId;
    } catch (err: any) {
      console.warn("[BrowserFoldersLinker] Failed to ensure folder in DB:", err?.message);
      const fallbackId = `bf_fb_${cleanPath.replace(/[^a-zA-Z0-9]/g, "_")}`;
      this.memoryFolders.set(cleanPath, fallbackId);
      return fallbackId;
    }
  }

  /**
   * Links a video to Browser-Folders as a folder_link and optional folder_note.
   */
  async linkVideo(video: YtVideoRecord): Promise<BrowserFolderLinkResult> {
    const folderId = await this.ensureFolder(video.folder);
    const sql = await this.getSql();

    if (!sql) {
      return {
        folderId,
        folderName: video.folder,
        noteLinked: Boolean(video.notePath),
      };
    }

    let linkId: string | undefined;

    try {
      // 1. Link in folder_links
      const existingLinks = await sql`
        SELECT id FROM folder_links WHERE folder_id = ${folderId} AND url = ${video.url} LIMIT 1
      `;
      if (existingLinks.length > 0) {
        linkId = existingLinks[0].id;
      } else {
        linkId = `flink_${randomUUID().slice(0, 10)}`;
        await sql`
          INSERT INTO folder_links (id, folder_id, url, title, note_id)
          VALUES (${linkId}, ${folderId}, ${video.url}, ${video.title}, ${video.notePath ?? null})
        `;
      }

      // 2. Link in folder_notes if note exists
      let noteLinked = false;
      if (video.notePath) {
        await sql`
          INSERT INTO folder_notes (folder_id, note_id, title, content)
          VALUES (${folderId}, ${video.notePath}, ${video.title}, ${video.title})
          ON CONFLICT (folder_id, note_id) DO UPDATE SET
            title = EXCLUDED.title
        `;
        noteLinked = true;
      }

      return {
        folderId,
        folderName: video.folder,
        linkId,
        noteLinked,
      };
    } catch (err: any) {
      console.warn(`[BrowserFoldersLinker] linkVideo error for ${video.videoId}:`, err?.message);
      return {
        folderId,
        folderName: video.folder,
        noteLinked: false,
      };
    }
  }
}

let defaultLinkerInstance: BrowserFoldersLinker | null = null;

export function getBrowserFoldersLinker(dbUrl?: string): BrowserFoldersLinker {
  if (!defaultLinkerInstance) {
    defaultLinkerInstance = new BrowserFoldersLinker(dbUrl);
  }
  return defaultLinkerInstance;
}
