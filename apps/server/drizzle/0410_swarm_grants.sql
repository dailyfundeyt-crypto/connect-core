-- Migration 0410: Swarm Grants pro Firma (A18 / Wave 2)
-- Berechtigungen für Grok Bot und externe Agenten (revoked_at statt Löschen)

CREATE TABLE IF NOT EXISTS "swarm_grants" (
  "id" text PRIMARY KEY NOT NULL,
  "principal" text NOT NULL,
  "company_id" text NOT NULL,
  "swarm_id" text,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "swarm_grants_principal_idx" ON "swarm_grants" ("principal");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_grants_company_id_idx" ON "swarm_grants" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "swarm_grants_revoked_at_idx" ON "swarm_grants" ("revoked_at");
