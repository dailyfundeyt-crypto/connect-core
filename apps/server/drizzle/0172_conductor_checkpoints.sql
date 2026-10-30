-- Conductor Migration 0172: conductor_checkpoints table
CREATE TABLE IF NOT EXISTS "conductor_checkpoints" (
  "id" text PRIMARY KEY NOT NULL,
  "swarm_task_id" text NOT NULL REFERENCES "swarm_tasks"("id") ON DELETE CASCADE,
  "from_runtime" text NOT NULL,
  "summary" text NOT NULL,
  "files_touched" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "next_steps" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "conductor_checkpoints_task_id_idx" ON "conductor_checkpoints" ("swarm_task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conductor_checkpoints_created_at_idx" ON "conductor_checkpoints" ("created_at");
