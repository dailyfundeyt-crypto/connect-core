-- Hitodama Desktop Migration 0196: desktop_routine_runs table
CREATE TABLE IF NOT EXISTS "desktop_routine_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "routine_id" text NOT NULL REFERENCES "desktop_routines"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "trigger_type" text NOT NULL DEFAULT 'scheduled',
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone,
  "error" text,
  "execution_log" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_routine_runs_routine_id_idx" ON "desktop_routine_runs" ("routine_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_routine_runs_status_idx" ON "desktop_routine_runs" ("status");
