/**
 * T3-Bridge — Status-Quelle der Provider-Registry (A04).
 *
 * Lane: A04 (Welle W1).
 *
 * Der einzige RPC-Aufruf, den diese Datei kennt, ist `server.getConfig`. Das
 * ist ein **Lesezugriff**: T3 liefert darin seinen Provider-Snapshot
 * (`installed`, `version`, `auth.status`, `status`, `usageLimits`).
 *
 * Bewusst NICHT aufgerufen:
 *  - `server.refreshProviders` (startet CLI-Probes — Last, und bei manchen
 *    Treibern ein Anmelde-Fenster),
 *  - jede Login-/Logout-Methode.
 *
 * Damit gilt die Auftragsregel „keine Logins auslösen, nur Status lesen"
 * strukturell: es gibt in diesem Modul keinen Pfad dorthin.
 */

import { T3_WS_METHODS, type T3ServerConfig } from "../rpc/types";
import type { T3ProviderConfigSource, T3RpcCall } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Adapter auf A03s RPC-Client/Transport.
 *
 * Aufruf für die Server-Verdrahtung (A37):
 * `createRpcProviderConfigSource((method, payload) => client.request(method, payload))`
 * — oder, sobald A03 es anbietet, `() => client.getServerConfig()`.
 */
export function createRpcProviderConfigSource(
  call: T3RpcCall,
): T3ProviderConfigSource {
  return {
    async getConfig(): Promise<T3ServerConfig> {
      const raw = await call(T3_WS_METHODS.serverGetConfig, {});
      if (!isRecord(raw)) {
        throw new Error(
          "Der T3-Sidecar hat für server.getConfig keine Server-Config geliefert.",
        );
      }
      // T3 liefert ein Effect-Schema-Objekt; die Brücke liest nur die Felder,
      // die `T3ServerConfig` beschreibt, und ignoriert den Rest.
      return raw as unknown as T3ServerConfig;
    },
  };
}

/**
 * Feste Config — für Tests und für den Betrieb ohne Sidecar (Mock).
 *
 * Erlaubt eine Funktion, damit ein Test die Antwort zwischen zwei Lesungen
 * ändern kann (Cache-Prüfung).
 */
export function createStaticProviderConfigSource(
  config: T3ServerConfig | (() => T3ServerConfig | Promise<T3ServerConfig>),
): T3ProviderConfigSource {
  return {
    async getConfig() {
      return typeof config === "function" ? await config() : config;
    },
  };
}

/** Quelle, die immer scheitert — prüft den degradierten Zustand. */
export function createFailingProviderConfigSource(
  message = "T3-Sidecar nicht erreichbar.",
): T3ProviderConfigSource {
  return {
    async getConfig() {
      throw new Error(message);
    },
  };
}
