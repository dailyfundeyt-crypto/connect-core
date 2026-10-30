-- Connect Desktop Migration 0194: desktop_agent_capabilities table (Lane 5)
CREATE TABLE IF NOT EXISTS "desktop_agent_capabilities" (
  "id" text PRIMARY KEY NOT NULL,
  "agent_id" text NOT NULL,
  "capability" text NOT NULL,
  "allowed" boolean NOT NULL DEFAULT true,
  "constraints" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "desktop_agent_capabilities_agent_cap_idx" ON "desktop_agent_capabilities" ("agent_id", "capability");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_agent_capabilities_agent_id_idx" ON "desktop_agent_capabilities" ("agent_id");
