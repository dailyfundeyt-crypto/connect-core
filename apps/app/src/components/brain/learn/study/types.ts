/**
 * Client types for Spark-Learn Study Mode UI (Lane 4)
 */

export type StudyCardType = "qa" | "cloze" | "mc";
export type StudyCardState = "new" | "learning" | "review" | "relearning";
export type StudyRating = 1 | 2 | 3 | 4;

export interface Citation {
  n: number;
  notePath: string;
  heading?: string;
  lineStart: number;
  lineEnd?: number;
  url?: string;
  timestamp?: string;
}

export interface FsrsCardData {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview?: string;
}

export interface IntervalPreview {
  rating: StudyRating;
  ratingLabel: string;
  intervalDays: number;
  intervalHuman: string;
  dueDate: string;
}

export interface StudyCard {
  id: string;
  notePath: string;
  chunkId?: string;
  cardType: StudyCardType;
  front: string;
  back: string;
  options?: string[];
  source: Citation;
  state: StudyCardState;
  fsrs?: FsrsCardData;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudyQueueItem extends StudyCard {
  intervals: Record<StudyRating, IntervalPreview>;
  folder: string;
}

export interface StudyReview {
  id: string;
  cardId: string;
  rating: StudyRating;
  reviewedAt: string;
  elapsedMs?: number;
  scheduledDays: number;
}

export interface ReviewResult {
  card: StudyCard;
  review: StudyReview;
  nextReviewPreview: Record<StudyRating, IntervalPreview>;
}

export interface StudyGoal {
  id: string;
  title: string;
  folderPath?: string;
  conceptId?: string;
  targetCardsPerDay: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type SummaryTargetType = "note" | "folder" | "video" | "tag";

export interface SummaryItem {
  id: string;
  targetType: SummaryTargetType;
  targetId: string;
  title?: string;
  summary: string;
  keyPoints: string[];
  hash?: string;
  provider?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type NextUpKind =
  | "gap_retention"
  | "goal_aligned"
  | "unstudied_folder"
  | "overdue_reviews";

export interface NextUpRecommendation {
  id: string;
  title: string;
  kind: NextUpKind;
  priority: number;
  reason: string;
  folderPath?: string;
  conceptId?: string;
  notePath?: string;
  cardsCount?: number;
  averageRetention?: number;
  suggestedAction: "review" | "generate" | "summary";
}

export interface FolderStudyStat {
  folder: string;
  totalCards: number;
  dueCards: number;
  masteredCards: number;
  learningCards: number;
  averageStability: number;
  retentionRate: number;
}

export interface DailyReviewCount {
  date: string;
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
  overallRetentionRate: number;
  averageStabilityDays: number;
  folders: FolderStudyStat[];
  history: DailyReviewCount[];
}
