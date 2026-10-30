-- Lane 2 Migration 0110: Unternehmens-Apps pro Firma (Toggle + Logo im Menü)
CREATE TABLE IF NOT EXISTS company_app_toggles (
  company_id text NOT NULL,
  app_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  app_name text,
  app_logo text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, app_id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS company_app_toggles_company_idx ON company_app_toggles (company_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS company_app_toggles_app_idx ON company_app_toggles (app_id);
