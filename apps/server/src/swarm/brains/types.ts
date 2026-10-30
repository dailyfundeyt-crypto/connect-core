import { z } from "zod";
import {
  SeatBrainSchema,
  type SeatBrain,
  KnowledgeSourceRefSchema,
  type KnowledgeSourceRef,
  PrivacySchema,
  type Privacy,
  resolvePrivacy,
} from "../../contracts/swarm-v3/types";

export {
  SeatBrainSchema,
  type SeatBrain,
  KnowledgeSourceRefSchema,
  type KnowledgeSourceRef,
  PrivacySchema,
  type Privacy,
  resolvePrivacy,
};

/* ========================================================================== */
/* Book Chunk & Ingest Types                                                  */
/* ========================================================================== */

export interface BookChunk {
  chunkId: string;
  sourceId: "100m-money-models";
  section: string;
  chapter: string;
  lineStart: number;
  lineEnd: number;
  text: string;
  sha256: string;
  citation: string;
}

export interface IngestStats {
  totalLines: number;
  totalChunks: number;
  sectionsCount: number;
  outputPathJsonl: string;
  indexPath: string;
  durationMs: number;
}

export interface ChunkSearchQuery {
  q: string;
  k?: number;
  section?: string;
  chapter?: string;
}

export interface ChunkSearchResult {
  chunk: BookChunk;
  score: number;
  matchedTerms: string[];
}

/* ========================================================================== */
/* Quote Verification Types (Roast-Room Concept)                              */
/* ========================================================================== */

export interface QuoteVerificationItem {
  quote: string;
  citationRef?: string;
  isVerbatim: boolean;
  matchedChunkId?: string;
  lineRange?: string;
  similarity: number;
  status: "verified" | "unverified" | "hallucinated";
}

export interface QuoteVerificationResult {
  valid: boolean;
  totalQuotes: number;
  verifiedCount: number;
  unverifiedCount: number;
  items: QuoteVerificationItem[];
  missingCitations: string[];
}

/* ========================================================================== */
/* Security, Rate-Limit & Audit Types                                         */
/* ========================================================================== */

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType: "mcp_grant" | "llm_budget" | "privacy_check" | "untrusted_input" | "quote_fail";
  details: Record<string, unknown>;
}

export interface BudgetConfig {
  maxTokensPerSession: number;
  maxCostPerSessionCents: number;
  rateLimitPerMinute: number;
}
