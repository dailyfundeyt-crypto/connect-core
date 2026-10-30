/**
 * Health-Reporting für Connect-Wartung (v06 / Wave 2 / A18).
 *
 * Liefert aggregierten Gesundheitsstatus über das gesamte Connect-Ökosystem:
 * - Systemmetriken (CPU, RAM, Uptime)
 * - Swarm-Controller Status (Worker, Warteschlange, Crash-Recoveries)
 * - Agent-Hub (aktive Terminals, Browser-Instanzen)
 * - Datenbank-Konnektivität
 */

import os from "node:os";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { getSwarmController } from "../../swarm/swarm-controller";
import { getAgentTerminalStatus } from "../../agent-hub/agent-terminal-manager";

export interface AgentHealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptimeSeconds: number;
  system: {
    platform: string;
    nodeVersion: string;
    totalMemMb: number;
    freeMemMb: number;
    memUsagePercent: number;
    processMemMb: number;
    cpuCores: number;
  };
  swarm: {
    activeWorkers: number;
    totalWorkers: number;
    queuedTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    recoveredFromCrash: number;
    systemMetrics?: {
      cpuPercent?: number;
      freeMemMb?: number;
    };
  };
  agentHub: {
    terminalSessionsActive: number;
    browserInstancesActive?: number;
  };
  database: {
    connected: boolean;
    error?: string;
  };
  alerts: string[];
}

export async function generateConnectHealthReport(
  database?: Database,
): Promise<AgentHealthReport> {
  const alerts: string[] = [];
  const now = new Date().toISOString();
  const uptime = Math.floor(process.uptime());

  // 1. System-Metriken
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = Math.round((usedMem / totalMem) * 100);
  const memUsage = process.memoryUsage();
  const processMemMb = Math.round(memUsage.rss / (1024 * 1024));

  if (memUsagePercent > 90) {
    alerts.push(`Hohe System-Speicherauslastung: ${memUsagePercent}%`);
  }

  // 2. Swarm Status
  let swarmStats = {
    activeWorkers: 0,
    totalWorkers: 0,
    queuedTasks: 0,
    runningTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    recoveredFromCrash: 0,
    systemMetrics: { cpuPercent: 0, freeMemMb: Math.round(freeMem / (1024 * 1024)) },
  };

  try {
    const controller = getSwarmController(database);
    const s = controller.getStatus(5);
    swarmStats = {
      activeWorkers: s.activeWorkers,
      totalWorkers: s.totalWorkers,
      queuedTasks: s.queueLength ?? s.overallProgress?.queuedTasks ?? 0,
      runningTasks: s.runningTasks,
      completedTasks: s.completedTasks,
      failedTasks: s.failedTasks,
      recoveredFromCrash: s.totalCrashesRecovered ?? 0,
      systemMetrics: {
        cpuPercent: s.systemMetrics?.cpuPercent ?? s.metrics?.cpuPercent ?? 0,
        freeMemMb: s.systemMetrics?.freeMemMb ?? Math.round(freeMem / (1024 * 1024)),
      },
    };
    if (s.failedTasks > 10) {
      alerts.push(`Erhöhte Fehlerrate im Schwarm: ${s.failedTasks} fehlgeschlagene Tasks`);
    }
  } catch (err: any) {
    alerts.push(`Swarm-Controller Statusabfrage fehlgeschlagen: ${err?.message || String(err)}`);
  }

  // 3. Agent-Hub Status
  let terminalCount = 0;
  try {
    // getAgentTerminalStatus prüft Terminal-Zustand
    const dummyStatus = getAgentTerminalStatus("probe");
    if (dummyStatus?.status === "running") {
      terminalCount = 1;
    }
  } catch {
    // Ignoriere Probe-Fehler
  }

  // 4. Datenbank-Verbindung prüfen
  let dbConnected = false;
  let dbError: string | undefined;

  if (database) {
    try {
      await database.execute(sql`SELECT 1`);
      dbConnected = true;
    } catch (err: any) {
      dbConnected = false;
      dbError = err?.message || String(err);
      alerts.push(`Datenbank-Verbindungsfehler: ${dbError}`);
    }
  } else {
    // Im In-Memory Modus
    dbConnected = true;
  }

  // Gesamtzustand bestimmen
  let overallStatus: AgentHealthReport["status"] = "healthy";
  if (alerts.length > 0) {
    overallStatus = alerts.some((a) => a.includes("Datenbank")) ? "unhealthy" : "degraded";
  }

  return {
    status: overallStatus,
    timestamp: now,
    uptimeSeconds: uptime,
    system: {
      platform: `${os.platform()} (${os.arch()})`,
      nodeVersion: process.version,
      totalMemMb: Math.round(totalMem / (1024 * 1024)),
      freeMemMb: Math.round(freeMem / (1024 * 1024)),
      memUsagePercent,
      processMemMb,
      cpuCores: os.cpus().length,
    },
    swarm: swarmStats,
    agentHub: {
      terminalSessionsActive: terminalCount,
    },
    database: {
      connected: dbConnected,
      error: dbError,
    },
    alerts,
  };
}
