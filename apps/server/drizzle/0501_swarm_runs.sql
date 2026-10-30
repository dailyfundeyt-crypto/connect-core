-- Migration 0501: Project-Swarm Runs Orchestration (A27 / Wave 3)
-- Verwaltet übergeordnete Swarm-Ausführungsläufe, Budgetgrenzen, Pause-Zustände und Metriken

CREATE TABLE IF NOT EXISTS "swarm_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "research_projects"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'running' NOT NULL,
  "budget_tokens" integer DEFAULT 10000000 NOT NULL,
  "used_tokens" integer DEFAULT 0 NOT NULL,
  "max_parallel_bots" integer DEFAULT 50 NOT NULL,
  "tasks_completed" integer DEFAULT 0 NOT NULL,
  "tasks_failed" integer DEFAULT 0 NOT NULL,
  "pause_requested" boolean DEFAULT false NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "paused_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "swarm_runs_project_idx" ON "swarm_runs" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_runs_status_idx" ON "swarm_runs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_runs_created_idx" ON "swarm_runs" ("created_at" DESC);
