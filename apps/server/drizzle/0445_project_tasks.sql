-- Migration 0445: Connect-Sozial Projekt-Aufgaben (A21 / Wave 2)
-- Projekt-Aufgaben als Baum / DAG (ProjectTask)

CREATE TABLE IF NOT EXISTS "project_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "research_projects"("id") ON DELETE CASCADE,
  "parent_id" text REFERENCES "project_tasks"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "acceptance" text NOT NULL,
  "status" text DEFAULT 'todo' NOT NULL,
  "assignee_bot_id" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_tasks_project_idx" ON "project_tasks" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_tasks_parent_idx" ON "project_tasks" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_tasks_status_idx" ON "project_tasks" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_tasks_assignee_idx" ON "project_tasks" ("assignee_bot_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_tasks_archived_idx" ON "project_tasks" ("archived_at");
