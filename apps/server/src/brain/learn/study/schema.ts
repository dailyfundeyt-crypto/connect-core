/**
 * Drizzle Database Schema for Spark-Learn Study Mode (Lane 4)
 * Migration: 0222_spark_study
 *
 * Tables:
 * - spark_cards: Flashcards (qa, cloze, mc) with FSRS parameters and clickable source citations
 * - spark_reviews: Historical review logs with ratings (1-4), elapsed duration, and FSRS updates
 * - spark_learn_goals: Active learning targets per folder or concept (e.g. 20 cards/day)
 * - spark_summaries: Cached AI-generated summaries for notes, folders, and videos
 */

import { boolean, index, integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "../../../db/schema/json";
import type { Citation } from "../contracts";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const sparkCards = pgTable(
  "spark_cards",
  {
    id: text("id").primaryKey(),
    notePath: text("note_path").notNull(),
    chunkId: text("chunk_id"),
    cardType: text("card_type").notNull().default("qa"), // 'qa' | 'cloze' | 'mc'
    front: text("front").notNull(),
    back: text("back").notNull(),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    source: jsonb("source").$type<Citation>().notNull(),
    state: text("state").notNull().default("new"), // 'new' | 'learning' | 'review' | 'relearning'
    due: timestamp("due", { withTimezone: true }).notNull().defaultNow(),
    stability: real("stability").notNull().default(0.0),
    difficulty: real("difficulty").notNull().default(0.0),
    elapsedDays: real("elapsed_days").notNull().default(0.0),
    scheduledDays: real("scheduled_days").notNull().default(0.0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    fsrsState: integer("fsrs_state").notNull().default(0), // 0: New, 1: Learning, 2: Review, 3: Relearning
    lastReview: timestamp("last_review", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("spark_cards_note_path_idx").on(table.notePath),
    index("spark_cards_due_idx").on(table.due),
    index("spark_cards_state_idx").on(table.state),
    index("spark_cards_card_type_idx").on(table.cardType),
  ],
);

export const sparkReviews = pgTable(
  "spark_reviews",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => sparkCards.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(), // 1: Again, 2: Hard, 3: Good, 4: Easy
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    elapsedMs: integer("elapsed_ms").notNull().default(0),
    scheduledDays: real("scheduled_days").notNull().default(0.0),
    reviewState: integer("review_state").notNull().default(0),
    stability: real("stability").notNull().default(0.0),
    difficulty: real("difficulty").notNull().default(0.0),
  },
  (table) => [
    index("spark_reviews_card_idx").on(table.cardId),
    index("spark_reviews_reviewed_at_idx").on(table.reviewedAt),
  ],
);

export const sparkLearnGoals = pgTable(
  "spark_learn_goals",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    folderPath: text("folder_path"),
    conceptId: text("concept_id"),
    targetCardsPerDay: integer("target_cards_per_day").notNull().default(20),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("spark_learn_goals_folder_idx").on(table.folderPath),
    index("spark_learn_goals_active_idx").on(table.active),
  ],
);

export const sparkSummaries = pgTable(
  "spark_summaries",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(), // 'note' | 'folder' | 'video'
    targetId: text("target_id").notNull(),
    title: text("title"),
    summary: text("summary").notNull(),
    keyPoints: jsonb("key_points").$type<string[]>().notNull().default([]),
    hash: text("hash"),
    provider: text("provider"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("spark_summaries_target_idx").on(table.targetType, table.targetId),
  ],
);
