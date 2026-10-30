import type { BrainAccessLogItem } from "./types";

const MAX_IN_MEMORY_LOGS = 500;
const memoryLogs: BrainAccessLogItem[] = [];

// Seed some initial access log history for known agent
const INITIAL_LOGS: BrainAccessLogItem[] = [
  {
    id: "log_init_01",
    agentId: "persistenz-test-agent",
    action: "read",
    path: "Knowledge/Spark/MAP.md",
    allowed: true,
    durationMs: 12,
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
  },
  {
    id: "log_init_02",
    agentId: "persistenz-test-agent",
    action: "read",
    path: "Projects/Projekt Spark.md",
    allowed: true,
    durationMs: 8,
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: "log_init_03",
    agentId: "persistenz-test-agent",
    action: "write",
    path: "Projects/Projekt Spark.md",
    allowed: true,
    durationMs: 45,
    timestamp: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
  },
  {
    id: "log_init_04",
    agentId: "persistenz-test-agent",
    action: "read",
    path: "Shared/Sperrdatei.md",
    allowed: false,
    durationMs: 5,
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "log_init_05",
    agentId: "hermes-default",
    action: "read",
    path: "00 A CNT/CNT Connect Plan.md",
    allowed: true,
    durationMs: 19,
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
];

memoryLogs.push(...INITIAL_LOGS);

export function recordBrainAccess(item: Omit<BrainAccessLogItem, "id" | "timestamp"> & { id?: string; timestamp?: string }): BrainAccessLogItem {
  const fullItem: BrainAccessLogItem = {
    id: item.id || `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    agentId: item.agentId,
    action: item.action,
    path: item.path,
    allowed: item.allowed,
    durationMs: item.durationMs ?? 0,
    timestamp: item.timestamp || new Date().toISOString(),
  };

  memoryLogs.unshift(fullItem);
  if (memoryLogs.length > MAX_IN_MEMORY_LOGS) {
    memoryLogs.pop();
  }

  return fullItem;
}

export function getRecentBrainAccess(agentId?: string, limit = 50): BrainAccessLogItem[] {
  let list = memoryLogs;
  if (agentId && agentId !== "all") {
    list = list.filter((l) => l.agentId === agentId || l.agentId.toLowerCase() === agentId.toLowerCase());
  }
  return list.slice(0, limit);
}
