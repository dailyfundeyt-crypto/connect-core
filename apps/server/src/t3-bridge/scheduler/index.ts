/**
 * T3-Bridge — Scheduler & Gleichzeitigkeit (A08)
 *
 * Öffentliche Modul-Schnittstelle.
 */

export * from "./types.js";
export * from "./clock.js";
export * from "./queue.js";
export * from "./agent-state.js";
export * from "./scheduler.js";

import { T3Scheduler } from "./scheduler.js";
import type { PartialSchedulerConfig } from "./types.js";

let globalScheduler: T3Scheduler | null = null;

/**
 * Erzeugt eine neue Instanz des T3-Schedulers.
 */
export function createScheduler(options?: {
  config?: PartialSchedulerConfig;
  bypassWhenFlagDisabled?: boolean;
}): T3Scheduler {
  return new T3Scheduler(options);
}

/**
 * Liefert den globalen T3-Scheduler (Singleton für den Connect-Server).
 */
export function getGlobalScheduler(): T3Scheduler {
  if (!globalScheduler) {
    globalScheduler = new T3Scheduler();
  }
  return globalScheduler;
}

/**
 * Setzt den globalen T3-Scheduler (für Tests oder Reinitialisierung).
 */
export function setGlobalScheduler(scheduler: T3Scheduler | null): void {
  if (globalScheduler && globalScheduler !== scheduler) {
    globalScheduler.dispose();
  }
  globalScheduler = scheduler;
}
