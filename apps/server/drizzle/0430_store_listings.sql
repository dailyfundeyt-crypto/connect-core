-- Migration 0430: Store Listings (A20 / Wave 2)
-- Speichert veröffentlichbare Pakete (MCP, Tool, Skill, Company)

CREATE TABLE IF NOT EXISTS "store_listings" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "version" text NOT NULL,
  "author_id" text NOT NULL,
  "icon_url" text DEFAULT '' NOT NULL,
  "screenshots" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "install_spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "price_cents" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'review' NOT NULL,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "package_path" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "store_listings_slug_idx" ON "store_listings" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_listings_kind_idx" ON "store_listings" ("kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_listings_status_idx" ON "store_listings" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_listings_author_id_idx" ON "store_listings" ("author_id");
