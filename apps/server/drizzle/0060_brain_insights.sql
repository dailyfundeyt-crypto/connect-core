CREATE TABLE IF NOT EXISTS "brain_insights" (
  "company_id" text PRIMARY KEY NOT NULL,
  "structure" jsonb NOT NULL,
  "topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brain_insights_updated_at_idx" ON "brain_insights" ("updated_at");
