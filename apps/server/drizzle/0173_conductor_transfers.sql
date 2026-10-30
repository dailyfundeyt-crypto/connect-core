-- Conductor Migration 0173: conductor_transfers table (deterministic unique transfer_key)
CREATE TABLE IF NOT EXISTS "conductor_transfers" (
  "id" text PRIMARY KEY NOT NULL,
  "swarm_task_id" text NOT NULL REFERENCES "swarm_tasks"("id") ON DELETE CASCADE,
  "transfer_key" text NOT NULL UNIQUE,
  "from_runtime" text NOT NULL,
  "to_runtime" text NOT NULL,
  "checkpoint_id" text REFERENCES "conductor_checkpoints"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "conductor_transfers_task_id_idx" ON "conductor_transfers" ("swarm_task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conductor_transfers_status_idx" ON "conductor_transfers" ("status");
