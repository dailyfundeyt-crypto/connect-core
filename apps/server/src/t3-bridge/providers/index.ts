/**
 * T3-Bridge — Provider-Registry: Einstiegspunkt (A04).
 *
 * Lane: A04 (Welle W1).
 *
 * Der einzige Ort, an dem die Registry als Singleton lebt. A37 (Server-
 * Verdrahtung) holt sie hier:
 *
 * ```ts
 * const registry = getT3ProviderRegistry();
 * if (!registry) return legacyProviders();      // Flag aus → altes Verhalten
 * return registry.list({ force });              // Cache 30 s
 * ```
 *
 * Feature-Flag: `connect.t3.bridge` (A01-Vertrag). Ist es aus, gibt es keine
 * Instanz — Connect verhält sich exakt wie heute.
 */

import { getT3Flag } from "../contracts";
import { T3ProviderRegistry, type T3ProviderRegistryOptions } from "./registry";
import { createRpcProviderConfigSource } from "./source";
import type {
  T3ProviderConfigSource,
  T3ProviderRegistrySnapshot,
  T3RpcCall,
} from "./types";

export * from "./catalog";
export * from "./redact";
export * from "./registry";
export * from "./source";
export * from "./types";

/** True, wenn die Provider-Liste überhaupt gelesen werden darf. */
export function isT3ProviderRegistryEnabled(): boolean {
  return getT3Flag("bridge");
}

/**
 * Registry bauen.
 *
 * `source` ist Pflicht, damit diese Datei nichts über den RPC-Client wissen
 * muss (A03 ist eine eigene Lane).
 */
export function createT3ProviderRegistry(
  options: T3ProviderRegistryOptions,
): T3ProviderRegistry {
  return new T3ProviderRegistry(options);
}

/**
 * Bequemer Bau für die Server-Verdrahtung: nimmt einen RPC-Aufruf entgegen
 * (z. B. `(method, payload) => client.request(method, payload)`).
 */
export function createT3ProviderRegistryForRpc(
  call: T3RpcCall,
  options: Omit<T3ProviderRegistryOptions, "source"> = {},
): T3ProviderRegistry {
  return new T3ProviderRegistry({
    ...options,
    source: createRpcProviderConfigSource(call),
  });
}

let singleton: T3ProviderRegistry | null = null;
let singletonSource: T3ProviderConfigSource | null = null;

/**
 * Die Registry dieses Prozesses — oder `null`, wenn `connect.t3.bridge` aus ist.
 *
 * `source` wird nur beim ersten Aufruf gebraucht; spätere Aufrufe liefern die
 * vorhandene Instanz. Damit ein geänderter RPC-Client nicht still weiterläuft,
 * ersetzt eine neue Quelle die Instanz.
 */
export function getT3ProviderRegistry(options?: {
  source?: T3ProviderConfigSource;
  cacheTtlMs?: number;
  now?: () => number;
  log?: (message: string, detail?: Record<string, unknown>) => void;
}): T3ProviderRegistry | null {
  if (!isT3ProviderRegistryEnabled()) return null;

  const requestedSource = options?.source ?? null;
  if (singleton && (!requestedSource || requestedSource === singletonSource)) {
    return singleton;
  }
  if (!requestedSource) {
    // Flag an, aber noch keine Quelle verdrahtet: keine Attrappen-Liste.
    return null;
  }

  singleton = new T3ProviderRegistry({
    source: requestedSource,
    cacheTtlMs: options?.cacheTtlMs,
    now: options?.now,
    log: options?.log,
  });
  singletonSource = requestedSource;
  return singleton;
}

/**
 * Kurzform für Routen: liefert immer eine definierte Antwort.
 *
 * Flag aus → `enabled: false`, keine Lesung, keine Kosten. Das ist die
 * Antwort, die A37 bei ausgeschaltetem Flag unverändert weiterreichen (oder
 * gar nicht mounten) kann.
 */
export async function listT3Providers(options?: {
  force?: boolean;
  registry?: T3ProviderRegistry | null;
}): Promise<T3ProviderRegistrySnapshot> {
  const registry = options?.registry ?? getT3ProviderRegistry();
  if (!registry) {
    const now = Date.now();
    return {
      enabled: false,
      entries: [],
      cliTargets: [],
      unknownDrivers: [],
      fetchedAt: new Date(now).toISOString(),
      readAt: new Date(now).toISOString(),
      fromCache: false,
      cacheAgeMs: 0,
      cacheTtlMs: 0,
      serverContractVersion: null,
      message: "T3-Brücke ist deaktiviert.",
    };
  }
  return registry.list({ force: options?.force });
}

/** Nur für Tests: Singleton zurücksetzen. */
export function resetT3ProviderRegistryForTests(): void {
  singleton = null;
  singletonSource = null;
}
