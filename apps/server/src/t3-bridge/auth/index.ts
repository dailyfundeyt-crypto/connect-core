/**
 * T3-Bridge-Auth â€” Haupt-Export (Lane A10).
 *
 * ZIEL: Sichere Verbindung Connect-Server â†” T3-Sidecar; Browser bekommt nie T3-Tokens.
 */

import { createT3AuthMiddleware } from "./middleware";
import { findT3Cli, T3PairingService } from "./pairing";
import {
  isSensitiveKeyName,
  RedactedLogger,
  redactSensitiveData,
  redactSensitiveText,
} from "./redact";
import { createT3AuthRoutes } from "./routes";
import type { IT3TokenVault } from "./types";
import { T3TokenVault } from "./vault";

// Singletons fÃ¼r serverweiten Zugriff (z. B. fÃ¼r A03 RPC-Client & A37 Router)
let sharedVault: IT3TokenVault | null = null;
let sharedPairingService: T3PairingService | null = null;

/**
 * Gibt die gemeinsame Instanz des Token-Tresors zurÃ¼ck.
 */
export function getSharedTokenVault(): IT3TokenVault {
  if (!sharedVault) {
    sharedVault = new T3TokenVault();
  }
  return sharedVault;
}

/**
 * Setzt eine benutzerdefinierte Vault-Instanz (z. B. in Tests).
 */
export function setSharedTokenVault(vault: IT3TokenVault | null): void {
  sharedVault = vault;
}

/**
 * Gibt den gemeinsamen Pairing-Service zurÃ¼ck.
 */
export function getSharedPairingService(): T3PairingService {
  if (!sharedPairingService) {
    sharedPairingService = new T3PairingService(getSharedTokenVault());
  }
  return sharedPairingService;
}

export {
  T3TokenVault,
  T3PairingService,
  findT3Cli,
  createT3AuthMiddleware,
  createT3AuthRoutes,
  redactSensitiveText,
  redactSensitiveData,
  RedactedLogger,
  isSensitiveKeyName,
};

export type * from "./types";
