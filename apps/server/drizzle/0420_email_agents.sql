-- Migration 0420: E-Mail-Agenten - Verzeichnis externer E-Mail-Bots (A19 / Wave 2)
-- Erstellt das Verzeichnis externer E-Mail-Bots, die von Connect-Agenten
-- per E-Mail beauftragt werden koennen (Versand nur nach Freigabe, siehe 0421).
-- HINWEIS (A19): Nicht angewendet - die Anwendung macht ausschliesslich der Integrations-Agent.
-- Namenswahl "email_agents_v06": die Tabelle "email_agents" gehoert der Lane-10-Variante,
-- damit es zu keinem Namenskonflikt kommt.

CREATE TABLE IF NOT EXISTS "email_agents_v06" (
  "id" text PRIMARY KEY NOT NULL,
  "address" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "company_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "email_agents_v06_address_idx" ON "email_agents_v06" ("address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_agents_v06_is_active_idx" ON "email_agents_v06" ("is_active");
