/**
 * T3-Bridge — Turn-Steuerung & Freigaben: Modul-Fassade (Lane A13).
 *
 * Exporte für andere Lanes:
 *  - Turn-Steuerung: `interrupt`, `steer`
 *  - Freigaben: `respondToApproval`, `getPendingApprovals`
 *  - Richtlinie: `evaluatePathApproval`, `evaluateCommandApproval`, `evaluateRuntimeRequestAction`
 *  - Fähigkeiten: `getProviderControlCapabilities`, `toT3Capabilities`
 *  - Singleton: `getGlobalControlService`, `createControlService`
 */

export * from "./types.js";
export * from "./capabilities.js";
export * from "./policy.js";
export * from "./store.js";
export * from "./service.js";

import { T3ControlService, type T3ControlServiceOptions } from "./service.js";

let globalControlService: T3ControlService | null = null;

/**
 * Erstellt eine neue Instanz des T3ControlService.
 */
export function createControlService(
  options?: T3ControlServiceOptions,
): T3ControlService {
  return new T3ControlService(options);
}

/**
 * Liefert den prozessweiten globalen Singleton des Control-Services.
 */
export function getGlobalControlService(): T3ControlService {
  if (!globalControlService) {
    globalControlService = new T3ControlService();
  }
  return globalControlService;
}

/**
 * Überschreibt den globalen Singleton (für Tests und DI).
 */
export function setGlobalControlService(service: T3ControlService | null): void {
  globalControlService = service;
}
