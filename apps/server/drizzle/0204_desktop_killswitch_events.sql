-- Connect Desktop Migration 0204: desktop_killswitch_events table (Lane 7)
CREATE TABLE IF NOT EXISTS "desktop_killswitch_events" (
  "id" text PRIMARY KEY NOT NULL,
  "source" text NOT NULL,
  "reason" text,
  "aborted_actions_count" integer NOT NULL DEFAULT 0,
  "triggered_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "desktop_killswitch_events_triggered_at_idx" ON "desktop_killswitch_events" ("triggered_at");
