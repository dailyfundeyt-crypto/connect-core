-- Lane 10 Migration 0090: External MCP Grants
CREATE TABLE IF NOT EXISTS mcp_grants (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  agent_name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS mcp_grants_company_idx ON mcp_grants (company_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcp_grants_agent_idx ON mcp_grants (agent_name);
