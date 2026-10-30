-- Connect Desktop Migration 0202: desktop_confirmation_requests table (Lane 7)
CREATE TABLE IF NOT EXISTS "desktop_confirmation_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "action_id" text NOT NULL,
  "agent_id" text,
  "risk_level" text NOT NULL DEFAULT 'destructive',
  "reason" text NOT NULL,
  "action_summary" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "approved" boolean,
  "response_reason" text,
  "timeout_ms" integer NOT NULL DEFAULT 15000,
  "requested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "decided_at" timestamp with time zone
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "desktop_confirmation_requests_action_id_idx" ON "desktop_confirmation_requests" ("action_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_confirmation_requests_status_idx" ON "desktop_confirmation_requests" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_confirmation_requests_requested_at_idx" ON "desktop_confirmation_requests" ("requested_at");
