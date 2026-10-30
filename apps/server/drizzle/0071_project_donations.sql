-- Migration 0071: Bot Donations for Swarm Research Projects
-- Lane 6: Agent 6 – Projekte & Bot-Schwarm-Forschung (Open-Source-artig)
-- Range: 0070 - 0074

CREATE TABLE IF NOT EXISTS "project_donations" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "donor_user_id" text NOT NULL,
  "bot_id" text NOT NULL,
  "bot_name" text NOT NULL,
  "budget_credits" integer DEFAULT 0 NOT NULL,
  "max_tasks_per_day" integer DEFAULT 50 NOT NULL,
  "tasks_completed" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "donated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_donations_project_id_idx" ON "project_donations" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_donations_donor_id_idx" ON "project_donations" ("donor_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_donations_bot_id_idx" ON "project_donations" ("bot_id");
