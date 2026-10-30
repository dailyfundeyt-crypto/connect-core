-- Migration 0510: PC-Apps in Browser-Gruppen mit Live-Preview (A28 / Wave 3)
-- Erstellt pc_apps zur Registrierung und Einbettung von Windows-Desktop-Apps in Gruppen

CREATE TABLE IF NOT EXISTS "pc_apps" (
  "id" text PRIMARY KEY NOT NULL,
  "group_id" text NOT NULL,
  "name" text NOT NULL,
  "exe_path" text NOT NULL,
  "window_title_regex" text,
  "process_name" text,
  "icon_path" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pc_apps_group_id_idx" ON "pc_apps" ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pc_apps_process_name_idx" ON "pc_apps" ("process_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pc_apps_is_active_idx" ON "pc_apps" ("is_active");
