/**
 * T3-Bridge — CPU-Messung & Verlaufstracker.
 *
 * Lane: A09 (Welle W1).
 *
 * Misst die CPU-Auslastung ohne Admin-Rechte über `node:os.cpus()` und
 * berechnet den gleitenden Durchschnitt sowie die Verweildauer über der
 * 85%-Schwelle (Aufgabe 2: CPU > 85 % für 30 s).
 */

import { cpus } from "node:os";
import type { CpuMetrics, CpuTickSnapshot } from "./types";

/**
 * Liest die aktuellen CPU-Ticks aller Kerne aus `node:os.cpus()`.
 * Kostet typischerweise < 0.05 ms und benötigt keinerlei Admin-Rechte.
 */
export function sampleCpuTicks(nowFn: () => number = Date.now): CpuTickSnapshot {
  const logicalCpus = cpus();
  let totalTicks = 0;
  let idleTicks = 0;

  for (let i = 0; i < logicalCpus.length; i++) {
    const times = logicalCpus[i].times;
    totalTicks += times.user + times.nice + times.sys + times.idle + times.irq;
    idleTicks += times.idle;
  }

  return {
    idle: idleTicks,
    total: totalTicks,
    timestamp: nowFn(),
    cores: Math.max(1, logicalCpus.length),
  };
}

/**
 * Berechnet die CPU-Auslastung in Prozent (0.0 bis 100.0) aus zwei Ticks-Snapshots.
 */
export function calculateCpuPercent(
  prev: CpuTickSnapshot,
  curr: CpuTickSnapshot,
): number {
  const deltaTotal = curr.total - prev.total;
  const deltaIdle = curr.idle - prev.idle;

  if (deltaTotal <= 0) {
    return 0;
  }

  const idleRatio = Math.max(0, Math.min(1, deltaIdle / deltaTotal));
  const percent = (1 - idleRatio) * 100;

  return Math.round(percent * 10) / 10;
}

export interface CpuSampleEntry {
  readonly percent: number;
  readonly timestamp: number;
}

/**
 * Verfolgt den Verlauf der CPU-Messungen im Zeitfenster (Standard: 30 Sekunden)
 * und ermittelt, ob die Last dauerhaft (> 85 % seit 30 s) kritisch ist.
 */
export class CpuHistoryTracker {
  private samples: CpuSampleEntry[] = [];
  private highCpuSince: number | null = null;
  private lastSamplePercent = 0;

  constructor(
    private readonly windowMs: number = 30_000,
    private readonly thresholdPercent: number = 85,
    private readonly nowFn: () => number = Date.now,
  ) {}

  /**
   * Fügt einen neuen Messwert hinzu und aktualisiert den Zustand.
   */
  public addSample(percent: number, timestamp: number = this.nowFn()): void {
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
    this.lastSamplePercent = clampedPercent;

    this.samples.push({ percent: clampedPercent, timestamp });
    this.pruneOldSamples(timestamp);

    // Schwellen-Dauer überwachen
    if (clampedPercent >= this.thresholdPercent) {
      if (this.highCpuSince === null) {
        this.highCpuSince = timestamp;
      }
    } else {
      // Last wieder unter Schwelle gefallen -> Zähler zurücksetzen
      this.highCpuSince = null;
    }
  }

  /**
   * Berechnet den gleitenden Durchschnitt über das konfigurierte Zeitfenster (z. B. 30 s).
   */
  public getAverage(): number {
    if (this.samples.length === 0) {
      return this.lastSamplePercent;
    }
    const sum = this.samples.reduce((acc, s) => acc + s.percent, 0);
    return Math.round((sum / this.samples.length) * 10) / 10;
  }

  /**
   * Gibt an, ob die CPU ununterbrochen für mindestens die geforderte Dauer
   * (Standard 30 s) über der Schwelle liegt.
   */
  public isSustainedOverload(
    requiredDurationMs: number = this.windowMs,
    currentTime: number = this.nowFn(),
  ): boolean {
    if (this.highCpuSince === null) {
      return false;
    }

    const duration = currentTime - this.highCpuSince;
    if (duration >= requiredDurationMs) {
      return true;
    }

    // Zusätzlicher Schutz: Falls der 30s-Durchschnitt >= Schwelle ist
    // und das Zeitfenster voll abgedeckt ist (mindestens 30s Historie)
    if (this.samples.length >= 2) {
      const oldest = this.samples[0].timestamp;
      const newest = this.samples[this.samples.length - 1].timestamp;
      if (newest - oldest >= requiredDurationMs && this.getAverage() >= this.thresholdPercent) {
        return true;
      }
    }

    return false;
  }

  /**
   * Liefert das aggregierte CpuMetrics-Objekt.
   */
  public getMetrics(cores: number, currentTime: number = this.nowFn()): CpuMetrics {
    const highCpuDurationMs =
      this.highCpuSince !== null ? Math.max(0, currentTime - this.highCpuSince) : 0;

    return {
      currentPercent: this.lastSamplePercent,
      average30sPercent: this.getAverage(),
      cores,
      samplesCount: this.samples.length,
      highCpuSince: this.highCpuSince,
      highCpuDurationMs,
    };
  }

  /**
   * Löscht Einträge, die älter als das Fenster sind.
   */
  private pruneOldSamples(currentTime: number): void {
    const cutoff = currentTime - this.windowMs;
    while (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }
  }

  /**
   * Setzt den Verlauf zurück (z. B. für Tests).
   */
  public reset(): void {
    this.samples = [];
    this.highCpuSince = null;
    this.lastSamplePercent = 0;
  }
}
