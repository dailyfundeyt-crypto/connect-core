-- Hitodama Desktop Migration 0195: desktop_routines table
CREATE TABLE IF NOT EXISTS "desktop_routines" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "cron_expression" text NOT NULL,
  "schedule_type" text NOT NULL DEFAULT 'cron',
  "trigger_at" timestamp with time zone,
  "natural_language_prompt" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "target_agent_id" text,
  "catch_up_policy" text NOT NULL DEFAULT 'run_once',
  "last_run_at" timestamp with time zone,
  "next_run_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_routines_enabled_next_run_idx" ON "desktop_routines" ("enabled", "next_run_at");
