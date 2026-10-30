-- Migration 0560: Project-Swarm Runs Resolution (A33 / Wave 3 Integration)
-- Behebt die Tabellen-Namenskollision zwischen Swarm-v3 (0140_swarm_runs) und Project-Swarm v06 (0501_swarm_runs).
-- 1. Erstellt die dedizierte Tabelle 'project_swarm_runs' für projektbasierte Schwarm-Läufe
-- 2. Ergänzt additiv die Spalte 'project_id' in 'swarm_runs' für vollständige Abwärtskompatibilität

CREATE TABLE IF NOT EXISTS "project_swarm_runs" (
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

CREATE INDEX IF NOT EXISTS "project_swarm_runs_project_idx" ON "project_swarm_runs" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_swarm_runs_status_idx" ON "project_swarm_runs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_swarm_runs_created_idx" ON "project_swarm_runs" ("created_at" DESC);
--> statement-breakpoint

-- Additive Abwärtskompatibilität für bestehende swarm_runs Tabelle
ALTER TABLE "swarm_runs" ADD COLUMN IF NOT EXISTS "project_id" text REFERENCES "research_projects"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_runs_project_idx" ON "swarm_runs" ("project_id");
