-- Connect Desktop Migration 0200: desktop_agent_permissions table (Lane 7)
CREATE TABLE IF NOT EXISTS "desktop_agent_permissions" (
  "agent_id" text PRIMARY KEY NOT NULL,
  "permission_level" text NOT NULL DEFAULT 'none',
  "allowed_apps" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "allowed_domains" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "rate_limit_per_minute" integer NOT NULL DEFAULT 30,
  "is_blocked" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "desktop_agent_permissions_permission_level_idx" ON "desktop_agent_permissions" ("permission_level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_agent_permissions_is_blocked_idx" ON "desktop_agent_permissions" ("is_blocked");
