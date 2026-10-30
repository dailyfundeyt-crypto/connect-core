/**
 * T3-Bridge — Kontext-Rotation alle 100 000 Tokens (Lane A15): Öffentliche Modul-Fassade
 *
 * EIGENTÜMER: A15 (Kontext-Rotation).
 *
 * Stellt den ContextRotationManager, den TokenTracker, die ContextPolicyRegistry,
 * die Event-Helfer und globale Singleton-Funktionen bereit.
 */

import { ContextRotationManager } from "./manager.js";
import type { ContextRotationManagerOptions } from "./types.js";

export * from "./types.js";
export * from "./token-tracker.js";
export * from "./policy-registry.js";
export * from "./events.js";
export * from "./manager.js";

/* ---------------------------------------------------------------------------------------- *
 * Singleton-Verwaltung für Server-Laufzeit (A37) und Tests
 * ---------------------------------------------------------------------------------------- */

let globalRotationManager: ContextRotationManager | null = null;

/**
 * Erzeugt eine neue Instanz des ContextRotationManagers.
 */
export function createContextRotationManager(
  options: ContextRotationManagerOptions = {},
): ContextRotationManager {
  return new ContextRotationManager(options);
}

/**
 * Holt den globalen ContextRotationManager oder initialisiert einen Standardmanager.
 */
export function getGlobalContextRotationManager(): ContextRotationManager {
  if (!globalRotationManager) {
    globalRotationManager = new ContextRotationManager();
  }
  return globalRotationManager;
}

/**
 * Setzt den globalen ContextRotationManager (z. B. bei der Server-Initialisierung in A37).
 */
export function setGlobalContextRotationManager(
  manager: ContextRotationManager,
): void {
  globalRotationManager = manager;
}

/**
 * Setzt den globalen ContextRotationManager zurück (für Tests).
 */
export function resetGlobalContextRotationManager(): void {
  globalRotationManager = null;
}
