-- Migration 0441: Connect-Sozial Post Media (A21 / Wave 2)
-- Lokale Uploads, Validierung, EXIF-Entfernung, Archivierung

CREATE TABLE IF NOT EXISTS "social_media" (
  "id" text PRIMARY KEY NOT NULL,
  "filename" text NOT NULL,
  "original_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "url" text NOT NULL,
  "uploaded_by" text NOT NULL,
  "post_id" text,
  "company_id" text,
  "exif_removed" boolean DEFAULT true NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "social_media" ADD COLUMN IF NOT EXISTS "post_id" text;
--> statement-breakpoint
ALTER TABLE "social_media" ADD COLUMN IF NOT EXISTS "company_id" text;
--> statement-breakpoint
ALTER TABLE "social_media" ADD COLUMN IF NOT EXISTS "exif_removed" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "social_media" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "social_media_v06_post_idx" ON "social_media" ("post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_media_v06_company_idx" ON "social_media" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_media_v06_created_idx" ON "social_media" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_media_v06_archived_idx" ON "social_media" ("archived_at");
