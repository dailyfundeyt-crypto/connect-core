-- Hitodama Desktop Migration 0198: desktop_planned_searches table
CREATE TABLE IF NOT EXISTS "desktop_planned_searches" (
  "id" text PRIMARY KEY NOT NULL,
  "query" text NOT NULL,
  "target_platform" text NOT NULL DEFAULT 'web',
  "target_url" text,
  "scheduled_time" timestamp with time zone NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "prefer_helium" boolean NOT NULL DEFAULT true,
  "actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "routine_id" text REFERENCES "desktop_routines"("id") ON DELETE SET NULL,
  "result_summary" text,
  "executed_at" timestamp with time zone,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_planned_searches_status_sched_idx" ON "desktop_planned_searches" ("status", "scheduled_time");
