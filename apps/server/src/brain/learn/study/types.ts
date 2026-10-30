/**
 * Type definitions for Spark-Learn Study Mode (Lane 4)
 *
 * Implements:
 * - Flashcards (QA, Cloze, Multiple Choice) with clickable citations
 * - FSRS-4.5 Spaced Repetition engine and daily review queue
 * - AI summaries cache for notes, folders, and videos
 * - "Was als Nächstes lernen" knowledge-gap and goal-based recommendations
 */

import { z } from "zod";
import {
  CitationSchema,
  StudyCardSchema,
  StudyCardStateSchema,
  StudyCardTypeSchema,
  StudyGoalSchema,
  StudyRatingSchema,
  StudyReviewSchema,
  FsrsCardDataSchema,
  type Citation,
  type StudyCard,
  type StudyCardState,
  type StudyCardType,
  type StudyGoal,
  type StudyRating,
  type StudyReview,
  type FsrsCardData,
} from "../contracts";

export {
  CitationSchema,
  StudyCardSchema,
  StudyCardStateSchema,
  StudyCardTypeSchema,
  StudyGoalSchema,
  StudyRatingSchema,
  StudyReviewSchema,
  FsrsCardDataSchema,
};
export type {
  Citation,
  StudyCard,
  StudyCardState,
  StudyCardType,
  StudyGoal,
  StudyRating,
  StudyReview,
  FsrsCardData,
};

/* ========================================================================== */
/* Review Session & Queue Types                                              */
/* ========================================================================== */

export interface IntervalPreview {
  rating: StudyRating;
  ratingLabel: string; // "Nochmal", "Schwer", "Gut", "Einfach"
  intervalDays: number;
  intervalHuman: string; // e.g. "1 Min", "1 Tag", "4 Tage", "12 Tage"
  dueDate: string;
}

export interface StudyQueueItem extends StudyCard {
  intervals: Record<StudyRating, IntervalPreview>;
  folder: string;
}

export const ReviewSubmissionSchema = z.object({
  cardId: z.string().min(1),
  rating: StudyRatingSchema,
  elapsedMs: z.number().int().nonnegative().optional().default(0),
});
export type ReviewSubmission = z.infer<typeof ReviewSubmissionSchema>;

export interface ReviewResult {
  card: StudyCard;
  review: StudyReview;
  nextReviewPreview: Record<StudyRating, IntervalPreview>;
}

/* ========================================================================== */
/* Card Generation Types                                                     */
/* ========================================================================== */

export const GenerateCardsRequestSchema = z.object({
  notePath: z.string().optional(),
  chunkId: z.string().optional(),
  folderPath: z.string().optional(),
  text: z.string().optional(),
  heading: z.string().optional(),
  types: z.array(StudyCardTypeSchema).default(["qa", "cloze", "mc"]),
  count: z.number().int().min(1).max(20).default(3),
});
export type GenerateCardsRequest = z.infer<typeof GenerateCardsRequestSchema>;

export interface GeneratedCardDraft {
  front: string;
  back: string;
  cardType: StudyCardType;
  options?: string[];
  source: Citation;
}

/* ========================================================================== */
/* Summary Types                                                             */
/* ========================================================================== */

export const SummaryTargetTypeSchema = z.enum(["note", "folder", "video"]);
export type SummaryTargetType = z.infer<typeof SummaryTargetTypeSchema>;

export const SummaryItemSchema = z.object({
  id: z.string(),
  targetType: SummaryTargetTypeSchema,
  targetId: z.string(),
  title: z.string().optional(),
  summary: z.string(),
  keyPoints: z.array(z.string()).default([]),
  hash: z.string().optional(),
  provider: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SummaryItem = z.infer<typeof SummaryItemSchema>;

export const GenerateSummaryRequestSchema = z.object({
  targetType: SummaryTargetTypeSchema,
  targetId: z.string(),
  forceRefresh: z.boolean().optional().default(false),
  createProposal: z.boolean().optional().default(false), // Optional: propose summary to vault
});
export type GenerateSummaryRequest = z.infer<typeof GenerateSummaryRequestSchema>;

/* ========================================================================== */
/* Next-Up / Knowledge Gaps Types                                             */
/* ========================================================================== */

export type NextUpKind =
  | "gap_retention"
  | "goal_aligned"
  | "unstudied_folder"
  | "overdue_reviews";

export interface NextUpRecommendation {
  id: string;
  title: string;
  kind: NextUpKind;
  priority: number; // 1-100 (100 = highest priority)
  reason: string;
  folderPath?: string;
  conceptId?: string;
  notePath?: string;
  cardsCount?: number;
  averageRetention?: number;
  suggestedAction: "review" | "generate" | "summary";
}

/* ========================================================================== */
/* Statistics & Analytics Types                                              */
/* ========================================================================== */

export interface FolderStudyStat {
  folder: string;
  totalCards: number;
  dueCards: number;
  masteredCards: number; // Stability >= 21 days
  learningCards: number;
  averageStability: number;
  retentionRate: number; // 0.0 - 1.0
}

export interface DailyReviewCount {
  date: string; // YYYY-MM-DD
  count: number;
  goodOrEasy: number;
  againOrHard: number;
}

export interface StudyStats {
  totalCards: number;
  dueToday: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
  relearningCards: number;
  masteredCards: number;
  overallRetentionRate: number; // 0 - 100%
  averageStabilityDays: number;
  folders: FolderStudyStat[];
  history: DailyReviewCount[];
}
