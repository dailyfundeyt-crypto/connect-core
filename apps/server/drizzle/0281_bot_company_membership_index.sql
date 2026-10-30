-- Migration 0281: Bot-Company-Membership & Indizes (A05 / Wave 1)
-- Additive Zuordnungstabelle fuer Bot-Zugehoerigkeit zu Firmen mit Indizes

CREATE TABLE IF NOT EXISTS "company_bots" (
  "company_id" text NOT NULL,
  "bot_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("company_id", "bot_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "company_bots_company_idx" ON "company_bots" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_bots_bot_idx" ON "company_bots" ("bot_id");
