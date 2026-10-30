/**
 * MCP Audit Logging Integration (Lane 6 / Migration 0091)
 */

import postgres from "postgres";

export interface McpAuditEntry {
  toolName: string;
  agentName: string;
  paramsSummary: string;
  status: "success" | "denied" | "error";
  statusDetail?: string;
  grantId?: string;
  tokenHash?: string;
  ipAddress?: string;
}

const memoryAuditLog: Array<McpAuditEntry & { id: string; createdAt: string }> = [];

function getDatabaseClient() {
  const dbUrl =
    process.env.DATABASE_URL ||
    (process.env.DATABASE_URL ?? "");
  if (!dbUrl) return null;
  try {
    return postgres(dbUrl, { max: 1, idle_timeout: 3 });
  } catch {
    return null;
  }
}

/**
 * Records an action to the 0091_mcp_audit_log table (and in-memory buffer).
 */
export async function recordAuditLog(entry: McpAuditEntry): Promise<void> {
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  // Always keep in memory buffer for quick inspection
  memoryAuditLog.unshift({ ...entry, id, createdAt: now });
  if (memoryAuditLog.length > 500) {
    memoryAuditLog.pop();
  }

  // Attempt writing to Postgres 0091_mcp_audit_log
  const sql = getDatabaseClient();
  if (sql) {
    try {
      await sql`
        INSERT INTO mcp_audit_log (
          id, grant_id, agent_name, token_hash, tool_name, params_summary, status, status_detail, ip_address, created_at
        ) VALUES (
          ${id},
          ${entry.grantId ?? null},
          ${entry.agentName},
          ${entry.tokenHash ?? null},
          ${entry.toolName},
          ${entry.paramsSummary.slice(0, 500)},
          ${entry.status},
          ${entry.statusDetail ? entry.statusDetail.slice(0, 1000) : null},
          ${entry.ipAddress ?? "127.0.0.1"},
          NOW()
        )
      `;
    } catch {
      // Best-effort: continue gracefully if table not yet migrated or DB is offline
    } finally {
      await sql.end().catch(() => {});
    }
  }
}

export function getInMemoryAuditLogs() {
  return [...memoryAuditLog];
}
