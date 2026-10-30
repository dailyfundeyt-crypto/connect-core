CREATE TABLE IF NOT EXISTS "onboarding_state" (
	"user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"step" text DEFAULT 'welcome' NOT NULL,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"theme_preference" text,
	"active_company_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_state_user_idx" ON "onboarding_state" ("user_id");
