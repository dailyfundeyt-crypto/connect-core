-- Lane 10 Migration 0091: MCP Audit Log
CREATE TABLE IF NOT EXISTS mcp_audit_log (
  id text PRIMARY KEY,
  grant_id text,
  agent_name text,
  token_hash text,
  tool_name text NOT NULL,
  params_summary text,
  status text NOT NULL CHECK (status IN ('success', 'denied', 'error')),
  status_detail text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS mcp_audit_log_created_idx ON mcp_audit_log (created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS mcp_audit_log_grant_idx ON mcp_audit_log (grant_id);
