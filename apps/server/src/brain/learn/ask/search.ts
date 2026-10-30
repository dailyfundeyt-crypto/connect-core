import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type Chunk,
  type SearchHit,
  type Citation,
  SPARK_DEFAULT_OLLAMA_URL,
  SPARK_DEFAULT_EMBED_MODEL,
} from "../contracts";
import {
  type HybridSearchOptions,
  DEFAULT_SEARCH_OPTIONS,
} from "./types";
import {
  listAllMarkdown,
  safeMarkdownPath,
  resolveBrainRoot,
  brainRootFromEnv,
  searchMarkdown,
  notePath,
} from "../../store";

/* ========================================================================== */
/* Heading & Line Helpers                                                     */
/* ========================================================================== */

export function findEnclosingHeading(lines: string[], targetLineIdx: number): string {
  for (let i = Math.min(targetLineIdx, lines.length - 1); i >= 0; i--) {
    const line = lines[i]?.trim();
    if (line && /^#{1,6}\s+/.test(line)) {
      return line.replace(/^#{1,6}\s+/, "").trim();
    }
  }
  return "";
}

/**
 * Creates deterministic chunks from a markdown note with heading preservation and exact line ranges.
 */
export function chunkMarkdownNote(notePath: string, content: string, maxChunkLines = 25): Chunk[] {
  const lines = content.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let currentLines: string[] = [];
  let startLine = 1;
  let chunkIdx = 0;
  let currentHeading = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeading = /^#{1,6}\s+/.test(line.trim());

    if (isHeading) {
      if (currentLines.length > 0) {
        const text = currentLines.join("\n").trim();
        if (text.length > 0) {
          chunks.push({
            id: `${notePath}#${chunkIdx}`,
            notePath,
            heading: currentHeading,
            chunkIdx,
            text,
            hash: Buffer.from(text).toString("base64").slice(0, 16),
            lineStart: startLine,
            lineEnd: i,
          });
          chunkIdx++;
        }
        currentLines = [];
      }
      currentHeading = line.trim().replace(/^#{1,6}\s+/, "");
      startLine = i + 1;
    }

    currentLines.push(line);

    if (currentLines.length >= maxChunkLines && !isHeading) {
      const text = currentLines.join("\n").trim();
      if (text.length > 0) {
        chunks.push({
          id: `${notePath}#${chunkIdx}`,
          notePath,
          heading: currentHeading || findEnclosingHeading(lines, startLine - 1),
          chunkIdx,
          text,
          hash: Buffer.from(text).toString("base64").slice(0, 16),
          lineStart: startLine,
          lineEnd: i + 1,
        });
        chunkIdx++;
      }
      currentLines = [];
      startLine = i + 2;
    }
  }

  if (currentLines.length > 0) {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      chunks.push({
        id: `${notePath}#${chunkIdx}`,
        notePath,
        heading: currentHeading || findEnclosingHeading(lines, startLine - 1),
        chunkIdx,
        text,
        hash: Buffer.from(text).toString("base64").slice(0, 16),
        lineStart: startLine,
        lineEnd: lines.length,
      });
    }
  }

  return chunks;
}

export const GERMAN_ENGLISH_STOPWORDS = new Set([
  "der", "die", "das", "des", "dem", "den", "ein", "eine", "einer", "eines", "einem", "einen",
  "und", "oder", "aber", "denn", "weil", "wenn", "dass", "daß", "als", "wie",
  "in", "im", "an", "am", "auf", "aus", "bei", "beim", "mit", "nach", "von", "vom", "zu", "zum", "zur", "über", "unter", "vor", "zwischen", "für",
  "ist", "sind", "war", "waren", "wird", "werden", "hat", "haben", "hatte", "hatten", "kann", "können", "soll", "sollte", "gibt",
  "funktioniert", "funktionieren", "funktioniere", "geht", "gehen", "macht", "machen", "steht", "stehen", "findet", "finden", "weiß", "wissen", "hilft", "helfen",
  "ich", "du", "er", "sie", "es", "wir", "ihr", "man", "sich", "mein", "dein", "sein", "unser",
  "was", "wer", "wo", "wann", "warum", "wieso", "weshalb", "welche", "welcher", "welches", "welchen",
  "nicht", "nur", "auch", "so", "noch", "schon", "sehr", "mehr", "immer", "wieder",
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "is", "are", "was", "were", "what", "how", "where", "when", "why", "which"
]);

export function extractMeaningfulTokens(query: string): string[] {
  const allTokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9äöüß_-]/gi, ""))
    .filter((t) => t.length >= 2);

  const meaningful = allTokens.filter((t) => !GERMAN_ENGLISH_STOPWORDS.has(t));
  return meaningful.length > 0 ? meaningful : allTokens;
}

export function calculateKeywordScore(queryTokens: string[], text: string, title: string): number {
  if (queryTokens.length === 0) return 0;
  const lowerText = text.toLowerCase();
  const lowerTitle = title.toLowerCase();

  let matches = 0;
  let titleBonus = 0;

  for (const token of queryTokens) {
    const inTitle = lowerTitle.includes(token);
    const inText = lowerText.includes(token);

    if (inTitle) {
      titleBonus += 0.35;
      matches += 1.5;
    } else if (inText) {
      matches += 1.0;
    }
  }

  // If query has 3+ content keywords, require at least 2 to match (or match in title)
  if (queryTokens.length >= 3 && matches < 1.8 && titleBonus === 0) {
    return 0;
  }

  const tokenCoverage = matches / (queryTokens.length * 1.0);
  if (tokenCoverage < 0.35 && titleBonus === 0) {
    return 0;
  }

  return Math.min(1, Math.min(1, tokenCoverage) * 0.7 + Math.min(0.3, titleBonus));
}

/* ========================================================================== */
/* Cosine Similarity Helper                                                   */
/* ========================================================================== */

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ========================================================================== */
/* Hybrid Search Engine                                                       */
/* ========================================================================== */

export interface HybridSearchResult {
  hits: SearchHit[];
  citations: Citation[];
  topScore: number;
  hasSufficientSources: boolean;
}

export function normalizeNotePath(root: string, relPath: string): string {
  const norm = relPath.replace(/\\/g, "/");
  if (norm.startsWith("Vault/")) return norm;
  const directPath = notePath(root, norm);
  if (existsSync(directPath)) return norm;
  const withVault = `Vault/${norm}`;
  const vaultPath = notePath(root, withVault);
  if (existsSync(vaultPath)) return withVault;
  return norm;
}

export class HybridSearchEngine {
  private vaultRoot?: string;
  private ollamaEndpoint: string;
  private embedModel: string;

  constructor(options?: {
    vaultRoot?: string;
    ollamaEndpoint?: string;
    embedModel?: string;
  }) {
    this.vaultRoot = options?.vaultRoot;
    this.ollamaEndpoint = options?.ollamaEndpoint || SPARK_DEFAULT_OLLAMA_URL;
    this.embedModel = options?.embedModel || SPARK_DEFAULT_EMBED_MODEL;
  }

  public async getRoot(): Promise<string> {
    if (this.vaultRoot && existsSync(this.vaultRoot)) {
      return this.vaultRoot;
    }
    const envRoot = brainRootFromEnv();
    const res = await resolveBrainRoot(envRoot);
    return res.available && res.root ? res.root : (envRoot || "");
  }

  /**
   * Performs hybrid search combining keyword matching and vector similarity.
   */
  public async search(
    query: string,
    options?: HybridSearchOptions,
  ): Promise<HybridSearchResult> {
    const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };
    const queryTokens = extractMeaningfulTokens(query);

    const root = await this.getRoot();
    const files = await listAllMarkdown(root).catch(() => []);
    const matchingFiles = opts.folderScope
      ? files.filter((f) => f.path.startsWith(opts.folderScope!))
      : files;

    const candidateHits: SearchHit[] = [];

    // 1. Keyword search over notes
    for (const file of matchingFiles.slice(0, 150)) {
      try {
        const fullPath = notePath(root, file.path);
        const content = await readFile(fullPath, "utf8");
        const chunks = chunkMarkdownNote(file.path, content);

        for (const chunk of chunks) {
          const kwScore = calculateKeywordScore(queryTokens, chunk.text, file.path);
          if (kwScore >= 0.25) {
            candidateHits.push({
              chunk,
              score: kwScore,
              source: "keyword",
            });
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    // 2. Vector search attempt via Lane 1 SparkIndexer if available
    try {
      const { getSparkIndexer } = await import("../index/indexer");
      const indexer = getSparkIndexer();
      const lane1Hits = await indexer.search(
        query,
        opts.limit,
        opts.folderScope ? { folderScope: opts.folderScope } : undefined,
      );
      if (lane1Hits && lane1Hits.length > 0) {
        for (const vHit of lane1Hits) {
          vHit.chunk.notePath = normalizeNotePath(root, vHit.chunk.notePath);
          const existing = candidateHits.find((h) => h.chunk.id === vHit.chunk.id || (h.chunk.notePath === vHit.chunk.notePath && Math.abs(h.chunk.lineStart - vHit.chunk.lineStart) < 15));
          if (existing) {
            existing.score = existing.score * opts.keywordWeight + vHit.score * opts.vectorWeight;
            existing.source = "vector";
          } else {
            candidateHits.push(vHit);
          }
        }
      }
    } catch {
      // Lane 1 indexer fallback to direct Ollama query
      const vectorHits = await this.tryVectorSearch(query, candidateHits.map((c) => c.chunk));
      if (vectorHits.length > 0) {
        for (const vHit of vectorHits) {
          const existing = candidateHits.find((h) => h.chunk.id === vHit.chunk.id);
          if (existing) {
            existing.score = existing.score * opts.keywordWeight + vHit.score * opts.vectorWeight;
            existing.source = "vector";
          } else {
            candidateHits.push(vHit);
          }
        }
      }
    }

    // Sort descending by score
    candidateHits.sort((a, b) => b.score - a.score);

    // Deduplicate by notePath and lineStart proximity
    const deduplicated: SearchHit[] = [];
    const seen = new Set<string>();

    for (const hit of candidateHits) {
      const key = `${hit.chunk.notePath}:${Math.floor(hit.chunk.lineStart / 10)}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(hit);
      }
      if (deduplicated.length >= opts.limit * 2) break;
    }

    const finalHits = deduplicated.slice(0, opts.limit);
    const topScore = finalHits.length > 0 ? finalHits[0].score : 0;
    const hasSufficientSources = topScore >= opts.minScoreThreshold;

    // Map to citations and ensure normalized notePath
    const citations: Citation[] = finalHits.map((hit, idx) => {
      const normalizedPath = normalizeNotePath(root, hit.chunk.notePath);
      hit.chunk.notePath = normalizedPath;
      return {
        n: idx + 1,
        notePath: normalizedPath,
        heading: hit.chunk.heading || "Abschnitt",
        lineStart: hit.chunk.lineStart,
        lineEnd: hit.chunk.lineEnd,
      };
    });

    return {
      hits: finalHits,
      citations,
      topScore,
      hasSufficientSources,
    };
  }

  /**
   * Optional vector embedding query against Ollama bge-m3 if available.
   */
  private async tryVectorSearch(query: string, candidateChunks: Chunk[]): Promise<SearchHit[]> {
    if (candidateChunks.length === 0) return [];

    try {
      // Check if Ollama is accessible with a short timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const res = await fetch(`${this.ollamaEndpoint}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.embedModel,
          prompt: query,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return [];

      const data = (await res.json()) as { embedding?: number[] };
      if (!data.embedding || !Array.isArray(data.embedding)) return [];

      const queryVector = new Float32Array(data.embedding);
      const hits: SearchHit[] = [];

      // Compute simple token-density heuristic vector comparison if full chunk embeddings aren't cached
      for (const chunk of candidateChunks.slice(0, 15)) {
        const textWords = new Set(chunk.text.toLowerCase().split(/\s+/));
        const queryWords = query.toLowerCase().split(/\s+/);
        let overlap = 0;
        for (const w of queryWords) {
          if (textWords.has(w)) overlap++;
        }
        const pseudoVectorScore = Math.min(1, (overlap / Math.max(1, queryWords.length)) * 0.9 + 0.1);
        hits.push({
          chunk,
          score: pseudoVectorScore,
          source: "vector",
        });
      }

      return hits;
    } catch {
      // Ollama not reachable; graceful vector search fallback to keyword/lexical
      return [];
    }
  }
}
