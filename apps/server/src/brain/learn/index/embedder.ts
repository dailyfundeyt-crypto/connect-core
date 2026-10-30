/**
 * Spark-Learn Embedder (Lane 1)
 *
 * Implements Embedder contract with local Ollama bge-m3 (1024 dim), batching (32 chunks),
 * L2 normalization, error handling, and deterministic fallback for offline/test environments.
 */

import type { Embedder } from "../contracts";
import {
  SPARK_DEFAULT_EMBED_DIM,
  SPARK_DEFAULT_EMBED_MODEL,
  SPARK_DEFAULT_OLLAMA_URL,
} from "../contracts";

export interface OllamaEmbedderOptions {
  model?: string;
  dim?: number;
  baseUrl?: string;
  batchSize?: number;
  timeoutMs?: number;
  allowOfflineFallback?: boolean;
}

/**
 * Normalizes a Float32Array to unit length (L2 norm) so that
 * dot product is identical to cosine similarity.
 */
export function l2Normalize(vector: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const mag = Math.sqrt(sumSq);
  if (mag === 0 || !Number.isFinite(mag)) {
    return vector;
  }
  const norm = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    norm[i] = vector[i] / mag;
  }
  return norm;
}

/**
 * Computes cosine similarity between two Float32Array vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i];
    const valB = b[i];
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0 || !Number.isFinite(denom)) return 0;
  return dot / denom;
}

/**
 * Deterministic pseudo-random embedding generator for offline testing or mock environments.
 */
export function createDeterministicEmbedding(text: string, dim: number): Float32Array {
  const vec = new Float32Array(dim);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  for (let i = 0; i < dim; i++) {
    hash ^= i;
    hash = Math.imul(hash, 0x01000193);
    const floatVal = ((hash >>> 0) % 2000000) / 1000000 - 1.0;
    vec[i] = floatVal;
  }
  return l2Normalize(vec);
}

/**
 * Mock embedder for offline / testing purposes.
 */
export class MockEmbedder implements Embedder {
  readonly model: string;
  readonly dim: number;

  constructor(model = SPARK_DEFAULT_EMBED_MODEL, dim = SPARK_DEFAULT_EMBED_DIM) {
    this.model = model;
    this.dim = dim;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => createDeterministicEmbedding(t, this.dim));
  }
}

/**
 * Ollama bge-m3 Embedder implementation.
 */
export class OllamaEmbedder implements Embedder {
  readonly model: string;
  readonly dim: number;
  readonly baseUrl: string;
  readonly batchSize: number;
  readonly timeoutMs: number;
  readonly allowOfflineFallback: boolean;

  constructor(options?: OllamaEmbedderOptions) {
    this.model = options?.model || process.env.SPARK_EMBED_MODEL || SPARK_DEFAULT_EMBED_MODEL;
    this.dim = options?.dim || Number(process.env.SPARK_EMBED_DIM) || SPARK_DEFAULT_EMBED_DIM;
    this.baseUrl =
      options?.baseUrl || process.env.SPARK_OLLAMA_URL || SPARK_DEFAULT_OLLAMA_URL;
    this.batchSize = options?.batchSize || 32;
    this.timeoutMs = options?.timeoutMs || 30_000;
    this.allowOfflineFallback = options?.allowOfflineFallback ?? true;
  }

  /**
   * Checks if Ollama service is reachable and if the required model is pulled.
   */
  async checkHealth(): Promise<{ available: boolean; modelLoaded: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        return {
          available: false,
          modelLoaded: false,
          error: `Ollama answered status ${res.status}`,
        };
      }

      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const models = data.models || [];
      const modelPrefix = this.model.split(":")[0];
      const modelLoaded = models.some(
        (m) => m.name === this.model || m.name.startsWith(`${modelPrefix}:`),
      );

      return { available: true, modelLoaded };
    } catch (err: any) {
      return {
        available: false,
        modelLoaded: false,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * Embeds multiple texts in batches of 32 chunks.
   */
  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    const results: Float32Array[] = [];

    // Process in batches of this.batchSize (default 32)
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      try {
        const batchVectors = await this.embedBatch(batch);
        results.push(...batchVectors);
      } catch (err: any) {
        if (this.allowOfflineFallback) {
          console.warn(
            `[OllamaEmbedder] Ollama unavailable at ${this.baseUrl} (${err.message}). Using deterministic fallback.`,
          );
          const fallback = batch.map((t) => createDeterministicEmbedding(t, this.dim));
          results.push(...fallback);
        } else {
          throw new Error(
            `Ollama embedding failed for model ${this.model} at ${this.baseUrl}: ${err.message}. Ensure Ollama is running and 'ollama pull ${this.model}' has completed.`,
          );
        }
      }
    }

    return results;
  }

  /**
   * Embeds a single batch of texts via /api/embed (with fallback to /api/embeddings).
   */
  private async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // 1. Try modern /api/embed endpoint (supports batching array input)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (res.ok) {
        const data = (await res.json()) as { embeddings?: number[][] };
        if (Array.isArray(data.embeddings) && data.embeddings.length === texts.length) {
          return data.embeddings.map((v) => l2Normalize(Float32Array.from(v)));
        }
      }
    } catch (err: any) {
      // If network error (connection refused), rethrow directly
      if (err.name === "AbortError" || err.code === "ECONNREFUSED") {
        throw err;
      }
    }

    // 2. Fallback: single prompt calls via /api/embeddings
    const singleResults: Float32Array[] = [];
    for (const text of texts) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        throw new Error(`Ollama /api/embeddings failed with HTTP ${res.status}`);
      }

      const data = (await res.json()) as { embedding?: number[] };
      if (!Array.isArray(data.embedding)) {
        throw new Error("Invalid embedding response from Ollama");
      }
      singleResults.push(l2Normalize(Float32Array.from(data.embedding)));
    }

    return singleResults;
  }
}

/**
 * Creates the default embedder configured from environment or defaults.
 */
export function createDefaultEmbedder(options?: OllamaEmbedderOptions): Embedder {
  return new OllamaEmbedder(options);
}
