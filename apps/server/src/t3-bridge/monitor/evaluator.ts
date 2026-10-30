/**
 * T3-Bridge — Drosselungs-Auswertung (Throttling Evaluator).
 *
 * Lane: A09 (Welle W1).
 *
 * Prüft die Messwerte gegen die Schwellenwerte:
 * 1. CPU > 85 % (30 s ununterbrochen oder im 30s-Durchschnitt)
 * 2. Freier RAM < 4 GB
 * 3. Freie Platte C: < 20 GB
 *
 * Wenn eine oder mehrere Bedingungen zutreffen, wird `throttled = true` gesetzt.
 */

import type {
  CpuMetrics,
  DiskMetrics,
  RamMetrics,
  ResourceLimits,
  ThrottleEvaluation,
} from "./types";
import { DEFAULT_RESOURCE_LIMITS } from "./types";

export interface EvaluateThrottleInput {
  readonly cpu: CpuMetrics;
  readonly ram: RamMetrics;
  readonly disk: DiskMetrics;
  readonly limits?: Partial<ResourceLimits>;
  readonly cpuSustainedDurationMs?: number;
}

const DEFAULT_CPU_SUSTAINED_DURATION_MS = 30_000;

/**
 * Bewertet die aktuellen Metriken gegen die definierten Ressourcenlimits.
 */
export function evaluateThrottling(input: EvaluateThrottleInput): ThrottleEvaluation {
  const maxCpu = input.limits?.maxCpuPercent ?? DEFAULT_RESOURCE_LIMITS.maxCpuPercent;
  const minRam = input.limits?.minFreeRamGb ?? DEFAULT_RESOURCE_LIMITS.minFreeRamGb;
  const minDisk = input.limits?.minFreeDiskGb ?? DEFAULT_RESOURCE_LIMITS.minFreeDiskGb;
  const sustainedMs = input.cpuSustainedDurationMs ?? DEFAULT_CPU_SUSTAINED_DURATION_MS;

  const reasons: string[] = [];

  // 1. CPU-Prüfung: > 85 % für mindestens 30 Sekunden
  const cpuOverloadedByDuration = input.cpu.highCpuDurationMs >= sustainedMs;
  const cpuOverloadedByAverage =
    input.cpu.average30sPercent >= maxCpu && input.cpu.samplesCount >= 6;
  const cpuOverloaded = cpuOverloadedByDuration || cpuOverloadedByAverage;

  if (cpuOverloaded) {
    const detail =
      input.cpu.highCpuDurationMs > 0
        ? `${input.cpu.currentPercent} % (seit ${Math.round(input.cpu.highCpuDurationMs / 1000)} s)`
        : `${input.cpu.average30sPercent} % im 30s-Schnitt`;
    reasons.push(`Hohe CPU-Auslastung: ${detail} (Schwelle: > ${maxCpu} % für 30 s)`);
  }

  // 2. RAM-Prüfung: < 4 GB freier Arbeitsspeicher
  const ramLow = input.ram.freeGb < minRam;
  if (ramLow) {
    reasons.push(
      `Wenig freier Arbeitsspeicher: ${input.ram.freeGb} GB frei (Schwelle: < ${minRam} GB)`,
    );
  }

  // 3. Festplatten-Prüfung: < 20 GB freier Speicherplatz auf C:
  const diskLow = input.disk.freeGb < minDisk;
  if (diskLow) {
    reasons.push(
      `Wenig freier Speicherplatz auf ${input.disk.drive}: ${input.disk.freeGb} GB frei (Schwelle: < ${minDisk} GB)`,
    );
  }

  const throttled = cpuOverloaded || ramLow || diskLow;
  const summaryReason = reasons.length > 0 ? reasons.join("; ") : undefined;

  return {
    throttled,
    reasons,
    summaryReason,
    cpuOverloaded,
    ramLow,
    diskLow,
  };
}
