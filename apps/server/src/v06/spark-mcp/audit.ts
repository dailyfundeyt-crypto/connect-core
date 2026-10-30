import type { Database } from "../../db/client";
import { recordMcpAuditLog, type McpAuditStatus } from "../../connect-mcp/grants";

export interface SparkMcpAuditEntry {
  id: string;
  agentId: string;
  agentName: string;
  toolName: string;
  paramsSummary: string;
  status: McpAuditStatus;
  detail: string | null;
  timestamp: string;
}

const auditMemoryLog: SparkMcpAuditEntry[] = [];
const MAX_MEMORY_LOGS = 500;

export async function logSparkMcpCall(
  database: Database | undefined,
  entry: {
    agentId: string;
    agentName: string;
    toolName: string;
    params: Record<string, unknown>;
    status: McpAuditStatus;
    detail?: string | null;
  },
): Promise<SparkMcpAuditEntry> {
  const auditRecord: SparkMcpAuditEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentId: entry.agentId,
    agentName: entry.agentName,
    toolName: entry.toolName,
    paramsSummary: JSON.stringify(entry.params).slice(0, 500),
    status: entry.status,
    detail: entry.detail || null,
    timestamp: new Date().toISOString(),
  };

  auditMemoryLog.unshift(auditRecord);
  if (auditMemoryLog.length > MAX_MEMORY_LOGS) {
    auditMemoryLog.pop();
  }

  if (database) {
    try {
      await recordMcpAuditLog(database, {
        grantId: entry.agentId.startsWith("grant_") ? entry.agentId : null,
        agentName: entry.agentName,
        toolName: entry.toolName,
        paramsSummary: auditRecord.paramsSummary,
        status: entry.status,
        statusDetail: entry.detail || null,
      });
    } catch {
      // Non-blocking fallback
    }
  }

  return auditRecord;
}

export function getSparkMcpAuditLogs(limit = 50): SparkMcpAuditEntry[] {
  return auditMemoryLog.slice(0, limit);
}

export function clearSparkMcpAuditLogsForTests(): void {
  auditMemoryLog.length = 0;
}
