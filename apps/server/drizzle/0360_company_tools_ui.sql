-- Migration 0360: Tools-UI Konfiguration & Popup-Zustand (A13 / Wave 2)
-- Speichert benutzerspezifische Tools-UI Präferenzen pro Firma (z. B. Sortierung, collapsed State, custom pins)
-- NICHT ANGEWENDET: Anwendung und Drizzle-Journal-Eintrag nur durch den Integrations-Agenten (A22)

CREATE TABLE IF NOT EXISTS "company_tools_ui_prefs" (
  "user_id" text NOT NULL,
  "company_id" text NOT NULL,
  "collapsed" boolean DEFAULT false NOT NULL,
  "custom_order" text[] DEFAULT '{}'::text[] NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id", "company_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "company_tools_ui_prefs_company_idx" ON "company_tools_ui_prefs" ("company_id");
