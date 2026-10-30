-- Migration 0320: Browser-Profile (10 Profile je Agent), Gruppen & Tabs (A09 / Wave 1)
-- Erstellt browser_profiles, browser_profile_groups und browser_profile_tabs

CREATE TABLE IF NOT EXISTS "browser_profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "agent_id" text NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT '#00f2fe' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "user_data_dir" text NOT NULL,
  "cdp_port" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "browser_profiles_agent_id_idx" ON "browser_profiles" ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_profiles_status_idx" ON "browser_profiles" ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "browser_profile_groups" (
  "id" text PRIMARY KEY NOT NULL,
  "profile_id" text NOT NULL REFERENCES "browser_profiles"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "parent_id" text,
  "order_index" integer DEFAULT 0 NOT NULL,
  "is_archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "browser_profile_groups_profile_id_idx" ON "browser_profile_groups" ("profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_profile_groups_parent_id_idx" ON "browser_profile_groups" ("parent_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "browser_profile_tabs" (
  "id" text PRIMARY KEY NOT NULL,
  "profile_id" text NOT NULL REFERENCES "browser_profiles"("id") ON DELETE CASCADE,
  "group_id" text REFERENCES "browser_profile_groups"("id") ON DELETE SET NULL,
  "url" text DEFAULT 'about:blank' NOT NULL,
  "title" text DEFAULT 'Neuer Tab' NOT NULL,
  "cdp_target_id" text,
  "order_index" integer DEFAULT 0 NOT NULL,
  "is_archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "browser_profile_tabs_profile_id_idx" ON "browser_profile_tabs" ("profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_profile_tabs_group_id_idx" ON "browser_profile_tabs" ("group_id");
