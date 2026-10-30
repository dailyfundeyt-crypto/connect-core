/**
 * Spark-Learn Indexer (Lane 1)
 *
 * Incremental indexing per Content-Hash, local embeddings via Ollama bge-m3 (1024 dim),
 * pgvector support with Float32 bytea fallback, and sub-millisecond in-memory vector search.
 * Respects brain policy.ts / scope configurations.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import postgres from "postgres";
import type { Chunk, Embedder, SearchHit, SparkIndexState } from "../contracts";
import {
  SPARK_DEFAULT_EMBED_DIM,
  SPARK_DEFAULT_EMBED_MODEL,
} from "../contracts";
import { canRead } from "../../policy";
import {
  brainLocation,
  brainRootFor,
  listAllMarkdown,
  notePath as resolveNoteFullPath,
  readAgents,
  resolveBrainRoot,
} from "../../store";
import { chunkMarkdown } from "./chunker";
import {
  OllamaEmbedder,
  cosineSimilarity,
  createDefaultEmbedder,
} from "./embedder";

export interface IndexerOptions {
  embedder?: Embedder;
  databaseUrl?: string;
  batchNotesSize?: number;
  concurrency?: number;
}

export interface SearchFilter {
  folderScope?: string;
  notePath?: string;
}

/**
 * Resolves the database connection string, prioritizing local ConnectApp credentials (port 5544)
 * with graceful fallback to process.env.DATABASE_URL.
 */
export function resolveDatabaseUrl(): string {
  const local = process.env.LOCALAPPDATA;
  const envPath = local
    ? path.join(local, "ConnectApp", "data", "connect.env")
    : path.join(os.homedir(), ".connect", "data", "connect.env");

  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, "utf8");
      const match = /CONNECT_APP_DB_PASSWORD=(.+)/.exec(content);
      if (match) {
        const pwd = match[1].trim();
        return `postgres://connect:${pwd}@127.0.0.1:5544/connect`;
      }
    } catch {}
  }

  return (
    process.env.DATABASE_URL ||
    "postgres://connect:connect@127.0.0.1:5544/connect"
  );
}

interface CachedChunk {
  chunk: Chunk;
  embedding: Float32Array;
  fileHash: string;
}

export class SparkIndexer {
  readonly embedder: Embedder;
  private sql: postgres.Sql | null = null;
  private readonly dbUrl: string;
  private readonly batchNotesSize: number;
  private readonly concurrency: number;

  private isIndexing = false;
  private hasPgvector = false;
  private lastIndexedAt?: string;
  private totalChunks = 0;
  private totalNotes = 0;
  private lastError?: string;

  // In-memory cache for ultra-fast hybrid & cosine search: chunkId -> CachedChunk
  private readonly chunkCache = new Map<string, CachedChunk>();
  // File hash cache: notePath -> contentHash
  private readonly fileHashes = new Map<string, string>();
  private initialized = false;

  constructor(options?: IndexerOptions) {
    this.embedder = options?.embedder ?? createDefaultEmbedder();
    this.dbUrl = options?.databaseUrl || resolveDatabaseUrl();
    this.batchNotesSize = options?.batchNotesSize || 20;
    this.concurrency = options?.concurrency || 2;
  }

  /**
   * Initializes database connection, verifies pgvector, ensures schema tables,
   * and pre-populates in-memory cache.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.sql = postgres(this.dbUrl, {
        idle_timeout: 5,
        connect_timeout: 4,
        max: 5,
      });

      await this.ensureSchema();
      await this.loadExistingIndexState();
    } catch (err: any) {
      console.warn(
        `[SparkIndexer] Database connection failed (${err.message}). Running in pure in-memory mode.`,
      );
      this.sql = null;
    }

    this.initialized = true;
  }

  /**
   * Ensures spark_chunks and spark_index_state exist.
   */
  private async ensureSchema(): Promise<void> {
    if (!this.sql) return;

    try {
      // 1. Try activating pgvector extension
      try {
        await this.sql`CREATE EXTENSION IF NOT EXISTS vector`;
      } catch {}

      // 2. Check if pgvector is installed
      const vectorExt = await this.sql`
        SELECT extname FROM pg_extension WHERE extname = 'vector'
      `;
      this.hasPgvector = vectorExt.length > 0;

      // 3. Create tables
      await this.sql`
        CREATE TABLE IF NOT EXISTS spark_chunks (
          id text PRIMARY KEY NOT NULL,
          note_path text NOT NULL,
          heading text DEFAULT '' NOT NULL,
          chunk_idx integer NOT NULL,
          text text NOT NULL,
          hash text NOT NULL,
          line_start integer NOT NULL,
          line_end integer NOT NULL,
          embedding_bytea bytea,
          metadata jsonb,
          created_at timestamptz DEFAULT now() NOT NULL,
          updated_at timestamptz DEFAULT now() NOT NULL
        )
      `;

      await this.sql`
        CREATE INDEX IF NOT EXISTS spark_chunks_note_path_idx ON spark_chunks (note_path)
      `;
      await this.sql`
        CREATE INDEX IF NOT EXISTS spark_chunks_hash_idx ON spark_chunks (hash)
      `;

      if (this.hasPgvector) {
        try {
          await this.sql`
            ALTER TABLE spark_chunks ADD COLUMN IF NOT EXISTS embedding vector(1024)
          `;
          await this.sql`
            CREATE INDEX IF NOT EXISTS spark_chunks_embedding_hnsw 
            ON spark_chunks USING hnsw (embedding vector_cosine_ops)
          `;
        } catch {}
      }

      await this.sql`
        CREATE TABLE IF NOT EXISTS spark_index_state (
          id text PRIMARY KEY NOT NULL DEFAULT 'default',
          model text DEFAULT 'bge-m3' NOT NULL,
          dim integer DEFAULT 1024 NOT NULL,
          total_chunks integer DEFAULT 0 NOT NULL,
          total_notes integer DEFAULT 0 NOT NULL,
          last_indexed_at timestamptz,
          is_indexing boolean DEFAULT false NOT NULL,
          has_pgvector boolean DEFAULT false NOT NULL,
          error text,
          updated_at timestamptz DEFAULT now() NOT NULL
        )
      `;

      await this.sql`
        INSERT INTO spark_index_state (id, model, dim, total_chunks, total_notes, is_indexing, has_pgvector)
        VALUES ('default', ${this.embedder.model}, ${this.embedder.dim}, 0, 0, false, ${this.hasPgvector})
        ON CONFLICT (id) DO UPDATE SET
          has_pgvector = EXCLUDED.has_pgvector
      `;
    } catch (err: any) {
      console.warn("[SparkIndexer] Schema verification notice:", err.message);
    }
  }

  /**
   * Loads existing chunks into in-memory cache for fast search.
   */
  private async loadExistingIndexState(): Promise<void> {
    if (!this.sql) return;

    try {
      const stateRow = await this.sql`
        SELECT model, dim, total_chunks, total_notes, last_indexed_at, has_pgvector, error
        FROM spark_index_state WHERE id = 'default'
      `;

      if (stateRow.length > 0) {
        const row = stateRow[0];
        this.totalChunks = row.total_chunks || 0;
        this.totalNotes = row.total_notes || 0;
        this.lastIndexedAt = row.last_indexed_at
          ? new Date(row.last_indexed_at).toISOString()
          : undefined;
        this.hasPgvector = Boolean(row.has_pgvector);
        this.lastError = row.error || undefined;

        // If stored model or dimension differs from current embedder, trigger re-index
        if (
          row.model !== this.embedder.model ||
          row.dim !== this.embedder.dim
        ) {
          console.warn(
            `[SparkIndexer] Model or dimension changed (${row.model}/${row.dim} -> ${this.embedder.model}/${this.embedder.dim}). Clearing old chunks.`,
          );
          await this.sql`DELETE FROM spark_chunks`;
          this.chunkCache.clear();
          this.fileHashes.clear();
          this.totalChunks = 0;
          this.totalNotes = 0;
          return;
        }
      }

      // Load chunks into memory cache
      const rows = await this.sql`
        SELECT id, note_path, heading, chunk_idx, text, hash, line_start, line_end,
               embedding_bytea, metadata
        FROM spark_chunks
      `;

      for (const r of rows) {
        let embedding: Float32Array;
        if (r.embedding_bytea && Buffer.isBuffer(r.embedding_bytea)) {
          const buf = r.embedding_bytea;
          embedding = new Float32Array(
            buf.buffer,
            buf.byteOffset,
            buf.byteLength / 4,
          );
        } else {
          embedding = new Float32Array(this.embedder.dim);
        }

        const chunk: Chunk = {
          id: r.id,
          notePath: r.note_path,
          heading: r.heading || "",
          chunkIdx: r.chunk_idx,
          text: r.text,
          hash: r.hash,
          lineStart: r.line_start,
          lineEnd: r.line_end,
          metadata: r.metadata || undefined,
        };

        const fileHash = (r.metadata?.fileHash as string) || r.hash;
        this.chunkCache.set(chunk.id, { chunk, embedding, fileHash });
        if (!this.fileHashes.has(chunk.notePath)) {
          this.fileHashes.set(chunk.notePath, fileHash);
        }
      }

      this.totalChunks = this.chunkCache.size;
      this.totalNotes = this.fileHashes.size;
    } catch (err: any) {
      console.warn("[SparkIndexer] loadExistingIndexState:", err.message);
    }
  }

  /**
   * Returns current indexer status.
   */
  async getStatus(): Promise<
    SparkIndexState & {
      ollamaAvailable: boolean;
      modelLoaded: boolean;
      error?: string;
    }
  > {
    await this.init();

    let ollamaAvailable = false;
    let modelLoaded = false;
    if (this.embedder instanceof OllamaEmbedder) {
      const health = await this.embedder.checkHealth();
      ollamaAvailable = health.available;
      modelLoaded = health.modelLoaded;
    }

    return {
      model: this.embedder.model,
      dim: this.embedder.dim,
      totalChunks: this.totalChunks,
      totalNotes: this.totalNotes,
      lastIndexedAt: this.lastIndexedAt,
      isIndexing: this.isIndexing,
      hasPgvector: this.hasPgvector,
      ollamaAvailable,
      modelLoaded,
      error: this.lastError,
    };
  }

  /**
   * Performs an incremental or full index of the vault.
   * Respects policy scopes and skips forbidden or unreadable files.
   */
  async indexVault(options?: { forceFull?: boolean }): Promise<{
    indexedNotes: number;
    skippedNotes: number;
    totalChunks: number;
    durationMs: number;
  }> {
    await this.init();
    if (this.isIndexing) {
      throw new Error("Indexing is already running.");
    }

    this.isIndexing = true;
    const startTime = Date.now();
    let indexedNotes = 0;
    let skippedNotes = 0;

    try {
      const brainLoc = brainLocation(null);
      const rootPath = brainRootFor(null);
      const brain = await resolveBrainRoot(rootPath);

      if (!brain.available) {
        throw new Error(
          `Brain vault is not accessible: ${brain.reason || "Unknown reason"}`,
        );
      }

      // Read allowed areas and agent policies
      const agentsConfig = await readAgents(brain.root).catch(() => null);
      const defaultReadAreas = agentsConfig?.defaults?.read ?? [
        "Kern",
        "Shared",
        "Projects",
        "Daily",
        "Skills",
      ];
      const agentScopeEntry = {
        slug: "spark-learn",
        read: defaultReadAreas,
        write: [],
        files: [],
      };
      const projects = agentsConfig?.projects ?? [];

      // List all markdown files in the vault
      const allFiles = await listAllMarkdown(brain.root);

      // Filter files allowed by policy
      const candidateFiles = allFiles.filter((file) => {
        // Skip log.md, agents.json, templates, or files denied by policy
        if (
          file.path.toLowerCase() === "log.md" ||
          file.path.toLowerCase() === "agents.json"
        )
          return false;
        try {
          return canRead(agentScopeEntry, file.path, projects);
        } catch {
          return false;
        }
      });

      if (options?.forceFull) {
        this.fileHashes.clear();
        this.chunkCache.clear();
        if (this.sql) {
          await this.sql`DELETE FROM spark_chunks`;
        }
      }

      // Process in batches of this.batchNotesSize (default 20), concurrency max 2
      for (let i = 0; i < candidateFiles.length; i += this.batchNotesSize) {
        const batch = candidateFiles.slice(i, i + this.batchNotesSize);

        // Process batch with controlled concurrency
        const worker = async (file: (typeof candidateFiles)[0]) => {
          const fullPath = resolveNoteFullPath(brain.root, file.path);
          const content = await readFile(fullPath, "utf8").catch(() => "");
          if (!content.trim()) return;

          const contentHash = createHash("sha256")
            .update(content, "utf8")
            .digest("hex");
          const existingHash = this.fileHashes.get(file.path);

          // Incremental check: if content hash unchanged, skip embedding
          if (!options?.forceFull && existingHash === contentHash) {
            skippedNotes++;
            return;
          }

          // Chunk the note
          const chunkRes = chunkMarkdown(file.path, content);
          if (chunkRes.chunks.length === 0) return;

          // Attach fileHash to chunk metadata
          for (const c of chunkRes.chunks) {
            c.metadata = { ...c.metadata, fileHash: contentHash };
          }

          // Embed chunks
          const chunkTexts = chunkRes.chunks.map(
            (c) => `${c.heading}\n${c.text}`,
          );
          const embeddings = await this.embedder.embed(chunkTexts);

          // Store in database and update cache
          await this.saveNoteChunks(file.path, chunkRes.chunks, embeddings);
          this.fileHashes.set(file.path, contentHash);
          indexedNotes++;
        };

        // Run with concurrency limit
        const activeTasks: Promise<void>[] = [];
        for (const file of batch) {
          const p = worker(file);
          activeTasks.push(p);
          if (activeTasks.length >= this.concurrency) {
            await Promise.race(activeTasks);
            // remove completed
            for (let t = activeTasks.length - 1; t >= 0; t--) {
              // check if settled
            }
          }
        }
        await Promise.all(activeTasks);
      }

      // Update state
      this.totalChunks = this.chunkCache.size;
      this.totalNotes = this.fileHashes.size;
      this.lastIndexedAt = new Date().toISOString();
      this.lastError = undefined;

      await this.saveIndexState();

      return {
        indexedNotes,
        skippedNotes,
        totalChunks: this.totalChunks,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      this.lastError = err?.message || String(err);
      await this.saveIndexState();
      throw err;
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Indexes a single note (used by watcher on file modifications).
   */
  async indexNote(
    relativePath: string,
  ): Promise<{ chunkCount: number; updated: boolean }> {
    await this.init();

    const rootPath = brainRootFor(null);
    const brain = await resolveBrainRoot(rootPath);
    if (!brain.available) return { chunkCount: 0, updated: false };

    const fullPath = resolveNoteFullPath(brain.root, relativePath);
    const content = await readFile(fullPath, "utf8").catch(() => "");
    if (!content.trim()) {
      await this.removeNote(relativePath);
      return { chunkCount: 0, updated: true };
    }

    const contentHash = createHash("sha256")
      .update(content, "utf8")
      .digest("hex");
    const existingHash = this.fileHashes.get(relativePath);
    if (existingHash === contentHash) {
      return { chunkCount: 0, updated: false };
    }

    const chunkRes = chunkMarkdown(relativePath, content);
    for (const c of chunkRes.chunks) {
      c.metadata = { ...c.metadata, fileHash: contentHash };
    }

    const chunkTexts = chunkRes.chunks.map((c) => `${c.heading}\n${c.text}`);
    const embeddings = await this.embedder.embed(chunkTexts);

    await this.saveNoteChunks(relativePath, chunkRes.chunks, embeddings);
    this.fileHashes.set(relativePath, contentHash);
    this.totalChunks = this.chunkCache.size;
    this.totalNotes = this.fileHashes.size;
    this.lastIndexedAt = new Date().toISOString();
    await this.saveIndexState();

    return { chunkCount: chunkRes.chunks.length, updated: true };
  }

  /**
   * Removes a deleted note from the index.
   */
  async removeNote(relativePath: string): Promise<void> {
    await this.init();

    // Remove from in-memory cache
    for (const [id, item] of this.chunkCache.entries()) {
      if (item.chunk.notePath === relativePath) {
        this.chunkCache.delete(id);
      }
    }
    this.fileHashes.delete(relativePath);

    // Remove from database
    if (this.sql) {
      try {
        await this.sql`DELETE FROM spark_chunks WHERE note_path = ${relativePath}`;
      } catch {}
    }

    this.totalChunks = this.chunkCache.size;
    this.totalNotes = this.fileHashes.size;
    await this.saveIndexState();
  }

  /**
   * Saves chunks and embeddings for a note.
   */
  private async saveNoteChunks(
    notePath: string,
    chunks: Chunk[],
    embeddings: Float32Array[],
  ): Promise<void> {
    // 1. Clear old chunks for notePath in memory
    for (const [id, item] of this.chunkCache.entries()) {
      if (item.chunk.notePath === notePath) {
        this.chunkCache.delete(id);
      }
    }

    // 2. Add new chunks to memory cache
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i] || new Float32Array(this.embedder.dim);
      this.chunkCache.set(chunk.id, {
        chunk,
        embedding,
        fileHash: (chunk.metadata?.fileHash as string) || chunk.hash,
      });
    }

    // 3. Persist to database if available
    if (this.sql) {
      try {
        await this.sql`DELETE FROM spark_chunks WHERE note_path = ${notePath}`;

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const emb = embeddings[i];
          const byteaBuf = Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength);

          if (this.hasPgvector) {
            const vectorStr = `[${Array.from(emb).join(",")}]`;
            await this.sql`
              INSERT INTO spark_chunks (
                id, note_path, heading, chunk_idx, text, hash,
                line_start, line_end, embedding_bytea, embedding, metadata, updated_at
              ) VALUES (
                ${chunk.id}, ${chunk.notePath}, ${chunk.heading}, ${chunk.chunkIdx},
                ${chunk.text}, ${chunk.hash}, ${chunk.lineStart}, ${chunk.lineEnd},
                ${byteaBuf}, ${vectorStr}::vector, ${JSON.stringify(chunk.metadata ?? {})}::jsonb, now()
              )
            `;
          } else {
            await this.sql`
              INSERT INTO spark_chunks (
                id, note_path, heading, chunk_idx, text, hash,
                line_start, line_end, embedding_bytea, metadata, updated_at
              ) VALUES (
                ${chunk.id}, ${chunk.notePath}, ${chunk.heading}, ${chunk.chunkIdx},
                ${chunk.text}, ${chunk.hash}, ${chunk.lineStart}, ${chunk.lineEnd},
                ${byteaBuf}, ${JSON.stringify(chunk.metadata ?? {})}::jsonb, now()
              )
            `;
          }
        }
      } catch (err: any) {
        console.warn(
          `[SparkIndexer] DB save error for ${notePath}:`,
          err.message,
        );
      }
    }
  }

  /**
   * Persists current state record to spark_index_state.
   */
  private async saveIndexState(): Promise<void> {
    if (!this.sql) return;
    try {
      await this.sql`
        INSERT INTO spark_index_state (
          id, model, dim, total_chunks, total_notes, last_indexed_at,
          is_indexing, has_pgvector, error, updated_at
        ) VALUES (
          'default', ${this.embedder.model}, ${this.embedder.dim},
          ${this.totalChunks}, ${this.totalNotes},
          ${this.lastIndexedAt ? new Date(this.lastIndexedAt) : null},
          ${this.isIndexing}, ${this.hasPgvector}, ${this.lastError || null}, now()
        )
        ON CONFLICT (id) DO UPDATE SET
          model = EXCLUDED.model,
          dim = EXCLUDED.dim,
          total_chunks = EXCLUDED.total_chunks,
          total_notes = EXCLUDED.total_notes,
          last_indexed_at = EXCLUDED.last_indexed_at,
          is_indexing = EXCLUDED.is_indexing,
          has_pgvector = EXCLUDED.has_pgvector,
          error = EXCLUDED.error,
          updated_at = EXCLUDED.updated_at
      `;
    } catch {}
  }

  /**
   * Hybrid semantic vector search + keyword matching.
   * Returns ranked SearchHits with score, chunk, notePath, heading, line numbers.
   */
  async search(
    query: string,
    k = 10,
    filter?: SearchFilter,
  ): Promise<SearchHit[]> {
    await this.init();
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    // 1. Embed query
    const [queryVector] = await this.embedder.embed([cleanQuery]);
    const queryTokens = cleanQuery
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const scoredHits: Array<{ hit: SearchHit; rawVectorScore: number }> = [];

    // 2. Score candidates in memory (fast and exact)
    for (const item of this.chunkCache.values()) {
      const { chunk, embedding } = item;

      // Filter by folderScope
      if (filter?.folderScope) {
        const scope = filter.folderScope.toLowerCase().replace(/\\/g, "/");
        const p = chunk.notePath.toLowerCase().replace(/\\/g, "/");
        if (!p.startsWith(scope)) continue;
      }

      // Filter by notePath
      if (filter?.notePath) {
        if (
          chunk.notePath.toLowerCase() !== filter.notePath.toLowerCase().trim()
        ) {
          continue;
        }
      }

      // Cosine similarity
      const vScore = cosineSimilarity(queryVector, embedding);

      // Keyword token score
      let kMatches = 0;
      const lowerText = (chunk.heading + " " + chunk.text).toLowerCase();
      for (const token of queryTokens) {
        if (lowerText.includes(token)) kMatches++;
      }
      const kScore =
        queryTokens.length > 0 ? kMatches / queryTokens.length : 0;

      // Hybrid combination: 80% vector, 20% keyword
      const combinedScore = vScore * 0.8 + kScore * 0.2;

      scoredHits.push({
        hit: {
          chunk,
          score: Math.round(combinedScore * 10000) / 10000,
          source: vScore >= kScore ? "vector" : "keyword",
        },
        rawVectorScore: vScore,
      });
    }

    // 3. Sort by score descending and take top k
    scoredHits.sort((a, b) => b.hit.score - a.hit.score);
    return scoredHits.slice(0, k).map((item) => item.hit);
  }

  /**
   * Closes database connection pool when shutting down.
   */
  async close(): Promise<void> {
    if (this.sql) {
      await this.sql.end().catch(() => {});
      this.sql = null;
    }
  }
}

// Singleton instance for the server runtime
let defaultIndexerInstance: SparkIndexer | null = null;

export function getSparkIndexer(options?: IndexerOptions): SparkIndexer {
  if (!defaultIndexerInstance) {
    defaultIndexerInstance = new SparkIndexer(options);
  }
  return defaultIndexerInstance;
}
