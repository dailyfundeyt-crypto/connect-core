/**
 * Resource-Monitor für Swarm-Controller (Phase E Schritt 20).
 *
 * Überwacht CPU-Auslastung und RAM-Verbrauch des Systems in Echtzeit.
 * Ermöglicht es dem Scheduler, Grenzen für CPU/RAM durchzusetzen,
 * damit bis zu 20 parallele Browser-Agenten das Host-System nicht überlasten.
 */

import * as os from "node:os";
import type { SwarmLimits, SystemMetrics } from "./swarm-types";

type CpuSnapshot = {
  idle: number;
  total: number;
};

function readCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    const times = cpu.times;
    const coreTotal = times.user + times.nice + times.sys + times.idle + times.irq;
    idle += times.idle;
    total += coreTotal;
  }

  return { idle, total };
}

export class ResourceMonitor {
  private lastSnapshot: CpuSnapshot = readCpuSnapshot();
  private lastCpuPercent = 0;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.updateCpu();
    // Regelmäßiges CPU-Sampling im Hintergrund alle 2 Sekunden
    this.intervalTimer = setInterval(() => {
      this.updateCpu();
    }, 2000);
    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private updateCpu(): number {
    const current = readCpuSnapshot();
    const deltaIdle = current.idle - this.lastSnapshot.idle;
    const deltaTotal = current.total - this.lastSnapshot.total;

    this.lastSnapshot = current;

    if (deltaTotal > 0) {
      const busy = 1 - deltaIdle / deltaTotal;
      this.lastCpuPercent = Math.max(0, Math.min(100, Math.round(busy * 1000) / 10));
    }

    return this.lastCpuPercent;
  }

  /**
   * Liefert die aktuellen Systemmetriken (CPU in %, RAM in MB & %).
   */
  public getMetrics(): SystemMetrics {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const totalMemMb = Math.round(totalMem / (1024 * 1024));
    const freeMemMb = Math.round(freeMem / (1024 * 1024));
    const usedMemMb = Math.round(usedMem / (1024 * 1024));
    const memPercent = Math.round((usedMem / totalMem) * 1000) / 10;

    return {
      cpuPercent: this.lastCpuPercent,
      totalMemMb,
      freeMemMb,
      usedMemMb,
      memPercent,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Prüft, ob die Systemressourcen innerhalb der konfigurierten Grenzen liegen.
   * Wenn nicht, meldet er dem Scheduler, dass das Starten weiterer Tasks pausiert werden soll.
   */
  public checkLimits(limits: SwarmLimits): { allowed: boolean; reason?: string; metrics: SystemMetrics } {
    const metrics = this.getMetrics();

    // 1. RAM-Grenzen prüfen
    if (metrics.freeMemMb < limits.minFreeMemMb) {
      return {
        allowed: false,
        reason: `Arbeitsspeicher-Grenze erreicht: Nur noch ${metrics.freeMemMb} MB frei (Minimum: ${limits.minFreeMemMb} MB)`,
        metrics,
      };
    }

    if (metrics.memPercent > limits.maxMemPercent) {
      return {
        allowed: false,
        reason: `RAM-Auslastung zu hoch: ${metrics.memPercent}% (Maximum: ${limits.maxMemPercent}%)`,
        metrics,
      };
    }

    // 2. CPU-Grenzen prüfen
    if (metrics.cpuPercent > limits.maxCpuPercent || limits.maxCpuPercent <= 0) {
      return {
        allowed: false,
        reason: `CPU-Auslastung zu hoch: ${metrics.cpuPercent}% (Maximum: ${limits.maxCpuPercent}%)`,
        metrics,
      };
    }

    return { allowed: true, metrics };
  }
}

let monitorInstance: ResourceMonitor | null = null;

export function getResourceMonitor(): ResourceMonitor {
  if (!monitorInstance) {
    monitorInstance = new ResourceMonitor();
  }
  return monitorInstance;
}
