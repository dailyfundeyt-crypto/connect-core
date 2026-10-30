-- Migration 0222: Spark-Learn Lernmodus (Quiz, FSRS Spaced Repetition, Ziele, Summaries-Cache) (Lane 4)
-- Erstellt spark_cards, spark_reviews (FSRS-Felder), spark_learn_goals und spark_summaries.

CREATE TABLE IF NOT EXISTS "spark_cards" (
  "id" text PRIMARY KEY NOT NULL,
  "note_path" text NOT NULL,
  "chunk_id" text,
  "card_type" text DEFAULT 'qa' NOT NULL CHECK ("card_type" IN ('qa', 'cloze', 'mc')),
  "front" text NOT NULL,
  "back" text NOT NULL,
  "options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "source" jsonb NOT NULL,
  "state" text DEFAULT 'new' NOT NULL CHECK ("state" IN ('new', 'learning', 'review', 'relearning')),
  "due" timestamp with time zone DEFAULT now() NOT NULL,
  "stability" real DEFAULT 0.0 NOT NULL,
  "difficulty" real DEFAULT 0.0 NOT NULL,
  "elapsed_days" real DEFAULT 0.0 NOT NULL,
  "scheduled_days" real DEFAULT 0.0 NOT NULL,
  "reps" integer DEFAULT 0 NOT NULL,
  "lapses" integer DEFAULT 0 NOT NULL,
  "fsrs_state" integer DEFAULT 0 NOT NULL,
  "last_review" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_cards_note_path_idx" ON "spark_cards" ("note_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_cards_due_idx" ON "spark_cards" ("due");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_cards_state_idx" ON "spark_cards" ("state");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_cards_card_type_idx" ON "spark_cards" ("card_type");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "spark_reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "card_id" text NOT NULL REFERENCES "spark_cards"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL CHECK ("rating" IN (1, 2, 3, 4)),
  "reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "elapsed_ms" integer DEFAULT 0 NOT NULL,
  "scheduled_days" real DEFAULT 0.0 NOT NULL,
  "review_state" integer DEFAULT 0 NOT NULL,
  "stability" real DEFAULT 0.0 NOT NULL,
  "difficulty" real DEFAULT 0.0 NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_reviews_card_idx" ON "spark_reviews" ("card_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_reviews_reviewed_at_idx" ON "spark_reviews" ("reviewed_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "spark_learn_goals" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "folder_path" text,
  "concept_id" text,
  "target_cards_per_day" integer DEFAULT 20 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_learn_goals_folder_idx" ON "spark_learn_goals" ("folder_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spark_learn_goals_active_idx" ON "spark_learn_goals" ("active");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "spark_summaries" (
  "id" text PRIMARY KEY NOT NULL,
  "target_type" text NOT NULL CHECK ("target_type" IN ('note', 'folder', 'video')),
  "target_id" text NOT NULL,
  "title" text,
  "summary" text NOT NULL,
  "key_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "hash" text,
  "provider" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "spark_summaries_target_idx" ON "spark_summaries" ("target_type", "target_id");
