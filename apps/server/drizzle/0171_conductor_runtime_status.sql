-- Conductor Migration 0171: conductor_runtime_status table & single-owner partial UNIQUE index on task_claims
CREATE TABLE IF NOT EXISTS "conductor_runtime_status" (
  "runtime_id" text PRIMARY KEY NOT NULL,
  "cli_kind" text NOT NULL,
  "account_id" text NOT NULL,
  "state" text NOT NULL DEFAULT 'available',
  "last_failure_class" text,
  "cooldown_until" timestamp with time zone,
  "last_probe_at" timestamp with time zone,
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "active_claims_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "conductor_runtime_status_cli_kind_idx" ON "conductor_runtime_status" ("cli_kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conductor_runtime_status_state_idx" ON "conductor_runtime_status" ("state");
--> statement-breakpoint

-- Single Owner Partial UNIQUE Index: exactly one active claim per task
CREATE UNIQUE INDEX IF NOT EXISTS "task_claims_active_task_unique_idx" ON "task_claims" ("task_id") WHERE "status" = 'active';
