-- Connect Desktop Migration 0193: desktop_bridge_auth table (Lane 5)
CREATE TABLE IF NOT EXISTS "desktop_bridge_auth" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "client_name" text NOT NULL DEFAULT 'connect-desktop-host',
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at" timestamp with time zone,
  "expires_at" timestamp with time zone
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "desktop_bridge_auth_status_idx" ON "desktop_bridge_auth" ("status");
