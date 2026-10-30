-- Connect Desktop Migration 0191: desktop_intents table (Lane 5)
CREATE TABLE IF NOT EXISTS "desktop_intents" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text REFERENCES "desktop_sessions" ("id") ON DELETE SET NULL,
  "raw_input" text NOT NULL,
  "intent_type" text NOT NULL,
  "confidence" double precision NOT NULL DEFAULT 1.0,
  "suggested_action" jsonb,
  "agent_task" jsonb,
  "schedule" jsonb,
  "explanation" text,
  "model_used" text NOT NULL DEFAULT 'local_heuristic',
  "classified_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "desktop_intents_session_id_idx" ON "desktop_intents" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_intents_intent_type_idx" ON "desktop_intents" ("intent_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "desktop_intents_classified_at_idx" ON "desktop_intents" ("classified_at");
