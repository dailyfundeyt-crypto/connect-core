-- Migration 0115: Spark-MCP Browser-Ordner, Links & Notizen (Lane 3)
-- Erstellt Tabellen fuer hierarchische Browser-Ordner, Verlinkungen und Notizen-Zuordnungen.

CREATE TABLE IF NOT EXISTS "browser_folders" (
  "id" text PRIMARY KEY NOT NULL,
  "parent_id" text REFERENCES "browser_folders"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "kind" text DEFAULT 'normal' NOT NULL CHECK ("kind" IN ('normal', 'settings')),
  "owner_scope" text DEFAULT 'company' NOT NULL,
  "instruction_note_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "browser_folders_parent_idx" ON "browser_folders" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_folders_kind_idx" ON "browser_folders" ("kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "browser_folders_owner_scope_idx" ON "browser_folders" ("owner_scope");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "folder_links" (
  "id" text PRIMARY KEY NOT NULL,
  "folder_id" text NOT NULL REFERENCES "browser_folders"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "title" text NOT NULL,
  "note_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "folder_links_folder_idx" ON "folder_links" ("folder_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folder_links_note_idx" ON "folder_links" ("note_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "folder_notes" (
  "folder_id" text NOT NULL REFERENCES "browser_folders"("id") ON DELETE CASCADE,
  "note_id" text NOT NULL,
  "title" text,
  "content" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("folder_id", "note_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "folder_notes_note_idx" ON "folder_notes" ("note_id");
--> statement-breakpoint

-- Alias-View "folders" fuer Kompatibilitaet mit v3-Prompt-Spezifikation
CREATE OR REPLACE VIEW "folders" AS SELECT * FROM "browser_folders";
