/**
 * T3-Bridge — Provider-Registry: Typen (A04).
 *
 * Lane: A04 (Welle W1).
 *
 * Die Registry liefert *mehr* als der Vertrag (`T3ProviderStatus`), weil die
 * CLI-Auswahl (A23) Herkunft, Fork-Kennzeichen, Limits und den Legacy-Zustand
 * braucht. Der vertragskompatible Teil wird zusätzlich über
 * `toProviderListResponse()` erzeugt — Vertragstypen werden hier nicht
 * verändert (Eigentümer A01).
 */

import type {
  T3ProviderAuthState,
  T3ProviderAvailabilityState,
  T3ProviderId,
  T3ProviderLimit,
} from "../contracts";
import type { T3ServerConfig } from "../rpc/types";

/**
 * Anmelde-/Nutzbarkeits-Zustände kommen aus dem Vertrag (eine Wahrheit, Server + App).
 * Hier nur re-exportiert, damit die Registry intern kurz schreiben kann.
 */
export type { T3ProviderAuthState, T3ProviderAvailabilityState };

/** Eine Zeile der Provider-Liste. */
export type T3ProviderEntry = {
  /** Vertrags-Id; `null` = Treiber, den dieser Vertrag (noch) nicht kennt. */
  provider: T3ProviderId | null;
  /** Rohe Treiber-Id aus T3 (z. B. `codex`, `acpRegistry`, `quantumAgent`). */
  driver: string;
  /** T3-Instanz-Id; bei ACP-Agenten die Kennung des jeweiligen Agenten. */
  instanceId: string | null;
  label: string;
  /** Herkunft im Fork (Paket/Quelldatei) — nie ein Credential-Pfad. */
  source: string | null;
  /** Vom Hermes-Fork ergänzt. */
  fork: boolean;
  transport: "process" | "acp" | "cloud" | "unknown";
  /** Position in der Anzeige-Reihenfolge (0 = Codex, 1 = Claude). */
  rank: number;
  installed: boolean;
  enabled: boolean;
  /** `true`/`false` aus T3; `null`, wenn T3 es nicht weiß. */
  authenticated: boolean | null;
  auth: T3ProviderAuthState | null;
  version: string | null;
  availability: T3ProviderAvailabilityState;
  models: string[];
  /** Limit-Fenster aus T3 (`usageLimits.windows`), redigiert. */
  limits: T3ProviderLimit[];
  /** Kurztext für den Tooltip — immer redigiert, nie ein Pfad. */
  reason?: string;
};

/** Zustand eines Connect-CLI-Ziels (`CLI_TARGETS` der App). */
export type T3CliTargetState = {
  target: string;
  label: string;
  /** `null` bei `legacy` und bei unbekannten Zielen. */
  provider: T3ProviderId | null;
  /** `true` = alter Weg (`cli-bridge`), kein T3-Treiber. */
  legacy: boolean;
  availability: T3ProviderAvailabilityState;
  installed: boolean;
  authenticated: boolean | null;
  version: string | null;
  reason?: string;
};

/** Die Antwort der Registry (eine Lesung, ggf. aus dem Cache). */
export type T3ProviderRegistrySnapshot = {
  /** `false` = Feature-Flag aus; es wurde nichts gelesen. */
  enabled: boolean;
  /** Alle Treiber, Codex und Claude zuerst. */
  entries: T3ProviderEntry[];
  /** Mapping Connect-Ziel → T3-Treiber, inkl. `legacy`. */
  cliTargets: T3CliTargetState[];
  /** Treiber, die T3 meldet, die der Vertrag aber nicht kennt. */
  unknownDrivers: string[];
  /** Zeitpunkt der letzten echten Lesung vom Sidecar (ISO). */
  fetchedAt: string;
  /** Zeitpunkt dieser Antwort (ISO). */
  readAt: string;
  fromCache: boolean;
  cacheAgeMs: number;
  cacheTtlMs: number;
  /** Orchestrierungs-Protokoll des Servers, falls gemeldet. */
  serverContractVersion: number | null;
  /** Hinweis, wenn der Sidecar nicht antwortet (redigiert). */
  message?: string;
};

/**
 * Quelle der T3-Server-Config.
 *
 * Bewusst schmal und ohne Import des RPC-Clients: A03 ist eine eigene Lane und
 * darf sich ändern. Der echte Adapter (`createRpcProviderConfigSource`) nimmt
 * jede Funktion `(method, payload) => Promise<unknown>` — z. B. die
 * `request`-Methode des A03-Clients.
 */
export type T3ProviderConfigSource = {
  getConfig(): Promise<T3ServerConfig>;
};

/** Ein RPC-Aufruf, wie ihn A03s Transport/Client anbietet. */
export type T3RpcCall = (method: string, payload: unknown) => Promise<unknown>;
