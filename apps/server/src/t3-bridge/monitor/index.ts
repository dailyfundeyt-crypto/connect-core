/**
 * T3-Bridge — Ressourcen-Monitor (PC-Last) Modul.
 *
 * Lane: A09 (Welle W1).
 *
 * Zentraler Einstiegspunkt für Scheduler (A08), Flotten-Ansicht (A36) und
 * Server-Verdrahtung (A37).
 */

import { ResourceMonitor } from "./monitor";
import type {
  DetailedResourceMetrics,
  ResourceMonitorOptions,
  ResourceMonitorStatus,
  ResourceSnapshot,
} from "./types";

export * from "./types";
export * from "./monitor";
export * from "./evaluator";
export * from "./cpu-sampler";
export * from "./ram-sampler";
export * from "./disk-sampler";
export * from "./process-sampler";

let globalMonitorInstance: ResourceMonitor | null = null;

/**
 * Liefert die Singleton-Instanz des Ressourcen-Monitors.
 */
export function getResourceMonitor(options?: ResourceMonitorOptions): ResourceMonitor {
  if (!globalMonitorInstance) {
    globalMonitorInstance = new ResourceMonitor(options);
  }
  return globalMonitorInstance;
}

/**
 * Startet den Ressourcen-Monitor.
 */
export async function startResourceMonitor(options?: {
  force?: boolean;
}): Promise<ResourceMonitorStatus> {
  return await getResourceMonitor().start(options);
}

/**
 * Stoppt den Ressourcen-Monitor.
 */
export function stopResourceMonitor(): ResourceMonitorStatus {
  if (!globalMonitorInstance) {
    return {
      running: false,
      intervalMs: 5000,
      startedAt: null,
      sampleCount: 0,
      lastSampleAt: null,
      throttled: false,
    };
  }
  return globalMonitorInstance.stop();
}

/**
 * Schnelle Abfrage für den Scheduler: Ist Drosselung aktiv?
 */
export function isSchedulerThrottled(): boolean {
  return getResourceMonitor().isThrottled();
}

/**
 * Schnelle Abfrage für den Scheduler: Darf ein Turn gestartet werden?
 */
export function canSchedulerStartTurn(): { allowed: boolean; reason?: string } {
  return getResourceMonitor().canStartTurn();
}

/**
 * Liefert den aktuellen Snapshot für Standard-Endpunkte (`/t3/status` oder Scheduler).
 */
export function getResourceSnapshot(): ResourceSnapshot {
  return getResourceMonitor().getSnapshot();
}

/**
 * Liefert detaillierte Metriken für die Flotten-Ansicht (A36).
 */
export function getDetailedResourceMetrics(): DetailedResourceMetrics {
  return getResourceMonitor().getDetailedMetrics();
}

/**
 * Setzt die Singleton-Instanz zurück (vor allem für Tests nützlich).
 */
export function resetResourceMonitorSingleton(): void {
  if (globalMonitorInstance) {
    globalMonitorInstance.stop();
    globalMonitorInstance = null;
  }
}
