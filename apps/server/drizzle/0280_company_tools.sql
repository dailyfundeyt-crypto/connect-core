-- Migration 0280: Tools pro Firma (Toggles) (A05 / Wave 1)
-- Erlaubt das Aktivieren/Deaktivieren von Connect-Tools pro Firma

CREATE TABLE IF NOT EXISTS "company_tool_toggles" (
  "company_id" text NOT NULL,
  "tool_id" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("company_id", "tool_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "company_tool_toggles_company_idx" ON "company_tool_toggles" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_tool_toggles_tool_idx" ON "company_tool_toggles" ("tool_id");
