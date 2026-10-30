-- Connect Desktop Migration 0190: desktop_sessions table (Lane 5)
CREATE TABLE IF NOT EXISTS "desktop_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "session_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "ended_at" timestamp with time zone,
  "duration_ms" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "desktop_sessions_session_type_idx" ON "desktop_sessions" ("session_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_sessions_status_idx" ON "desktop_sessions" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_sessions_started_at_idx" ON "desktop_sessions" ("started_at");
