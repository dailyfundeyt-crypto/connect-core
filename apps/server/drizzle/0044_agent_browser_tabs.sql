CREATE TABLE IF NOT EXISTS "agent_browser_tabs" (
  "tab_id" text PRIMARY KEY NOT NULL,
  "agent_id" text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "url" text,
  "title" text,
  "profile_dir" text NOT NULL,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_browser_tabs_agent_idx" ON "agent_browser_tabs" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_browser_tabs_open_idx" ON "agent_browser_tabs" ("agent_id") WHERE "closed_at" IS NULL;
