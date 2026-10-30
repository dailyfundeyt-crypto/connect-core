/**
 * Transcriber Agent Service (Swarm-v3 Lane 4)
 * Orchestrates Instagram reel transcription, tool extraction, Spark folder matching,
 * duplicate verification, dry-run planning, and seed execution for test users.
 */

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  type TranscriberJob,
  type CreateTranscriberJobRequest,
  type TranscriberJobResponse,
  type ListTranscriberJobsResponse,
  type BrowserFolder,
  type FolderLink,
  type FolderNote,
  type TranscriberExecutionPlan,
  type SparkSeedResult,
} from "./types";
import {
  transcribeInstagramReel,
  extractToolsFromTranscript,
} from "./browser-client";
import { mockBrowserFolders, mockFolderLinks, mockFolderNotes } from "../../../contracts/swarm-v3";

const DEFAULT_POSTGRES_URL =
  process.env.DATABASE_URL ||
  "postgres://connect:f1691e59c1531553fd6002595803b1792d1aedf0201833fb@127.0.0.1:5544/connect";

export class TranscriberService {
  private jobs: Map<string, TranscriberJob> = new Map();
  private folders: Map<string, BrowserFolder> = new Map();
  private links: Map<string, FolderLink> = new Map();
  private notes: Map<string, FolderNote> = new Map();
  private sqlClient: ReturnType<typeof postgres> | null = null;

  constructor() {
    this.seedInitialMockData();
  }

  private getSql(): ReturnType<typeof postgres> | null {
    if (!this.sqlClient) {
      try {
        this.sqlClient = postgres(DEFAULT_POSTGRES_URL, {
          max: 3,
          idle_timeout: 10,
          connect_timeout: 3,
        });
      } catch {
        this.sqlClient = null;
      }
    }
    return this.sqlClient;
  }

  private seedInitialMockData(): void {
    // Populate folders from Phase 0 mock contracts
    for (const folder of mockBrowserFolders) {
      this.folders.set(folder.id, { ...folder });
    }
    for (const link of mockFolderLinks) {
      this.links.set(link.id, { ...link });
    }
    for (const note of mockFolderNotes) {
      this.notes.set(`${note.folderId}:${note.noteId}`, { ...note });
    }
  }

  /**
   * Lists all transcriber jobs.
   */
  public listJobs(): ListTranscriberJobsResponse {
    const jobsList = Array.from(this.jobs.values()).sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });

    return {
      success: true,
      jobs: jobsList,
    };
  }

  /**
   * Retrieves a single job by ID.
   */
  public getJob(id: string): TranscriberJobResponse | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    return {
      success: true,
      job,
    };
  }

  /**
   * Retrieves all Spark folders.
   */
  public listFolders(): BrowserFolder[] {
    return Array.from(this.folders.values());
  }

  /**
   * Retrieves all Spark links.
   */
  public listLinks(folderId?: string): FolderLink[] {
    const all = Array.from(this.links.values());
    if (folderId) {
      return all.filter((l) => l.folderId === folderId);
    }
    return all;
  }

  /**
   * Retrieves all Spark notes.
   */
  public listNotes(folderId?: string): FolderNote[] {
    const all = Array.from(this.notes.values());
    if (folderId) {
      return all.filter((n) => n.folderId === folderId);
    }
    return all;
  }

  /**
   * Resolves or creates a target Spark browser folder.
   */
  public getOrCreateFolder(
    name = "UI & Component Libraries",
    parentId: string | null = null
  ): BrowserFolder {
    for (const f of this.folders.values()) {
      if (f.name.toLowerCase() === name.toLowerCase()) {
        return f;
      }
    }

    const now = new Date().toISOString();
    const newFolder: BrowserFolder = {
      id: `folder_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now()}`,
      parentId,
      name,
      kind: "normal",
      ownerScope: "agent_transcriber",
      instructionNoteId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.folders.set(newFolder.id, newFolder);
    return newFolder;
  }

  /**
   * Creates and executes a Transcriber Job.
   * Supports dry-run mode (plans extraction without writing links or notes).
   */
  public async createJob(
    req: CreateTranscriberJobRequest
  ): Promise<TranscriberJobResponse & { plan?: TranscriberExecutionPlan }> {
    const jobId = `job_transcribe_${Date.now()}_${randomUUID().slice(0, 6)}`;
    const now = new Date().toISOString();

    const job: TranscriberJob = {
      id: jobId,
      url: req.url,
      status: "transcribing",
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, job);

    try {
      // Step 1: Transcribe via getthescript.app (isolated Helium agent profile)
      const transcription = await transcribeInstagramReel(req.url);
      job.transcript = transcription.transcript;
      job.status = "extracting";
      job.updatedAt = new Date().toISOString();

      // Step 2: Extract tools
      const extracted = extractToolsFromTranscript(transcription.transcript);
      job.toolsExtracted = extracted.map((t) => ({
        name: t.name,
        url: t.url,
        purpose: t.purpose,
      }));

      // Step 3: Match or locate target folder
      let folder: BrowserFolder;
      let isNewFolder = false;

      if (req.targetFolderId && this.folders.has(req.targetFolderId)) {
        folder = this.folders.get(req.targetFolderId)!;
      } else {
        const found = Array.from(this.folders.values()).find(
          (f) => f.name.toLowerCase() === "ui & component libraries"
        );
        if (found) {
          folder = found;
        } else {
          folder = this.getOrCreateFolder("UI & Component Libraries");
          isNewFolder = true;
        }
      }
      job.targetFolderId = folder.id;

      // Step 4: Duplicate verification per URL
      const existingUrls = new Set(
        Array.from(this.links.values()).map((l) => l.url.toLowerCase())
      );

      const skippedDuplicates: string[] = [];
      const linksToAdd: Array<{
        url: string;
        title: string;
        noteTitle: string;
        noteContent: string;
      }> = [];

      for (const tool of extracted) {
        if (!tool.url) continue;
        const normalized = tool.url.toLowerCase();

        if (existingUrls.has(normalized)) {
          tool.isDuplicate = true;
          skippedDuplicates.push(tool.url);
        } else {
          tool.isDuplicate = false;
          linksToAdd.push({
            url: tool.url,
            title: tool.name,
            noteTitle: `Zweck & Notiz: ${tool.name}`,
            noteContent: tool.purpose,
          });
        }
      }

      const plan: TranscriberExecutionPlan = {
        jobId,
        targetFolder: {
          id: folder.id,
          name: folder.name,
          isNew: isNewFolder,
        },
        tools: extracted,
        linksToAdd,
        skippedDuplicates,
        dryRun: req.dryRun ?? false,
      };

      // Step 5: Execute or Dry-Run
      if (req.dryRun) {
        // DRY RUN: Only write plan, no Spark mutation
        job.status = "completed";
        job.updatedAt = new Date().toISOString();
        return {
          success: true,
          job,
          plan,
        };
      }

      // LIVE RUN: Apply links & notes to Spark
      for (const item of linksToAdd) {
        const linkId = `link_${randomUUID().slice(0, 8)}`;
        const noteId = `note_${randomUUID().slice(0, 8)}`;
        const itemNow = new Date().toISOString();

        // Note creation (wofür ist das Tool)
        const note: FolderNote = {
          folderId: folder.id,
          noteId,
          title: item.noteTitle,
          content: item.noteContent,
          createdAt: itemNow,
        };
        this.notes.set(`${folder.id}:${noteId}`, note);

        // Link creation
        const link: FolderLink = {
          id: linkId,
          folderId: folder.id,
          url: item.url,
          title: item.title,
          noteId,
          createdAt: itemNow,
          updatedAt: itemNow,
        };
        this.links.set(linkId, link);
      }

      job.status = "completed";
      job.updatedAt = new Date().toISOString();

      return {
        success: true,
        job,
        plan,
      };
    } catch (err: any) {
      job.status = "failed";
      job.error = err?.message || String(err);
      job.updatedAt = new Date().toISOString();

      return {
        success: false,
        job,
      };
    }
  }

  /**
   * Seed-Test for daiyfunde.yt@gmail.com (Prompt 4.2).
   * Seeds particles.casberry.in, originkit.dev, daisyui.com with notes into Spark.
   * GUARANTEE: Keine E-Mail senden.
   */
  public async seedForTestUser(
    targetEmail = "daiyfunde.yt@gmail.com"
  ): Promise<SparkSeedResult> {
    const sql = this.getSql();
    let verifiedUser: { id: string; email: string; name: string } | null = null;

    // Check if account exists in local database
    if (sql) {
      try {
        const rows = await sql`
          SELECT id, email, name FROM users 
          WHERE email ILIKE ${targetEmail} OR email ILIKE 'dailyfunde.yt@gmail.com'
          LIMIT 1
        `;
        if (rows.length > 0) {
          verifiedUser = rows[0] as any;
        }
      } catch {
        // Fall back gracefully
      }
    }

    // Target folder for test user in Spark
    const folder = this.getOrCreateFolder("UI & Component Libraries");

    // Add folder instruction note if not present
    const instKey = `${folder.id}:note_tools_inst`;
    if (!this.notes.has(instKey)) {
      this.notes.set(instKey, {
        folderId: folder.id,
        noteId: "note_tools_inst",
        title: "Instruktion für extrahierte UI-Tools",
        content:
          "Alle in diesem Ordner abgelegten Tools dienen als Referenz für moderne Web- & Frontend-Komponenten in Connect v3.",
        createdAt: new Date().toISOString(),
      });
    }

    const seedTools = [
      {
        id: "link_particles_casberry",
        name: "Particles Casberry",
        url: "https://particles.casberry.in",
        purpose:
          "Interaktive Canvas-Partikel-Animationen und physikalische Hintergrund-Effekte für moderne Web-Frontends.",
      },
      {
        id: "link_originkit",
        name: "Origin Kit",
        url: "https://originkit.dev",
        purpose:
          "Produktionsreife Tailwind CSS Dashboard-Komponenten, Tabellen und vorgefertigte UI-Blöcke.",
      },
      {
        id: "link_daisyui",
        name: "daisyUI",
        url: "https://daisyui.com",
        purpose:
          "Semantische Komponentenbibliothek für Tailwind CSS ohne zusätzliche JavaScript-Abhängigkeiten.",
      },
    ];

    const linksCreated: Array<{ id: string; title: string; url: string }> = [];
    const notesCreated: Array<{ id: string; title: string }> = [];
    const now = new Date().toISOString();

    for (const tool of seedTools) {
      const noteId = `note_${tool.id}`;
      const note: FolderNote = {
        folderId: folder.id,
        noteId,
        title: `Wofür ist das Tool: ${tool.name}`,
        content: tool.purpose,
        createdAt: now,
      };
      this.notes.set(`${folder.id}:${noteId}`, note);
      notesCreated.push({ id: noteId, title: note.title || tool.name });

      const link: FolderLink = {
        id: tool.id,
        folderId: folder.id,
        url: tool.url,
        title: tool.name,
        noteId,
        createdAt: now,
        updatedAt: now,
      };
      this.links.set(tool.id, link);
      linksCreated.push({ id: link.id, title: link.title, url: link.url });
    }

    return {
      success: true,
      userEmail: verifiedUser?.email || targetEmail,
      userId: verifiedUser?.id,
      folderId: folder.id,
      folderName: folder.name,
      linksCreated,
      notesCreated,
      emailSent: false, // Explicit guarantee
      timestamp: now,
    };
  }
}

// Singleton instance
let serviceInstance: TranscriberService | null = null;

export function getTranscriberService(): TranscriberService {
  if (!serviceInstance) {
    serviceInstance = new TranscriberService();
  }
  return serviceInstance;
}
