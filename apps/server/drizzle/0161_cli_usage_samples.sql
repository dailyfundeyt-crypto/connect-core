-- Migration 0161: Conductor & Usage - CLI Usage Samples
-- Lane 1: Usage-Datenmodell & Collector Codex/Claude
-- Range: 0160 - 0164

CREATE TABLE IF NOT EXISTS "cli_usage_samples" (
  "id" text PRIMARY KEY NOT NULL,
  "agent_id" text,
  "cli_kind" text NOT NULL,
  "account_id" text NOT NULL REFERENCES "cli_accounts"("id") ON DELETE CASCADE,
  "session_id" text,
  "ts" timestamp with time zone DEFAULT now() NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "cached_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "reasoning_tokens" integer DEFAULT 0 NOT NULL,
  "total_tokens" integer DEFAULT 0 NOT NULL,
  "source" text DEFAULT 'jsonl' NOT NULL,
  "raw_ref" text,
  "source_file" text,
  "offset" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cli_usage_samples_source_offset_unique" ON "cli_usage_samples" ("source_file", "offset");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cli_usage_samples_account_id_idx" ON "cli_usage_samples" ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cli_usage_samples_agent_id_idx" ON "cli_usage_samples" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cli_usage_samples_ts_idx" ON "cli_usage_samples" ("ts");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cli_usage_samples_cli_kind_idx" ON "cli_usage_samples" ("cli_kind");
