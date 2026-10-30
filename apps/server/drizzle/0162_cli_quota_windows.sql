-- Migration 0162: Conductor & Usage - CLI Quota Windows
-- Lane 1: Usage-Datenmodell & Collector Codex/Claude
-- Range: 0160 - 0164

CREATE TABLE IF NOT EXISTS "cli_quota_windows" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL REFERENCES "cli_accounts"("id") ON DELETE CASCADE,
  "limit_id" text NOT NULL,
  "window_kind" text NOT NULL,
  "window_minutes" integer NOT NULL,
  "used_percent" double precision NOT NULL,
  "resets_at" text,
  "confidence" text NOT NULL,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "plan_type" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cli_quota_windows_account_limit_idx" ON "cli_quota_windows" ("account_id", "limit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cli_quota_windows_observed_at_idx" ON "cli_quota_windows" ("observed_at");
