/**
 * T3-WS-RPC — schmale Guards für die Antworten des Sidecars.
 *
 * Lane: A03 (Welle W1).
 *
 * Connect hat kein Effect, also kein `Schema.decode`. Die Antworten des
 * T3-Servers werden deshalb mit reinen TypeScript-Guards geprüft. Ziel ist
 * nicht, T3 vollständig zu validieren, sondern:
 *
 *  1. Falsche Formen früh zu erkennen (Programmierfehler im Client).
 *  2. Unbekannte Felder **nicht** zu verlieren — die Typen haben Index-Signaturen,
 *     damit A04/A12 Zusatzfelder nutzen können, ohne die Verträge zu ändern.
 *  3. Nie zu raten: lieber `null`/`false` liefern als eine erfundene Wahrheit.
 */

import { isT3ProviderId } from "../contracts";
import type {
  T3ProviderSnapshot,
  T3ServerConfig,
  T3ServerProvider,
  T3ThreadProjection,
  T3UsageLimitSources,
  T3UsageSummary,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `true`, wenn der Wert ein Objekt ist (und kein Array). */
export function isT3ServerConfig(value: unknown): value is T3ServerConfig {
  return isRecord(value);
}

/** `true`, wenn der Wert eine Provider-Liste ist. */
export function isT3ServerProviderList(value: unknown): value is T3ServerProvider[] {
  return Array.isArray(value) && value.every((entry) => isRecord(entry));
}

/** `true`, wenn der Wert ein Thread-Projektion ist. */
export function isT3ThreadProjection(value: unknown): value is T3ThreadProjection {
  return isRecord(value);
}

/** `true`, wenn der Wert eine Nutzungsübersicht ist. */
export function isT3UsageSummary(value: unknown): value is T3UsageSummary {
  return isRecord(value);
}

/** `true`, wenn der Wert eine Limit-Quellen-Liste ist. */
export function isT3UsageLimitSources(value: unknown): value is T3UsageLimitSources {
  return isRecord(value);
}

/**
 * Liest den Anmeldestatus eines Providers.
 *
 * T3 liefert den Status an verschiedenen Stellen. Der Guard liest alle
 * bekannten Formen, aber **behauptet niemals** `true`, wenn nichts
 * eindeutiges gefunden wurde — dann bleibt es `null` („unbekannt“).
 */
export function readProviderAuthState(provider: T3ServerProvider): boolean | null {
  const auth = isRecord(provider.auth) ? provider.auth : null;
  if (auth) {
    const direct = readBoolean(auth.authenticated) ?? readBoolean(auth.loggedIn);
    if (direct !== null) return direct;
    const status = readString(auth.status) ?? readString(auth.state);
    if (status !== null) {
      if (status === "authenticated" || status === "ready" || status === "signedIn") return true;
      if (status === "unauthenticated" || status === "signedOut" || status === "loggedOut") {
        return false;
      }
    }
  }
  const flags = isRecord(provider.authState) ? provider.authState : null;
  if (flags) {
    const direct = readBoolean(flags.authenticated) ?? readBoolean(flags.loggedIn);
    if (direct !== null) return direct;
  }
  return null;
}

/**
 * Normalisiert ein einzelnes Provider-Ergebnis auf das Bridge-Format.
 */
export function normalizeProvider(provider: T3ServerProvider): T3ProviderSnapshot {
  const driver = readString(provider.driver) ?? "";
  const usageWindows = readArray(provider.usageLimits?.windows).map((window) => {
    const record = isRecord(window) ? window : {};
    return {
      id: readString(record.id),
      kind: readString(record.kind) ?? "other",
      label: readString(record.label) ?? "",
      usedPercent: readNumber(record.usedPercent) ?? 0,
      resetsAt: readString(record.resetsAt),
    };
  });
  const models = readArray(provider.models)
    .map((model) => {
      if (typeof model === "string") return model;
      if (!isRecord(model)) return null;
      // T3 nutzt `slug` als Modell-ID, `name` nur als Anzeigename.
      return readString(model.id) ?? readString(model.slug) ?? readString(model.model);
    })
    .filter((model): model is string => typeof model === "string");

  // `message` trägt bei T3 teils Auth-Infos ("Authenticated as …"). Als Grund
  // für „nicht nutzbar" taugt er nur, wenn der Provider wirklich fehlt.
  const unavailable =
    provider.enabled === false || provider.installed === false
      ? readString(provider.message)
      : null;
  const reason =
    readString(provider.unavailableReason) ??
    readString(provider.availability) ??
    unavailable;

  return {
    driver,
    providerId: isT3ProviderId(driver) ? driver : null,
    instanceId: readString(provider.instanceId),
    displayName: readString(provider.displayName),
    enabled: provider.enabled !== false,
    installed: provider.installed === true,
    authenticated: readProviderAuthState(provider),
    version: readString(provider.version),
    models,
    status: readString(provider.status),
    reason,
    usageWindows,
  } satisfies T3ProviderSnapshot;
}

/**
 * Normalisiert die Provider-Liste.
 *
 * Die `providerId`-Zuordnung (Connect-CLI-Ziel → T3-Treiber) macht A04, weil
 * sie die Connect-Sicht kennt. Hier bleibt das Feld `null`.
 */
export function normalizeProviderList(
  providers: unknown,
): T3ProviderSnapshot[] {
  if (!Array.isArray(providers)) return [];
  return providers
    .filter(isRecord)
    .map((entry) => normalizeProvider(entry as T3ServerProvider));
}
