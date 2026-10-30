/**
 * T3-Bridge — RAM-Messung.
 *
 * Lane: A09 (Welle W1).
 *
 * Misst den freien und belegten Arbeitsspeicher ohne Admin-Rechte über `node:os`.
 * Schneller Systemaufruf (< 0.01 ms).
 */

import { freemem, totalmem } from "node:os";
import type { RamMetrics } from "./types";

const BYTES_PER_GB = 1024 * 1024 * 1024;

/**
 * Optionen für die RAM-Messung (ermöglicht Injektion gefälschter Werte in Tests).
 */
export interface RamSamplerOptions {
  getFreeBytes?: () => number;
  getTotalBytes?: () => number;
}

/**
 * Führt eine Messung des Arbeitsspeichers durch.
 */
export function sampleRam(options?: RamSamplerOptions): RamMetrics {
  const freeBytes = options?.getFreeBytes ? options.getFreeBytes() : freemem();
  const totalBytes = options?.getTotalBytes ? options.getTotalBytes() : totalmem();

  const freeGb = Math.round((Math.max(0, freeBytes) / BYTES_PER_GB) * 100) / 100;
  const totalGb = Math.round((Math.max(0, totalBytes) / BYTES_PER_GB) * 100) / 100;
  const usedGb = Math.round(Math.max(0, totalGb - freeGb) * 100) / 100;

  const percentUsed =
    totalGb > 0
      ? Math.round((usedGb / totalGb) * 1000) / 10
      : 0;

  return {
    freeGb,
    totalGb,
    usedGb,
    percentUsed: Math.max(0, Math.min(100, percentUsed)),
  };
}
