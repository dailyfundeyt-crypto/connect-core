-- Migration 0480: Dedicated Onboarding State (A25 / Wave 3)
-- Speichert den Fortschritt und die Konfiguration des Onboardings pro Benutzer.

CREATE TABLE IF NOT EXISTS "user_onboarding" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "step" text DEFAULT 'welcome' NOT NULL,
  "step_index" integer DEFAULT 0 NOT NULL,
  "completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "completed_at" timestamp with time zone,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "user_onboarding_completed_at_idx" ON "user_onboarding" ("completed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_onboarding_step_idx" ON "user_onboarding" ("step");
