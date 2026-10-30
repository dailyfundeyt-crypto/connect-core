-- Hitodama Desktop Migration 0199: desktop_scheduler_state table
CREATE TABLE IF NOT EXISTS "desktop_scheduler_state" (
  "id" text PRIMARY KEY NOT NULL DEFAULT 'singleton',
  "host_online" boolean NOT NULL DEFAULT false,
  "last_heartbeat_at" timestamp with time zone,
  "last_tick_at" timestamp with time zone,
  "scheduler_status" text NOT NULL DEFAULT 'running',
  "kill_switch_active" boolean NOT NULL DEFAULT false,
  "timezone" text NOT NULL DEFAULT 'Europe/Berlin',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "desktop_scheduler_state" ("id", "host_online", "scheduler_status", "kill_switch_active", "timezone")
VALUES ('singleton', false, 'running', false, 'Europe/Berlin')
ON CONFLICT ("id") DO NOTHING;
