-- Conductor Migration 0174: conductor_events table (Audit & Alert log)
CREATE TABLE IF NOT EXISTS "conductor_events" (
  "id" text PRIMARY KEY NOT NULL,
  "task_id" text,
  "event_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'info',
  "message" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "conductor_events_task_id_idx" ON "conductor_events" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conductor_events_event_type_idx" ON "conductor_events" ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conductor_events_created_at_idx" ON "conductor_events" ("created_at");
