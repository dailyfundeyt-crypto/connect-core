-- Migration 0444: Connect-Sozial Bot-Spenden (A21 / Wave 2)
-- Bot-Spenden an Projekte (Kontingent pro Tag, Zeitraum)

CREATE TABLE IF NOT EXISTS "bot_donations" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "research_projects"("id") ON DELETE CASCADE,
  "bot_id" text NOT NULL,
  "owner_id" text NOT NULL,
  "daily_quota" integer NOT NULL,
  "until" timestamp with time zone,
  "status" text DEFAULT 'active' NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bot_donations_project_idx" ON "bot_donations" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_donations_bot_idx" ON "bot_donations" ("bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_donations_owner_idx" ON "bot_donations" ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_donations_archived_idx" ON "bot_donations" ("archived_at");
