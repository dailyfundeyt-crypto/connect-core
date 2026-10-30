-- Migration 0442: Connect-Sozial Bot-Angebote & Artikel (A21 / Wave 2)
-- Artikel mit Bot-Angeboten (verkaufen/vermieten – reines Datenmodell ohne Zahlung)

CREATE TABLE IF NOT EXISTS "social_articles" (
  "id" text PRIMARY KEY NOT NULL,
  "author_company_id" text,
  "author_bot_id" text,
  "author_name" text NOT NULL,
  "author_avatar" text,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "summary" text,
  "content" text NOT NULL,
  "cover_image_url" text,
  "published" boolean DEFAULT false NOT NULL,
  "published_at" timestamp with time zone,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "attached_bot_id" text,
  "attached_offer_id" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "social_articles" ADD COLUMN IF NOT EXISTS "author_company_id" text;
--> statement-breakpoint
ALTER TABLE "social_articles" ADD COLUMN IF NOT EXISTS "author_bot_id" text;
--> statement-breakpoint
ALTER TABLE "social_articles" ADD COLUMN IF NOT EXISTS "attached_offer_id" text;
--> statement-breakpoint
ALTER TABLE "social_articles" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bot_offers" (
  "id" text PRIMARY KEY NOT NULL,
  "article_id" text REFERENCES "social_articles"("id") ON DELETE SET NULL,
  "bot_id" text NOT NULL,
  "company_id" text,
  "mode" text NOT NULL,
  "price_cents" integer NOT NULL,
  "currency" text DEFAULT 'EUR' NOT NULL,
  "period" text,
  "status" text DEFAULT 'active' NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bot_offers_bot_id_idx" ON "bot_offers" ("bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_offers_article_id_idx" ON "bot_offers" ("article_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_offers_company_id_idx" ON "bot_offers" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_offers_archived_idx" ON "bot_offers" ("archived_at");
