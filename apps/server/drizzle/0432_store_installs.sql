-- Migration 0432: Store Installs (A20 / Wave 2)
-- Protokolliert Installationen von Store-Listings in Firmen inkl. Berechtigungen

CREATE TABLE IF NOT EXISTS "store_installs" (
  "id" text PRIMARY KEY NOT NULL,
  "listing_id" text NOT NULL,
  "company_id" text NOT NULL,
  "version" text NOT NULL,
  "installed_by" text NOT NULL,
  "installed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "permissions_accepted" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "store_installs_company_id_idx" ON "store_installs" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_installs_listing_id_idx" ON "store_installs" ("listing_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "store_installs_company_listing_idx" ON "store_installs" ("company_id", "listing_id");
