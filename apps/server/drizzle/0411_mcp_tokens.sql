-- Migration 0411: MCP Tokens & Audit Logs (A18 / Wave 2)
-- Tokens werden ausschließlich gehasht gespeichert (SHA-256), Soft-Revoke über revoked_at

CREATE TABLE IF NOT EXISTS "mcp_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "principal" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "lifetime" text DEFAULT 'permanent' NOT NULL,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mcp_tokens_token_hash_idx" ON "mcp_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_tokens_principal_idx" ON "mcp_tokens" ("principal");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_tokens_revoked_at_idx" ON "mcp_tokens" ("revoked_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mcp_audit_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "token_id" text,
  "principal" text,
  "company_id" text,
  "tool_name" text NOT NULL,
  "params_summary" text,
  "status" text NOT NULL,
  "status_detail" text,
  "ip_address" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mcp_audit_logs_created_at_idx" ON "mcp_audit_logs" ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mcp_audit_logs_principal_idx" ON "mcp_audit_logs" ("principal");
