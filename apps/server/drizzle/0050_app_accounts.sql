CREATE TABLE IF NOT EXISTS "app_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text,
  "user_id" text DEFAULT 'local-user' NOT NULL,
  "app" text NOT NULL,
  "provider" text,
  "label" text NOT NULL,
  "account_name" text,
  "email" text,
  "avatar_url" text,
  "data_dir" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_accounts_app_idx" ON "app_accounts" ("app");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_accounts_provider_idx" ON "app_accounts" ("provider");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_accounts_company_id_idx" ON "app_accounts" ("company_id");
