CREATE TABLE IF NOT EXISTS "swarm_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text,
  "agent_id" text DEFAULT 'auto' NOT NULL,
  "title" text NOT NULL,
  "action" text NOT NULL,
  "params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "priority" text DEFAULT 'normal' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "assigned_worker_id" text,
  "assigned_profile_dir" text,
  "assigned_cdp_port" integer,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "max_retries" integer DEFAULT 2 NOT NULL,
  "recovered_from_crash" boolean DEFAULT false NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "swarm_results" (
  "id" text PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL REFERENCES "swarm_tasks"("id") ON DELETE CASCADE,
  "run_id" text,
  "agent_id" text NOT NULL,
  "agent_name" text,
  "action" text NOT NULL,
  "ok" boolean NOT NULL,
  "url" text,
  "title" text,
  "output" text,
  "error" text,
  "screenshot_ref" text,
  "duration_ms" integer DEFAULT 0 NOT NULL,
  "retries" integer DEFAULT 0 NOT NULL,
  "recovered_from_crash" boolean DEFAULT false NOT NULL,
  "system_metrics" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_tasks_status_idx" ON "swarm_tasks" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_tasks_run_id_idx" ON "swarm_tasks" ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_results_task_id_idx" ON "swarm_results" ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_results_run_id_idx" ON "swarm_results" ("run_id");
