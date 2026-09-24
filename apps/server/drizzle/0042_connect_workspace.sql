CREATE TABLE IF NOT EXISTS "connect_workspace_kv" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connect_media" (
  "id" text PRIMARY KEY NOT NULL,
  "mime" text NOT NULL,
  "bytes" bytea NOT NULL,
  "byte_length" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
