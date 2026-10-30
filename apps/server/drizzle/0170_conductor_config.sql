-- Conductor Migration 0170: conductor_config table (singleton configuration with paid_api_fallback=false CHECK constraint)
CREATE TABLE IF NOT EXISTS "conductor_config" (
  "id" text PRIMARY KEY NOT NULL DEFAULT 'default',
  "enabled" boolean NOT NULL DEFAULT true,
  "kill_switch" boolean NOT NULL DEFAULT false,
  "primary" text NOT NULL DEFAULT 'codex',
  "standby" text NOT NULL DEFAULT 'claude',
  "cooldown_min" integer NOT NULL DEFAULT 30,
  "poll_sec" integer NOT NULL DEFAULT 300,
  "initial_poll_sec" integer NOT NULL DEFAULT 20,
  "max_handoffs_per_task" integer NOT NULL DEFAULT 3,
  "paid_api_fallback" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "conductor_config_paid_api_forbidden" CHECK ("paid_api_fallback" = false)
);
--> statement-breakpoint

INSERT INTO "conductor_config" (
  "id", "enabled", "kill_switch", "primary", "standby",
  "cooldown_min", "poll_sec", "initial_poll_sec", "max_handoffs_per_task", "paid_api_fallback"
)
VALUES ('default', true, false, 'codex', 'claude', 30, 300, 20, 3, false)
ON CONFLICT ("id") DO NOTHING;
