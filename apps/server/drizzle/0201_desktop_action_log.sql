-- Connect Desktop Migration 0201: desktop_action_log table (Lane 7)
CREATE TABLE IF NOT EXISTS "desktop_action_log" (
  "id" text PRIMARY KEY NOT NULL,
  "action_id" text NOT NULL,
  "session_id" text,
  "agent_id" text,
  "action_type" text NOT NULL,
  "risk_level" text NOT NULL,
  "target_description" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL,
  "screenshot_hash" text,
  "duration_ms" integer NOT NULL DEFAULT 0,
  "error_message" text,
  "is_password_field" boolean NOT NULL DEFAULT false,
  "is_elevated_window" boolean NOT NULL DEFAULT false,
  "executed_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "desktop_action_log_agent_id_idx" ON "desktop_action_log" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_action_log_action_type_idx" ON "desktop_action_log" ("action_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_action_log_status_idx" ON "desktop_action_log" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_action_log_risk_level_idx" ON "desktop_action_log" ("risk_level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_action_log_executed_at_idx" ON "desktop_action_log" ("executed_at");
