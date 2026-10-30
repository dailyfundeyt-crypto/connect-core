/**
 * T3-Bridge-Auth â€” Typen & Schnittstellen (Lane A10).
 *
 * ZIEL: Sichere Verbindung Connect-Server â†” T3-Sidecar; Browser bekommt nie T3-Tokens.
 *
 * Regeln:
 * - Diese Typen dÃ¼rfen niemals Token- oder Secret-Felder in Ã¶ffentlich
 *   ausgelieferten Status-Objekten enthalten.
 * - Klare Trennung zwischen serverseitigen internen Token-TrÃ¤gern und
 *   sicheren Status-Antworten fÃ¼r den Browser.
 */

import type { AuthenticatedActor, AuthService, RoleRepository } from "../../auth/guards";

/**
 * Status der T3-Sidecar-Kopplung (fÃ¼r Browser/UI geeignet).
 * EnthÃ¤lt garantiert KEIN Token, Chiffrat oder Geheimnis.
 */
export interface T3AuthStatus {
  readonly ok: boolean;
  readonly running: boolean;
  readonly paired: boolean;
  readonly origin: string | null;
  readonly serverVersion?: string | null;
  readonly expiresAt?: string | null;
  readonly message?: string;
}

/**
 * Serverseitiger Status des Token-Tresors.
 * EnthÃ¤lt ausschlieÃŸlich Metadaten, niemals Klartext-SchlÃ¼ssel.
 */
export interface T3TokenStatus {
  readonly paired: boolean;
  readonly origin: string | null;
  readonly expiresAt: string | null;
  readonly hasEncryptedStorage: boolean;
  readonly source: string | null;
}

/**
 * Serverseitige Token-Nutzlast vor der AES-GCM-VerschlÃ¼sselung.
 * Verbleibt strikt auf dem Server.
 */
export interface T3TokenPayload {
  readonly token: string;
  readonly origin?: string;
  readonly expiresAt?: string;
  readonly createdAt: string;
  readonly source: "cli-pair" | "env" | "oauth-exchange" | "manual";
}

/**
 * Schnittstelle fÃ¼r den sicheren Token-Tresor.
 */
export interface IT3TokenVault {
  saveToken(
    token: string,
    metadata?: {
      origin?: string;
      expiresAt?: string | Date;
      source?: T3TokenPayload["source"];
    },
  ): Promise<void>;
  getToken(): Promise<string | null>;
  hasToken(): Promise<boolean>;
  getStatus(): Promise<T3TokenStatus>;
  clearToken(): Promise<void>;
}

/**
 * Optionen fÃ¼r das Pairing mit dem T3-Sidecar.
 */
export interface T3PairingOptions {
  /** Optionaler Origin des T3-Sidecars (Default: http://127.0.0.1:3773). */
  origin?: string;
  /** Bevorzugter Host fÃ¼r die CLI-Kopplung. */
  preferHost?: string | null;
  /** Time-To-Live fÃ¼r das Pairing-Token (Default: "15m"). */
  ttl?: string;
  /** Label fÃ¼r die Session (Default: "Connect-T3-Bridge"). */
  label?: string;
  /** Pfad zur T3-CLI, falls bekannt. */
  cliPath?: string | null;
  /** Timeout in Millisekunden fÃ¼r den CLI-Aufruf (Default: 20000). */
  timeoutMs?: number;
}

/**
 * Ergebnis eines serverseitigen Pairing-Vorgangs.
 * Die Antwort enthÃ¤lt KEIN Token, da dieses direkt im Vault gespeichert wird.
 */
export interface T3PairingResult {
  readonly ok: boolean;
  readonly paired: boolean;
  readonly origin?: string;
  readonly expiresAt?: string;
  readonly error?: string;
}

/**
 * Optionen fÃ¼r die Better-Auth-Middleware der T3-Routen.
 */
export interface T3AuthMiddlewareOptions {
  /** Better-Auth-Instanz des Connect-Servers. */
  auth?: AuthService;
  /** Rollen-Repository fÃ¼r Connect-Berechtigungen. */
  roleRepository?: RoleRepository;
  /** Ob Single-User-Modus (Dev) aktiv ist. */
  singleUser?: boolean;
}

export type { AuthenticatedActor, AuthService, RoleRepository };
