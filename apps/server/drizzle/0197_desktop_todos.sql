-- Hitodama Desktop Migration 0197: desktop_todos table
CREATE TABLE IF NOT EXISTS "desktop_todos" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "due_time" timestamp with time zone,
  "completed" boolean NOT NULL DEFAULT false,
  "completed_at" timestamp with time zone,
  "associated_url" text,
  "associated_app" text,
  "reminder_sent" boolean NOT NULL DEFAULT false,
  "reminder_time" timestamp with time zone,
  "reminder_channel" text NOT NULL DEFAULT 'both',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_todos_due_time_completed_idx" ON "desktop_todos" ("completed", "due_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_todos_reminder_idx" ON "desktop_todos" ("completed", "reminder_sent", "reminder_time");
