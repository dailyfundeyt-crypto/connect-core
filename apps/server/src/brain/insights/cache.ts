import { analyzeBrainStructure } from "./analyzer";
import type { ExtendedBrainStructure } from "./types";

interface CacheEntry {
  data: ExtendedBrainStructure;
  timestamp: number;
  root: string;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutes

export async function getCachedBrainStructure(
  root: string,
  companyId = "cnt-kunc",
  forceRefresh = false,
): Promise<{ structure: ExtendedBrainStructure; fromCache: boolean; durationMs: number }> {
  const start = Date.now();
  const cacheKey = `${root}::${companyId}`;
  const existing = memoryCache.get(cacheKey);

  if (!forceRefresh && existing && Date.now() - existing.timestamp < CACHE_TTL_MS) {
    return {
      structure: existing.data,
      fromCache: true,
      durationMs: Date.now() - start,
    };
  }

  const structure = await analyzeBrainStructure(root, companyId);
  memoryCache.set(cacheKey, {
    data: structure,
    timestamp: Date.now(),
    root,
  });

  return {
    structure,
    fromCache: false,
    durationMs: Date.now() - start,
  };
}

export function invalidateBrainCache(root?: string): void {
  if (root) {
    for (const key of memoryCache.keys()) {
      if (key.startsWith(root)) {
        memoryCache.delete(key);
      }
    }
  } else {
    memoryCache.clear();
  }
}
