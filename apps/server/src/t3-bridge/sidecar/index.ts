/**
 * T3-Sidecar-Supervisor — Hauptmodul.
 *
 * Lane: A02 (Welle W1).
 */

import { T3SidecarSupervisor } from "./supervisor";
import type { T3SidecarStatus } from "./types";

export * from "./types";
export * from "./config";
export * from "./ports";
export * from "./runtime-file";
export * from "./health";
export * from "./backoff";
export * from "./logger";
export * from "./supervisor";

let globalSupervisor: T3SidecarSupervisor | null = null;

/**
 * Gibt die Singleton-Instanz des T3-Sidecar-Supervisors zurück.
 */
export function getT3Supervisor(): T3SidecarSupervisor {
  if (!globalSupervisor) {
    globalSupervisor = new T3SidecarSupervisor();
  }
  return globalSupervisor;
}

/**
 * Hilfsfunktion zum bequemen Starten des Sidecars.
 */
export async function startT3Sidecar(options?: { force?: boolean }): Promise<T3SidecarStatus> {
  const supervisor = getT3Supervisor();
  return supervisor.start(options);
}

/**
 * Hilfsfunktion zum kontrollierten Stoppen des Sidecars.
 */
export async function stopT3Sidecar(): Promise<void> {
  if (globalSupervisor) {
    await globalSupervisor.stop();
  }
}

/**
 * Hilfsfunktion zur Abfrage des aktuellen Sidecar-Status.
 */
export function getT3SidecarStatus(): T3SidecarStatus {
  return getT3Supervisor().getStatus();
}
