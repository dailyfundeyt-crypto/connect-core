/**
 * T3-Bridge — Nachrichten & Threads (A11)
 *
 * Öffentliche Modul-Schnittstelle.
 */

export * from "./types.js";
export * from "./status.js";
export * from "./store.js";
export * from "./idempotency.js";
export * from "./history.js";
export * from "./service.js";

import { T3ThreadService, type T3ThreadServiceOptions } from "./service.js";

let globalThreadService: T3ThreadService | null = null;

/**
 * Erzeugt eine neue Instanz des T3ThreadService.
 */
export function createThreadService(options: T3ThreadServiceOptions): T3ThreadService {
  return new T3ThreadService(options);
}

/**
 * Liefert den globalen T3ThreadService (Singleton).
 */
export function getGlobalThreadService(): T3ThreadService | null {
  return globalThreadService;
}

/**
 * Setzt den globalen T3ThreadService (für Server-Verdrahtung oder Tests).
 */
export function setGlobalThreadService(service: T3ThreadService | null): void {
  globalThreadService = service;
}
