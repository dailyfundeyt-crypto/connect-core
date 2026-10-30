CREATE TABLE IF NOT EXISTS "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"accent_color" text,
	"focus_mode" boolean DEFAULT false,
	"reduced_motion" boolean DEFAULT false,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
