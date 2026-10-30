-- Migration 0443: Connect-Sozial Forschungsprojekte (A21 / Wave 2)
-- Forschungsprojekte (z. B. GitHub-Repo), die in der Timeline erscheinen

CREATE TABLE IF NOT EXISTS "research_projects" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "goal" text NOT NULL,
  "repo_url" text,
  "account_company_id" text NOT NULL,
  "is_non_profit" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "research_projects_account_idx" ON "research_projects" ("account_company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_projects_status_idx" ON "research_projects" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_projects_created_idx" ON "research_projects" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "research_projects_archived_idx" ON "research_projects" ("archived_at");
