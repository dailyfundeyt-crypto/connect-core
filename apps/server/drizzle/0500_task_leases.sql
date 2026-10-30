-- Migration 0500: Project-Swarm Task Leases (A27 / Wave 3)
-- Verwaltet atomare Task-Claims und Leases zur Vermeidung von Doppelarbeit bei tausenden Bots

CREATE TABLE IF NOT EXISTS "task_leases" (
  "id" text PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL REFERENCES "project_tasks"("id") ON DELETE CASCADE,
  "bot_id" text NOT NULL,
  "project_id" text NOT NULL REFERENCES "research_projects"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'worker' NOT NULL,
  "claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "extension_count" integer DEFAULT 0 NOT NULL,
  "tokens_used" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_leases_task_idx" ON "task_leases" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_leases_bot_idx" ON "task_leases" ("bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_leases_project_idx" ON "task_leases" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_leases_status_idx" ON "task_leases" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_leases_expires_idx" ON "task_leases" ("expires_at");
