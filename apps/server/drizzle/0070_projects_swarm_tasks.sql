-- Migration 0070: Swarm Research Projects, DAG Tasks, Claims and Results
-- Lane 6: Agent 6 – Projekte & Bot-Schwarm-Forschung (Open-Source-artig)
-- Range: 0070 - 0074

CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "goal" text,
  "company_id" text,
  "owner_id" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "bot_count" integer DEFAULT 0 NOT NULL,
  "tasks_count" integer DEFAULT 0 NOT NULL,
  "github_repo_url" text,
  "non_profit" boolean DEFAULT false NOT NULL,
  "max_depth" integer DEFAULT 4 NOT NULL,
  "budget_tokens" integer DEFAULT 1000000 NOT NULL,
  "used_tokens" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "project_id" text REFERENCES "projects"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "parent_task_id" text REFERENCES "swarm_tasks"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "depth" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "assigned_to" text;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "result_url" text;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "result_summary" text;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "reviewer_id" text;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "review_comment" text;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "budget_tokens" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "swarm_tasks" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "task_claims" (
  "id" text PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL REFERENCES "swarm_tasks"("id") ON DELETE CASCADE,
  "bot_id" text NOT NULL,
  "owner_id" text,
  "claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_expires_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "task_results" (
  "id" text PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL REFERENCES "swarm_tasks"("id") ON DELETE CASCADE,
  "bot_id" text NOT NULL,
  "result_summary" text NOT NULL,
  "result_url" text,
  "output_data" jsonb,
  "status" text DEFAULT 'submitted' NOT NULL,
  "reviewer_id" text,
  "review_comment" text,
  "review_score" integer,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_owner_idx" ON "projects" ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_tasks_project_id_idx" ON "swarm_tasks" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_tasks_parent_task_id_idx" ON "swarm_tasks" ("parent_task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_claims_task_id_idx" ON "task_claims" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_claims_bot_id_idx" ON "task_claims" ("bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_results_task_id_idx" ON "task_results" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_results_bot_id_idx" ON "task_results" ("bot_id");
