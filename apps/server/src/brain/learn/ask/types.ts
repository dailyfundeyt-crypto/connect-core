import { z } from "zod";
import {
  CitationSchema,
  ChunkSchema,
  SearchHitSchema,
  SparkAskParamsSchema,
  type Citation,
  type Chunk,
  type SearchHit,
  type SparkAskParams,
  type Privacy,
  type FailureClass,
} from "../contracts";

/* ========================================================================== */
/* Ask Query & Result Types                                                   */
/* ========================================================================== */

export const AskRequestSchema = SparkAskParamsSchema.extend({
  folderScope: z.string().optional(),
  stream: z.boolean().optional().default(false),
  privacy: z.enum(["private", "shareable"]).optional().default("private"),
  temperature: z.number().min(0).max(1).optional(),
});
export type AskRequest = z.input<typeof AskRequestSchema>;

export const AskAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema),
  confidence: z.number().min(0).max(1),
  insufficientData: z.boolean().default(false),
  sourcesUsed: z.array(z.number().int().positive()).default([]),
  suggestedFollowUps: z.array(z.string()).default([]),
});
export type AskAnswer = z.infer<typeof AskAnswerSchema>;

export const AskResponseSchema = z.object({
  query: z.string(),
  answer: z.string(),
  citations: z.array(CitationSchema),
  confidence: z.number().min(0).max(1),
  insufficientData: z.boolean(),
  sourcesUsed: z.array(z.number().int().positive()),
  suggestedFollowUps: z.array(z.string()),
  provider: z.string(),
  model: z.string().optional(),
  durationMs: z.number().nonnegative(),
  retries: z.number().int().nonnegative().default(0),
  searchHitsCount: z.number().int().nonnegative().default(0),
  timestamp: z.string(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

/* ========================================================================== */
/* Streaming Event Types                                                      */
/* ========================================================================== */

export type AskStreamEvent =
  | { type: "search"; count: number; sources: string[] }
  | { type: "token"; text: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "done"; response: AskResponse }
  | { type: "error"; message: string; failureClass?: FailureClass };

/* ========================================================================== */
/* Chat History & Note Proposal                                               */
/* ========================================================================== */

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  citations: z.array(CitationSchema).optional(),
  timestamp: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SaveChatProposalRequestSchema = z.object({
  title: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  citations: z.array(CitationSchema).default([]),
  targetFolder: z.string().default("_spark/chats"),
  tags: z.array(z.string()).default(["spark/chat", "spark/q-and-a"]),
});
export type SaveChatProposalRequest = z.infer<typeof SaveChatProposalRequestSchema>;

export interface SaveChatProposalResult {
  proposalId: string;
  proposedPath: string;
  markdownContent: string;
  status: "pending" | "created";
  message: string;
}

/* ========================================================================== */
/* Search Configuration & Thresholds                                         */
/* ========================================================================== */

export interface HybridSearchOptions {
  limit?: number;
  folderScope?: string;
  minScoreThreshold?: number;
  keywordWeight?: number;
  vectorWeight?: number;
}

export const DEFAULT_SEARCH_OPTIONS: Required<HybridSearchOptions> = {
  limit: 5,
  folderScope: "",
  minScoreThreshold: 0.28,
  keywordWeight: 0.45,
  vectorWeight: 0.55,
};

export const INSUFFICIENT_DATA_MESSAGE =
  "Ich weiß es nicht anhand der verfügbaren Notizen. In deinem Spark-Vault wurden keine passenden Quellen mit ausreichender Sicherheit gefunden.";
