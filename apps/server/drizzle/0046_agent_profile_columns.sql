-- 0046_agent_profile_columns.sql (swarmfix 2026-10-20)
-- Nicht-destruktiv: ergaenzt fehlende Agent-Spalten (Profil-Felder, Stufe 9
-- Account-E-Mail, Browser-Status) und die App-Instanzen-Tabelle. Alles
-- IF NOT EXISTS, damit es auf schon manuell migrierten DBs gefahrlos laeuft.
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "headline" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "role" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "chosen_cli" text DEFAULT 'antigravity' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "account_email" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "spark_permissions" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "browser_profile" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "website_list" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "subagents" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "mcp_list" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "browser_status" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "browser_error" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "browser_status_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_app_instances" (
  "id" text PRIMARY KEY NOT NULL DEFAULT gen_random_uuid()::text,
  "agent_id" text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "app_id" text NOT NULL,
  "slot" integer DEFAULT 1 NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "email" text DEFAULT '' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "agent_app_instances_agent_slot_unique" UNIQUE ("agent_id","app_id","slot")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_app_instances_agent_id_idx" ON "agent_app_instances" ("agent_id");