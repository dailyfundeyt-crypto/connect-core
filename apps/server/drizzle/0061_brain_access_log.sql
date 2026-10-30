CREATE TABLE IF NOT EXISTS "brain_access_log" (
  "id" text PRIMARY KEY NOT NULL,
  "agent_id" text NOT NULL,
  "action" text NOT NULL,
  "path" text NOT NULL,
  "allowed" boolean DEFAULT true NOT NULL,
  "duration_ms" integer DEFAULT 0,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_access_log_agent_id_idx" ON "brain_access_log" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_access_log_timestamp_idx" ON "brain_access_log" ("timestamp");
