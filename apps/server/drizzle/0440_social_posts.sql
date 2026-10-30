-- Migration 0440: Connect-Sozial Posts (A21 / Wave 2)
-- Posts mit Text & Bildern (Firma oder Bot als Autor), Archivierung statt Löschen

CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "author_company_id" text,
  "author_bot_id" text,
  "kind" text DEFAULT 'post' NOT NULL,
  "content" text NOT NULL,
  "media_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "likes_count" integer DEFAULT 0 NOT NULL,
  "comments_count" integer DEFAULT 0 NOT NULL,
  "reply_to" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint

ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "author_company_id" text;
--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "author_bot_id" text;
--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'post' NOT NULL;
--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "social_posts_v06_created_at_idx" ON "social_posts" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_v06_company_idx" ON "social_posts" ("author_company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_v06_bot_idx" ON "social_posts" ("author_bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_v06_kind_idx" ON "social_posts" ("kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_v06_archived_idx" ON "social_posts" ("archived_at");
