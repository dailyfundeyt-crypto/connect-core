/**
 * Spark-Learn Contracts & Interfaces (Phase 0: 0-ZUERST)
 *
 * Defines shared contracts for all Spark-Learn lanes (Lanes 1 to 7):
 * - Route prefix: /api/brain/learn/*
 * - UI directory: components/brain/learn/
 * - Local embeddings: Ollama bge-m3 (1024 dim) + pgvector/bytea fallback
 * - LLM generation: shared CliRunner (Gemini CLI -> Codex CLI -> Claude Code -> optional Ollama qwen2.5:7b)
 * - Quota & error classification via Conductor FailureClass
 * - Strictly paidApiFallback: false
 * - Reserved migrations: 0220_spark_chunks .. 0224_spark_proposals (0225-0229 reserve)
 */

import { z } from "zod";

/* ========================================================================== */
/* Core Constants & Paths                                                     */
/* ========================================================================== */

export const SPARK_LEARN_ROUTE_PREFIX = "/api/brain/learn" as const;
export const SPARK_LEARN_UI_DIR = "components/brain/learn" as const;

export const SPARK_DEFAULT_EMBED_MODEL = "bge-m3" as const;
export const SPARK_DEFAULT_EMBED_DIM = 1024 as const;
export const SPARK_DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434" as const;

export const SPARK_MIGRATION_RESERVATIONS = {
  chunks: "0220_spark_chunks",
  concepts: "0221_spark_concepts",
  study: "0222_spark_study",
  youtube: "0223_spark_youtube",
  proposals: "0224_spark_proposals",
  reserve: ["0225", "0226", "0227", "0228", "0229"] as const,
} as const;

/* ========================================================================== */
/* Lane 1: Chunking, Indexing & Local Embeddings                             */
/* ========================================================================== */

export const ChunkSchema = z.object({
  id: z.string(),
  notePath: z.string(),
  heading: z.string().default(""),
  chunkIdx: z.number().int().nonnegative(),
  text: z.string(),
  hash: z.string(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export interface Embedder {
  model: string;
  dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export const SearchSourceSchema = z.enum(["vector", "keyword"]);
export type SearchSource = z.infer<typeof SearchSourceSchema>;

export const SearchHitSchema = z.object({
  chunk: ChunkSchema,
  score: z.number(),
  source: SearchSourceSchema,
});
export type SearchHit = z.infer<typeof SearchHitSchema>;

export const CitationSchema = z.object({
  n: z.number().int().positive(),
  notePath: z.string(),
  heading: z.string().default(""),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive().optional(),
  url: z.string().optional(),
  timestamp: z.string().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const SparkIndexStateSchema = z.object({
  model: z.string(),
  dim: z.number().int().positive(),
  totalChunks: z.number().int().nonnegative(),
  totalNotes: z.number().int().nonnegative(),
  lastIndexedAt: z.string().optional(),
  isIndexing: z.boolean().default(false),
  hasPgvector: z.boolean().default(false),
});
export type SparkIndexState = z.infer<typeof SparkIndexStateSchema>;

/* ========================================================================== */
/* Lane 2 & Shared: LLM Client & Provider-Agnostic CliRunner Contract         */
/* ========================================================================== */

/**
 * Conductor failure classes for error classification and failover routing.
 */
export const FAILURE_CLASSES = [
  "quota",
  "auth",
  "network",
  "task",
  "unknown",
] as const;
export const FailureClassSchema = z.enum(FAILURE_CLASSES);
export type FailureClass = z.infer<typeof FailureClassSchema>;

export const PRIVACY_LEVELS = ["private", "shareable"] as const;
export const PrivacySchema = z.enum(PRIVACY_LEVELS);
export type Privacy = z.infer<typeof PrivacySchema>;

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LlmCompleteOptions {
  json?: boolean;
  schema?: z.ZodType<unknown> | Record<string, unknown>;
  timeoutMs?: number;
  privacy?: Privacy;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LlmCompleteResult {
  text: string;
  json?: unknown;
  provider: string;
  model?: string;
  usage?: LlmUsage;
  failureClass?: FailureClass;
  durationMs?: number;
}

/**
 * LlmClient interface implemented exclusively by the shared CliRunner
 * (swarm-v3 Lane 8 Gemini CLI adapter expanded to provider chain:
 * Gemini CLI -> Codex CLI -> Claude Code -> optional Ollama qwen2.5:7b).
 */
export interface LlmClient {
  complete(prompt: string, options?: LlmCompleteOptions): Promise<LlmCompleteResult>;
}

/**
 * CLI Runner Provider interface for pluggable CLI command runners.
 */
export interface LlmProviderAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  execute(prompt: string, options?: LlmCompleteOptions): Promise<LlmCompleteResult>;
}

/* ========================================================================== */
/* Lane 3: Concept Graph, Clusters & Guided Tours                             */
/* ========================================================================== */

export const SparkConceptSchema = z.object({
  id: z.string(),
  name: z.string(),
  clusterId: z.string().optional(),
  summary: z.string().optional(),
  sourceNotePaths: z.array(z.string()).default([]),
  tags: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SparkConcept = z.infer<typeof SparkConceptSchema>;

export const SparkConceptEdgeSchema = z.object({
  id: z.string(),
  sourceConceptId: z.string(),
  targetConceptId: z.string(),
  relationType: z.string().default("relates_to"),
  weight: z.number().default(1.0),
  evidenceChunkId: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string().optional(),
});
export type SparkConceptEdge = z.infer<typeof SparkConceptEdgeSchema>;

export const GuidedTourStepSchema = z.object({
  stepIdx: z.number().int().nonnegative(),
  conceptId: z.string().optional(),
  notePath: z.string(),
  heading: z.string().optional(),
  description: z.string(),
});
export type GuidedTourStep = z.infer<typeof GuidedTourStepSchema>;

export const GuidedTourSchema = z.object({
  id: z.string(),
  title: z.string(),
  clusterId: z.string().optional(),
  description: z.string().optional(),
  steps: z.array(GuidedTourStepSchema).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type GuidedTour = z.infer<typeof GuidedTourSchema>;

/* ========================================================================== */
/* Lane 4: Study Mode (Quiz, Spaced Repetition FSRS, Summaries, Next-Up)      */
/* ========================================================================== */

export const StudyCardTypeSchema = z.enum(["qa", "cloze", "mc"]);
export type StudyCardType = z.infer<typeof StudyCardTypeSchema>;

export const StudyCardStateSchema = z.enum(["new", "learning", "review", "relearning"]);
export type StudyCardState = z.infer<typeof StudyCardStateSchema>;

export const FsrsCardDataSchema = z.object({
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number(),
  scheduledDays: z.number(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.number().int().nonnegative(),
  lastReview: z.string().optional(),
});
export type FsrsCardData = z.infer<typeof FsrsCardDataSchema>;

export const StudyCardSchema = z.object({
  id: z.string(),
  notePath: z.string(),
  chunkId: z.string().optional(),
  cardType: StudyCardTypeSchema.default("qa"),
  front: z.string(),
  back: z.string(),
  options: z.array(z.string()).optional(),
  source: CitationSchema,
  state: StudyCardStateSchema.default("new"),
  fsrs: FsrsCardDataSchema.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type StudyCard = z.infer<typeof StudyCardSchema>;

export const StudyRatingSchema = z.union([
  z.literal(1), // Again
  z.literal(2), // Hard
  z.literal(3), // Good
  z.literal(4), // Easy
]);
export type StudyRating = z.infer<typeof StudyRatingSchema>;

export const StudyReviewSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  rating: StudyRatingSchema,
  reviewedAt: z.string(),
  elapsedMs: z.number().int().nonnegative().optional(),
  scheduledDays: z.number().nonnegative(),
});
export type StudyReview = z.infer<typeof StudyReviewSchema>;

export const StudyGoalSchema = z.object({
  id: z.string(),
  title: z.string(),
  folderPath: z.string().optional(),
  conceptId: z.string().optional(),
  targetCardsPerDay: z.number().int().positive().default(20),
  active: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type StudyGoal = z.infer<typeof StudyGoalSchema>;

/* ========================================================================== */
/* Lane 5: YouTube Import & Transcripts                                      */
/* ========================================================================== */

export const YtTranscriptStatusSchema = z.enum([
  "missing",
  "fetching",
  "available",
  "failed",
]);
export type YtTranscriptStatus = z.infer<typeof YtTranscriptStatusSchema>;

export const YtVideoSchema = z.object({
  videoId: z.string(),
  channelId: z.string().optional(),
  channelTitle: z.string().optional(),
  folder: z.string(),
  title: z.string(),
  url: z.string(),
  publishedAt: z.string().optional(),
  transcriptStatus: YtTranscriptStatusSchema.default("missing"),
  transcriptText: z.string().optional(),
  notePath: z.string().optional(),
  watched: z.boolean().default(false),
  durationSeconds: z.number().int().nonnegative().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type YtVideo = z.infer<typeof YtVideoSchema>;

export interface TranscriberSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriberResult {
  text: string;
  segments?: TranscriberSegment[];
  language?: string;
}

/**
 * Transcriber contract (shared with swarm-v3 Lane 4).
 */
export interface Transcriber {
  transcribe(source: {
    url?: string;
    filePath?: string;
    language?: string;
  }): Promise<TranscriberResult>;
}

/* ========================================================================== */
/* Lane 6: Self-Improvement / Proposal Queue & Approval                       */
/* ========================================================================== */

export const ProposalKindSchema = z.enum([
  "new_note",
  "add_link",
  "move",
  "merge",
  "tag",
  "summary",
]);
export type ProposalKind = z.infer<typeof ProposalKindSchema>;

export const ProposalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "applied",
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const ProposalSchema = z.object({
  id: z.string(),
  kind: ProposalKindSchema,
  payload: z.record(z.string(), z.unknown()),
  diff: z.string().optional(),
  rationale: z.string(),
  sources: z.array(z.string()).default([]),
  status: ProposalStatusSchema.default("pending"),
  decidedAt: z.string().optional(),
  appliedAt: z.string().optional(),
  createdAt: z.string().optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

/* ========================================================================== */
/* Lane 7: MCP Tools Signatures                                              */
/* ========================================================================== */

export const SparkAskParamsSchema = z.object({
  query: z.string().min(1),
  maxCitations: z.number().int().positive().default(5),
});
export type SparkAskParams = z.infer<typeof SparkAskParamsSchema>;

export const SparkSemanticSearchParamsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().default(10),
  folderScope: z.string().optional(),
});
export type SparkSemanticSearchParams = z.infer<typeof SparkSemanticSearchParamsSchema>;

export const SparkRelatedParamsSchema = z.object({
  notePath: z.string().min(1),
  limit: z.number().int().positive().default(5),
});
export type SparkRelatedParams = z.infer<typeof SparkRelatedParamsSchema>;

export const SparkQuizNextParamsSchema = z.object({
  folderScope: z.string().optional(),
  limit: z.number().int().positive().default(10),
});
export type SparkQuizNextParams = z.infer<typeof SparkQuizNextParamsSchema>;

export const SparkProposeParamsSchema = z.object({
  kind: ProposalKindSchema,
  payload: z.record(z.string(), z.unknown()),
  diff: z.string().optional(),
  rationale: z.string(),
  sources: z.array(z.string()).default([]),
});
export type SparkProposeParams = z.infer<typeof SparkProposeParamsSchema>;

export const SparkYoutubeImportParamsSchema = z.object({
  folderId: z.string().optional(),
  maxVideos: z.number().int().positive().default(5),
});
export type SparkYoutubeImportParams = z.infer<typeof SparkYoutubeImportParamsSchema>;
