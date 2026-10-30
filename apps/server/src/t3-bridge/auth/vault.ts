/**
 * T3-Bridge-Auth â€” Verschluesselter Token-Tresor (Lane A10).
 *
 * Aufgabe 1:
 * Bearer/Pairing-Token serverseitig gespeichert (verschluesselt wie
 * Cloud-Agents-Keys, AES-GCM, vorhandenes Schluesselverfahren nutzen,
 * Schluessel nie ausgeben).
 *
 * Nutzt `encryptSecret` und `decryptSecret` aus `../../credentials`.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { decryptSecret, encryptSecret } from "../../credentials";
import { RedactedLogger, redactSensitiveData } from "./redact";
import type { IT3TokenVault, T3TokenPayload, T3TokenStatus } from "./types";

const logger = new RedactedLogger("T3TokenVault");

/**
 * Standard-Verzeichnis fÃ¼r den T3-Sidecar und seine Daten.
 */
function defaultT3StoragePath(): string {
  const localAppData =
    process.env.LOCALAPPDATA ||
    (process.platform === "win32"
      ? join(homedir(), "AppData", "Local")
      : join(homedir(), ".local", "share"));

  return join(localAppData, "ConnectAgents", "t3-home", "t3-bridge-token.enc");
}

/**
 * Ermittelt den 32-Byte-AES-GCM-SchlÃ¼ssel aus der Server-Konfiguration.
 * Falls nicht vorhanden (z. B. in lokalen Tests), wird ein konsistenter
 * Fallback-SchlÃ¼ssel fÃ¼r die Entwicklung bereitgestellt.
 */
function resolveEncryptionKey(customKey?: string): string {
  if (customKey && customKey.trim().length > 0) {
    return customKey.trim();
  }

  const envKey = process.env.KEY_ENCRYPTION_KEY?.trim();
  if (envKey && envKey.length > 0) {
    return envKey;
  }

  // 32 Bytes Base64-Fallback fÃ¼r Offline-/Test-Umgebungen (identisch mit dem Connect-Dev-Muster)
  return Buffer.from("t3-bridge-default-key-32-bytes!!").toString("base64");
}

export interface T3TokenVaultOptions {
  /** Pfad zur Datei, in der das Chiffrat gespeichert wird. */
  storagePath?: string;
  /** Benutzerdefinierter Base64-AES-SchlÃ¼ssel. */
  encryptionKey?: string;
  /** Ob ausschlieÃŸlich im Speicher gearbeitet werden soll (z. B. fÃ¼r Tests). */
  inMemoryOnly?: boolean;
}

export class T3TokenVault implements IT3TokenVault {
  readonly #storagePath: string;
  readonly #encryptionKey: string;
  readonly #inMemoryOnly: boolean;

  /** Cache im flÃ¼chtigen Speicher (immer entschluesselt nur zur Laufzeit, nie geloggt). */
  #cachedPayload: T3TokenPayload | null = null;

  constructor(options: T3TokenVaultOptions = {}) {
    this.#storagePath = options.storagePath || defaultT3StoragePath();
    this.#encryptionKey = resolveEncryptionKey(options.encryptionKey);
    this.#inMemoryOnly = options.inMemoryOnly ?? false;
  }

  /**
   * Speichert ein T3-Token verschluesselt (AES-GCM).
   * Schreibt das Chiffrat in die Datei und aktualisiert den In-Memory-Cache.
   */
  async saveToken(
    token: string,
    metadata: {
      origin?: string;
      expiresAt?: string | Date;
      source?: T3TokenPayload["source"];
    } = {},
  ): Promise<void> {
    if (!token || typeof token !== "string" || token.trim().length === 0) {
      throw new Error("Ungueltiges Token: darf nicht leer sein.");
    }

    const cleanToken = token.trim();
    let expiresAtStr: string | undefined;
    if (metadata.expiresAt instanceof Date) {
      expiresAtStr = metadata.expiresAt.toISOString();
    } else if (typeof metadata.expiresAt === "string") {
      expiresAtStr = metadata.expiresAt;
    }

    const payload: T3TokenPayload = {
      token: cleanToken,
      origin: metadata.origin,
      expiresAt: expiresAtStr,
      createdAt: new Date().toISOString(),
      source: metadata.source ?? "manual",
    };

    // 1. JSON-String verschluesseln mit AES-GCM
    const plaintext = JSON.stringify(payload);
    const ciphertext = await encryptSecret(this.#encryptionKey, plaintext);

    // 2. Speicher aktualisieren
    this.#cachedPayload = payload;

    // 3. Wenn persistent gewÃ¼nscht: Chiffrat schreiben
    if (!this.#inMemoryOnly) {
      try {
        const dir = dirname(this.#storagePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(this.#storagePath, ciphertext, "utf8");
        logger.info("T3-Token sicher verschluesselt auf Festplatte persistiert.", {
          origin: metadata.origin,
          source: payload.source,
        });
      } catch (error) {
        logger.error("Konnte verschluesseltes T3-Token nicht auf Festplatte schreiben", error);
        // Nicht zwingend abbrechen, da In-Memory-Cache existiert
      }
    }
  }

  /**
   * Liest das T3-Token fuer interne Server-Zwecke (RPC-Client, HTTP-Header).
   * Gibt `null` zurueck, falls kein Token existiert oder es abgelaufen ist.
   *
   * ACHTUNG: Der Rueckgabewert darf NIEMALS an den Browser oder in Logs gelangen!
   */
  async getToken(): Promise<string | null> {
    const payload = await this.#loadPayload();
    if (!payload) return null;

    if (this.#isExpired(payload)) {
      logger.warn("Gespeichertes T3-Token ist abgelaufen.");
      await this.clearToken();
      return null;
    }

    return payload.token;
  }

  /**
   * Prueft, ob ein gueltiges, nicht abgelaufenes Token vorliegt.
   */
  async hasToken(): Promise<boolean> {
    const token = await this.getToken();
    return token !== null && token.length > 0;
  }

  /**
   * Liefert den oeffentlichen Status des Token-Tresors.
   * GARANTIERT: Enthaelt niemals das Token, den Schluessel oder das Chiffrat.
   */
  async getStatus(): Promise<T3TokenStatus> {
    const payload = await this.#loadPayload();
    const hasValidToken = payload !== null && !this.#isExpired(payload);

    const status: T3TokenStatus = {
      paired: hasValidToken,
      origin: hasValidToken ? payload?.origin ?? null : null,
      expiresAt: hasValidToken ? payload?.expiresAt ?? null : null,
      hasEncryptedStorage: !this.#inMemoryOnly && existsSync(this.#storagePath),
      source: hasValidToken ? payload?.source ?? null : null,
    };

    return redactSensitiveData(status);
  }

  /**
   * Loescht das Token aus dem Speicher und von der Festplatte.
   */
  async clearToken(): Promise<void> {
    this.#cachedPayload = null;
    if (!this.#inMemoryOnly && existsSync(this.#storagePath)) {
      try {
        unlinkSync(this.#storagePath);
        logger.info("Verschluesseltes T3-Token von Festplatte entfernt.");
      } catch (error) {
        logger.error("Fehler beim Loeschen der Token-Datei", error);
      }
    }
  }

  /**
   * Laedt die Nutzlast aus Cache oder Festplatte (mit Entschluesselung).
   */
  async #loadPayload(): Promise<T3TokenPayload | null> {
    if (this.#cachedPayload) {
      return this.#cachedPayload;
    }

    if (this.#inMemoryOnly || !existsSync(this.#storagePath)) {
      return null;
    }

    try {
      const ciphertext = readFileSync(this.#storagePath, "utf8").trim();
      if (!ciphertext) return null;

      const plaintext = await decryptSecret(this.#encryptionKey, ciphertext);
      const parsed = JSON.parse(plaintext) as T3TokenPayload;

      if (!parsed || typeof parsed.token !== "string") {
        logger.warn("Entschluesselte Token-Nutzlast ist ungueltig.");
        return null;
      }

      this.#cachedPayload = parsed;
      return parsed;
    } catch (error) {
      logger.error("Fehler beim Entschluesseln des gespeicherten T3-Tokens", error);
      return null;
    }
  }

  #isExpired(payload: T3TokenPayload): boolean {
    if (!payload.expiresAt) return false;
    const expires = new Date(payload.expiresAt).getTime();
    if (Number.isNaN(expires)) return false;
    return Date.now() >= expires;
  }
}
