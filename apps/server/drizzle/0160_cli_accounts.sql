-- Migration 0160: Conductor & Usage - CLI Accounts Registry
-- Lane 1: Usage-Datenmodell & Collector Codex/Claude
-- Range: 0160 - 0164

CREATE TABLE IF NOT EXISTS "cli_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "cli_kind" text NOT NULL,
  "label" text NOT NULL,
  "home_path" text NOT NULL,
  "isolation" text DEFAULT 'per_agent' NOT NULL,
  "plan_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cli_accounts_cli_kind_idx" ON "cli_accounts" ("cli_kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cli_accounts_isolation_idx" ON "cli_accounts" ("isolation");
--> statement-breakpoint

-- Seed initial known accounts
INSERT INTO "cli_accounts" ("id", "cli_kind", "label", "home_path", "isolation", "plan_type")
VALUES
  ('acc_codex_orig', 'codex', 'Codex Original (Host)', 'C:\Users\Kunc GmbH\AppData\Local\ConnectAgents\accounts\codex\codex-original', 'per_agent', 'go'),
  ('acc_codex_inst2', 'codex', 'Codex Instanz 2', 'C:\Users\Kunc GmbH\AppData\Local\ConnectAgents\accounts\codex\codex-instanz-2', 'per_agent', 'pro'),
  ('acc_codex_681', 'codex', 'Codex 68171865', 'C:\Users\Kunc GmbH\AppData\Local\ConnectAgents\accounts\codex\codex-68171865', 'per_agent', 'go'),
  ('acc_claude_primary', 'claude', 'Claude Code Standby', 'C:\Users\Kunc GmbH\AppData\Local\ConnectAgents\agent_primary\claude-config', 'per_agent', 'pro'),
  ('acc_agy_default', 'antigravity', 'Antigravity Global (Shared)', 'C:\Users\Kunc GmbH\.gemini\antigravity', 'shared', 'internal'),
  ('acc_gemini_default', 'gemini', 'Gemini CLI Global (Shared)', 'C:\Users\Kunc GmbH\.gemini', 'shared', 'free'),
  ('acc_hermes_default', 'hermes', 'Hermes CLI (Shared)', 'C:\Users\Kunc GmbH\.hermes', 'shared', 'api_key'),
  ('acc_freebuff_default', 'freebuff', 'Freebuff CLI (Shared)', 'C:\Users\Kunc GmbH\.freebuff', 'shared', 'free')
ON CONFLICT ("id") DO NOTHING;
