-- Connect Desktop Migration 0203: desktop_rate_limits table (Lane 7)
CREATE TABLE IF NOT EXISTS "desktop_rate_limits" (
  "id" text PRIMARY KEY NOT NULL,
  "agent_id" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "action_count" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "desktop_rate_limits_agent_id_window_idx" ON "desktop_rate_limits" ("agent_id", "window_start");
