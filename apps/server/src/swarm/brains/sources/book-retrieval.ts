import type { BookChunk, ChunkSearchResult } from "../types";
import { loadBookChunks } from "./book-ingest";

/**
 * Checks if running in serverless / public cloud environment (Vercel).
 * When active, private knowledge sources are strictly disabled.
 */
export function isPrivateSourceDisabled(): boolean {
  return (
    process.env.CONNECT_SERVERLESS === "1" ||
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "production_serverless"
  );
}

/**
 * Searches the private 100M Money Models knowledge chunks using term frequency
 * and exact-phrase boosting.
 */
export function search100MChunks(
  query: string,
  k = 5,
  sectionFilter?: string
): ChunkSearchResult[] {
  if (isPrivateSourceDisabled()) {
    throw new Error("Private source unavailable in serverless/public environment");
  }

  const rawChunks = loadBookChunks();
  if (!rawChunks || rawChunks.length === 0) {
    return [];
  }

  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) return [];

  const queryTerms = trimmedQuery
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const results: ChunkSearchResult[] = [];

  for (const chunk of rawChunks) {
    if (sectionFilter && !chunk.section.toLowerCase().includes(sectionFilter.toLowerCase())) {
      continue;
    }

    const chunkLower = chunk.text.toLowerCase();
    const chapterLower = chunk.chapter.toLowerCase();
    const sectionLower = chunk.section.toLowerCase();

    let score = 0;
    const matchedTerms: string[] = [];

    // Exact phrase match bonus
    if (chunkLower.includes(trimmedQuery)) {
      score += 100;
      matchedTerms.push(trimmedQuery);
    }

    // Title / Chapter exact match bonus
    if (chapterLower.includes(trimmedQuery)) {
      score += 80;
    }

    // Individual term frequency scoring
    for (const term of queryTerms) {
      if (chunkLower.includes(term)) {
        score += 10;
        matchedTerms.push(term);
      }
      if (chapterLower.includes(term)) {
        score += 25;
      }
      if (sectionLower.includes(term)) {
        score += 15;
      }
    }

    if (score > 0) {
      results.push({
        chunk,
        score,
        matchedTerms: Array.from(new Set(matchedTerms)),
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, k);
}
