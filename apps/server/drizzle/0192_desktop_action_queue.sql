-- Connect Desktop Migration 0192: desktop_action_queue table (Lane 5)
CREATE TABLE IF NOT EXISTS "desktop_action_queue" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text REFERENCES "desktop_sessions" ("id") ON DELETE SET NULL,
  "agent_id" text,
  "action_type" text NOT NULL,
  "risk_level" text NOT NULL DEFAULT 'act',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "result_data" jsonb,
  "error_message" text,
  "execution_duration_ms" double precision,
  "requires_confirmation" boolean NOT NULL DEFAULT false,
  "confirmation_token" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "executed_at" timestamp with time zone
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "desktop_action_queue_status_idx" ON "desktop_action_queue" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_action_queue_agent_id_idx" ON "desktop_action_queue" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_action_queue_action_type_idx" ON "desktop_action_queue" ("action_type");
