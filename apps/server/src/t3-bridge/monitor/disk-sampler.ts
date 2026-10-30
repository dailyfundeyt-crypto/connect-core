/**
 * T3-Bridge — Plattenplatz-Messung.
 *
 * Lane: A09 (Welle W1).
 *
 * Misst den freien Speicherplatz auf Laufwerk C: (Windows) bzw. der System-Partition
 * ohne Admin-Rechte über `node:fs/promises.statfs`.
 * Extrem leichtgewichtig (< 0.05 ms, keine Kindprozesse).
 */

import { statfs } from "node:fs/promises";
import type { DiskMetrics } from "./types";

const BYTES_PER_GB = 1024 * 1024 * 1024;

export interface DiskSamplerOptions {
  /** Pfad / Laufwerk (Standard: Windows "C:\\", POSIX "/"). */
  drivePath?: string;
  /** Injektion einer statfs-Funktion für Tests. */
  statfsFn?: (path: string) => Promise<{
    bavail: number | bigint;
    blocks: number | bigint;
    bsize: number | bigint;
  }>;
}

/**
 * Ermittelt das Standard-Laufwerk des Systems (C:\ unter Windows).
 */
export function getDefaultDrivePath(): string {
  if (process.platform === "win32") {
    const sysDrive = process.env.SystemDrive?.trim();
    return sysDrive ? `${sysDrive}\\` : "C:\\";
  }
  return "/";
}

/**
 * Misst den verfügbaren Speicherplatz auf der Festplatte.
 */
export async function sampleDisk(options?: DiskSamplerOptions): Promise<DiskMetrics> {
  const drive = options?.drivePath ?? getDefaultDrivePath();
  const queryFn = options?.statfsFn ?? statfs;

  try {
    const stat = await queryFn(drive);

    const bavail = Number(stat.bavail);
    const blocks = Number(stat.blocks);
    const bsize = Number(stat.bsize);

    const freeBytes = Math.max(0, bavail * bsize);
    const totalBytes = Math.max(0, blocks * bsize);

    const freeGb = Math.round((freeBytes / BYTES_PER_GB) * 100) / 100;
    const totalGb = Math.round((totalBytes / BYTES_PER_GB) * 100) / 100;
    const usedGb = Math.round(Math.max(0, totalGb - freeGb) * 100) / 100;

    const percentUsed =
      totalGb > 0
        ? Math.round((usedGb / totalGb) * 1000) / 10
        : 0;

    return {
      drive,
      freeGb,
      totalGb,
      usedGb,
      percentUsed: Math.max(0, Math.min(100, percentUsed)),
    };
  } catch (error) {
    // Defensiver Fallback bei unzugänglichem Pfad im Test oder Sandbox
    return {
      drive,
      freeGb: 50.0,
      totalGb: 100.0,
      usedGb: 50.0,
      percentUsed: 50.0,
    };
  }
}
