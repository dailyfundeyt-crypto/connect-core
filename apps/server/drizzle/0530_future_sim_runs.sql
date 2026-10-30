-- Migration 0530: Zukunfts-Simulation der Firmen (A30 / Wave 3)
-- Erstellt Tabelle future_sim_runs für Multi-Agenten-Zukunftssimulationen und Debatten

CREATE TABLE IF NOT EXISTS "future_sim_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "plan_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "question" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "engine" text DEFAULT 'mock' NOT NULL,
  "report_path" text,
  "result_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "future_sim_runs_company_id_idx" ON "future_sim_runs" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "future_sim_runs_status_idx" ON "future_sim_runs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "future_sim_runs_created_at_idx" ON "future_sim_runs" ("created_at");
