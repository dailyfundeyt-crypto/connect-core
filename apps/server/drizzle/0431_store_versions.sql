-- Migration 0431: Store Versions (A20 / Wave 2)
-- Versionierung für Store-Listings inkl. Manifest und Paket-Pfad

CREATE TABLE IF NOT EXISTS "store_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "listing_id" text NOT NULL,
  "version" text NOT NULL,
  "package_hash" text DEFAULT '' NOT NULL,
  "package_path" text DEFAULT '' NOT NULL,
  "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'review' NOT NULL,
  "changelog" text DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "store_versions_listing_id_idx" ON "store_versions" ("listing_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_versions_listing_version_idx" ON "store_versions" ("listing_id", "version");
