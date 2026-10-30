/**
 * T3-Bridge — Provider-Registry (A04).
 *
 * Lane: A04 (Welle W1).
 *
 * Aufgaben:
 *  1. **Vollständige Liste** aller T3-Treiber aus dem Fork — Codex und Claude
 *     zuerst (Stefans Entscheidung), danach alle weiteren in Fork-Reihenfolge,
 *     inklusive Hermes und Freebuff.
 *  2. **ACP-Agenten** (`AcpRegistryDriver` / `@t3tools/provider-acp-registry`):
 *     der generische Treiber kann mehrere Agenten fahren; jeder Agent bekommt
 *     eine eigene Zeile mit seinem Anzeigenamen.
 *  3. **Status**: installiert / eingeloggt / Version / Limit — nur gelesen.
 *  4. **Cache 30 s** mit Single-Flight: viele Aufrufe (mehrere Agenten, mehrere
 *     Tabs) erzeugen genau eine Sidecar-Lesung pro Fenster. Kein Timer, kein
 *     Polling.
 *  5. **Unbekannte Treiber** (Fork neuer als der Vertrag) erscheinen als
 *     `unavailable` mit Begründung — die Liste bricht nicht.
 *  6. **Keine Pfade**: alle Freitexte laufen durch `scrubProviderText`.
 */

import {
  T3_PROVIDER_IDS,
  type T3ProviderId,
  type T3ProviderLimit,
  type T3ProviderListResponse,
  type T3ProviderStatus,
  t3ProviderForCliTarget,
} from "../contracts";
import type { T3ServerConfig, T3ServerProvider } from "../rpc/types";
import {
  isKnownT3ProviderId,
  T3_CLI_TARGETS,
  T3_DRIVER_CATALOG,
  T3_DRIVER_DISPLAY_ORDER,
  type T3DriverCatalogEntry,
  t3DriverRank,
} from "./catalog";
import { scrubModelIds, scrubProviderText } from "./redact";
import type {
  T3CliTargetState,
  T3ProviderAuthState,
  T3ProviderConfigSource,
  T3ProviderEntry,
  T3ProviderRegistrySnapshot,
} from "./types";

/** Cache-Fenster laut Auftrag: 30 Sekunden. */
export const T3_PROVIDER_STATUS_CACHE_MS = 30_000;

export type T3ProviderRegistryOptions = {
  source: T3ProviderConfigSource;
  /** Cache-Fenster in ms. Standard: 30 000. */
  cacheTtlMs?: number;
  /** Zeitquelle — im Test injizierbar. */
  now?: () => number;
  /** `false` = Feature-Flag aus: es wird nichts gelesen. */
  enabled?: boolean;
  log?: (message: string, detail?: Record<string, unknown>) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const LIMIT_KINDS = ["session", "weekly", "monthly", "other"] as const;

function readLimitKind(value: unknown): T3ProviderLimit["kind"] {
  return (LIMIT_KINDS as readonly string[]).includes(String(value))
    ? (value as T3ProviderLimit["kind"])
    : "other";
}

/** Modelle: T3 liefert `{ slug, name }`; ältere Formen `{ id }`/`{ model }`. */
function readModels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const models: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      models.push(item);
      continue;
    }
    if (!isRecord(item)) continue;
    const id =
      readString(item.slug) ??
      readString(item.id) ??
      readString(item.model) ??
      readString(item.name);
    if (id) models.push(id);
  }
  return scrubModelIds(models);
}

/** Limit-Fenster aus `usageLimits.windows` (ohne Provider-Id — die kennt der Aufrufer). */
function readLimits(
  provider: T3ServerProvider,
): Omit<T3ProviderLimit, "provider">[] {
  const usage = isRecord(provider.usageLimits) ? provider.usageLimits : null;
  const windows = usage && Array.isArray(usage.windows) ? usage.windows : [];
  const limits: Omit<T3ProviderLimit, "provider">[] = [];
  for (const window of windows) {
    if (!isRecord(window)) continue;
    const kind = readLimitKind(window.kind);
    const label = scrubProviderText(readString(window.label) ?? kind) ?? kind;
    const usedPercent = readNumber(window.usedPercent);
    if (usedPercent === null) continue;
    limits.push({
      kind,
      label,
      usedPercent: Math.min(100, Math.max(0, usedPercent)),
      resetsAt: readString(window.resetsAt),
    });
  }
  return limits;
}

type AuthInfo = {
  auth: T3ProviderAuthState | null;
  authenticated: boolean | null;
};

function readAuth(provider: T3ServerProvider): AuthInfo {
  const raw = isRecord(provider.auth) ? provider.auth : null;
  if (!raw) return { auth: null, authenticated: null };
  const status = readString(raw.status);
  const auth: T3ProviderAuthState =
    status === "authenticated" ||
    status === "unauthenticated" ||
    status === "unknown"
      ? status
      : "unknown";
  return {
    auth,
    authenticated:
      auth === "authenticated"
        ? true
        : auth === "unauthenticated"
          ? false
          : null,
  };
}

/** Begründung eines Eintrags — in dieser Reihenfolge, immer redigiert. */
function readReason(provider: T3ServerProvider): string | undefined {
  const usage = isRecord(provider.usageLimits) ? provider.usageLimits : null;
  const unavailable =
    usage && isRecord(usage.unavailable) ? usage.unavailable : null;
  return scrubProviderText(
    readString(provider.unavailableReason) ??
      readString(provider.message) ??
      (unavailable ? readString(unavailable.message) : null),
  );
}

function labelFor(
  catalog: T3DriverCatalogEntry | undefined,
  provider: T3ServerProvider,
  fallback: string,
): string {
  return (
    scrubProviderText(readString(provider.displayName)) ??
    catalog?.label ??
    fallback
  );
}

/** Eine Zeile aus einer T3-Instanz bauen. */
function entryFromInstance(
  provider: T3ServerProvider,
  options: {
    providerId: T3ProviderId | null;
    driver: string;
    label: string;
    rank: number;
    catalog: T3DriverCatalogEntry | undefined;
    forceUnavailableReason?: string;
  },
): T3ProviderEntry {
  const { providerId, driver, label, rank, catalog } = options;
  const installed = readBoolean(provider.installed) ?? false;
  const enabled = readBoolean(provider.enabled) ?? true;
  const status = readString(provider.status);
  const reportedAvailability = readString(provider.availability);
  const { auth, authenticated } = readAuth(provider);
  const t3Reason = readReason(provider);

  const available =
    options.forceUnavailableReason === undefined &&
    reportedAvailability !== "unavailable" &&
    installed &&
    enabled &&
    status !== "error" &&
    status !== "disabled";

  const reason =
    options.forceUnavailableReason ??
    (available ? undefined : (t3Reason ?? "Nicht verfügbar."));

  return {
    provider: providerId,
    driver,
    instanceId: readString(provider.instanceId),
    label,
    source: catalog?.source ?? null,
    fork: catalog?.fork ?? false,
    transport: catalog?.transport ?? "unknown",
    rank,
    installed,
    enabled,
    authenticated,
    auth,
    version: scrubProviderText(readString(provider.version)) ?? null,
    availability: available ? "available" : "unavailable",
    models: readModels(provider.models),
    // Ohne Vertrags-Id lässt sich ein Limit nicht typisieren (der Vertrag
    // verlangt eine `T3ProviderId`). Unbekannte Treiber melden daher keine
    // Limits — der Status „unavailable" bleibt trotzdem sichtbar.
    limits:
      providerId === null
        ? []
        : readLimits(provider).map((limit) => ({
            ...limit,
            provider: providerId,
          })),
    ...(reason ? { reason: scrubProviderText(reason) } : {}),
  };
}

/** Alle Instanzen je Treiber-Id gruppieren. */
function groupInstances(
  config: T3ServerConfig,
): Map<string, T3ServerProvider[]> {
  const grouped = new Map<string, T3ServerProvider[]>();
  const providers = Array.isArray(config.providers) ? config.providers : [];
  for (const provider of providers) {
    if (!isRecord(provider)) continue;
    const driver = readString((provider as T3ServerProvider).driver);
    if (!driver) continue;
    const list = grouped.get(driver) ?? [];
    list.push(provider as T3ServerProvider);
    grouped.set(driver, list);
  }
  return grouped;
}

/** Beste Instanz wählen (nutzbar vor installiert vor erster). */
function pickBestInstance(
  instances: readonly T3ServerProvider[],
): T3ServerProvider | undefined {
  if (instances.length <= 1) return instances[0];
  const score = (candidate: T3ServerProvider): number => {
    const installed = readBoolean(candidate.installed) ?? false;
    const enabled = readBoolean(candidate.enabled) ?? true;
    const status = readString(candidate.status);
    const availability = readString(candidate.availability);
    const { authenticated } = readAuth(candidate);
    return (
      (availability !== "unavailable" &&
      installed &&
      enabled &&
      status !== "error"
        ? 8
        : 0) +
      (installed ? 4 : 0) +
      (enabled ? 2 : 0) +
      (authenticated ? 1 : 0)
    );
  };
  return [...instances].sort((a, b) => score(b) - score(a))[0];
}

/** Eintrag für einen Treiber, den der Sidecar gar nicht meldet. */
function missingEntry(catalog: T3DriverCatalogEntry): T3ProviderEntry {
  return {
    provider: catalog.provider,
    driver: catalog.provider,
    instanceId: null,
    label: catalog.label,
    source: catalog.source,
    fork: catalog.fork,
    transport: catalog.transport,
    rank: t3DriverRank(catalog.provider),
    installed: false,
    enabled: false,
    authenticated: null,
    auth: null,
    version: null,
    availability: "unavailable",
    models: [],
    limits: [],
    reason: "T3 meldet diesen Treiber nicht.",
  };
}

/** Eintrag für einen Treiber, den der Vertrag (noch) nicht kennt. */
function unknownEntry(
  provider: T3ServerProvider,
  driver: string,
  rank: number,
): T3ProviderEntry {
  const label = labelFor(undefined, provider, driver);
  const entry = entryFromInstance(provider, {
    providerId: null,
    driver,
    label,
    rank,
    catalog: undefined,
    forceUnavailableReason: `Unbekannter T3-Treiber „${driver}" — in Connect noch nicht unterstützt.`,
  });
  // Ein unbekannter Treiber ist nie auswählbar, auch wenn T3 ihn bedienen kann.
  return { ...entry, availability: "unavailable", transport: "unknown" };
}

/** Alle Einträge aus der Server-Config bauen. */
export function buildProviderEntries(config: T3ServerConfig): {
  entries: T3ProviderEntry[];
  unknownDrivers: string[];
} {
  const grouped = groupInstances(config);
  const entries: T3ProviderEntry[] = [];
  const unknownDrivers: string[] = [];

  for (const catalog of T3_DRIVER_CATALOG) {
    const instances = grouped.get(catalog.provider) ?? [];

    if (catalog.multiInstance && instances.length > 0) {
      // ACP-Registry: jeder Agent ist eine eigene Zeile.
      for (const instance of instances) {
        entries.push(
          entryFromInstance(instance, {
            providerId: catalog.provider,
            driver: catalog.provider,
            label: labelFor(catalog, instance, catalog.label),
            rank: t3DriverRank(catalog.provider),
            catalog,
          }),
        );
      }
      continue;
    }

    const best = pickBestInstance(instances);
    if (!best) {
      entries.push(missingEntry(catalog));
      continue;
    }

    entries.push(
      entryFromInstance(best, {
        providerId: catalog.provider,
        driver: catalog.provider,
        label: labelFor(catalog, best, catalog.label),
        rank: t3DriverRank(catalog.provider),
        catalog,
      }),
    );
  }

  // Treiber, die der Vertrag nicht kennt: nicht verschweigen, sondern als
  // `unavailable` anhängen. Neue Fork-Treiber erscheinen so ohne Code-Änderung.
  let unknownRank = T3_DRIVER_DISPLAY_ORDER.length;
  for (const [driver, instances] of grouped) {
    if (isKnownT3ProviderId(driver)) continue;
    unknownDrivers.push(driver);
    const best = pickBestInstance(instances);
    if (!best) continue;
    entries.push(unknownEntry(best, driver, unknownRank));
    unknownRank += 1;
  }

  entries.sort(
    (a, b) => a.rank - b.rank || a.label.localeCompare(b.label, "de"),
  );
  return { entries, unknownDrivers };
}

/** Connect-CLI-Ziele auf die Einträge abbilden. */
export function buildCliTargetStates(
  entries: readonly T3ProviderEntry[],
): T3CliTargetState[] {
  return T3_CLI_TARGETS.map(({ target, label }) => {
    const mapped = t3ProviderForCliTarget(target);
    if (mapped === "legacy") {
      return {
        target,
        label,
        provider: null,
        legacy: true,
        availability: "legacy",
        installed: false,
        authenticated: null,
        version: null,
        reason: "Kein T3-Treiber — bleibt auf dem alten Weg (cli-bridge).",
      };
    }
    const entry = entries.find((candidate) => candidate.provider === mapped);
    if (!entry) {
      return {
        target,
        label,
        provider: mapped,
        legacy: false,
        availability: "unavailable",
        installed: false,
        authenticated: null,
        version: null,
        reason: "T3 meldet diesen Treiber nicht.",
      };
    }
    return {
      target,
      label,
      provider: mapped,
      legacy: false,
      availability: entry.availability,
      installed: entry.installed,
      authenticated: entry.authenticated,
      version: entry.version,
      ...(entry.reason ? { reason: entry.reason } : {}),
    };
  });
}

function serverContractVersion(config: T3ServerConfig): number | null {
  const environment = isRecord(config.environment) ? config.environment : null;
  return environment
    ? readNumber(environment.orchestrationProtocolVersion)
    : null;
}

function emptySnapshot(
  nowMs: number,
  ttlMs: number,
  enabled: boolean,
  message?: string,
): T3ProviderRegistrySnapshot {
  return {
    enabled,
    entries: [],
    // Flag aus: keine Zusage an die CLI-Auswahl. A23 prüft `enabled` und bleibt
    // beim alten Verhalten; eine leere Liste ist ehrlicher als 11 Attrappen.
    cliTargets: enabled ? buildCliTargetStates([]) : [],
    unknownDrivers: [],
    fetchedAt: new Date(nowMs).toISOString(),
    readAt: new Date(nowMs).toISOString(),
    fromCache: false,
    cacheAgeMs: 0,
    cacheTtlMs: ttlMs,
    serverContractVersion: null,
    ...(message ? { message: scrubProviderText(message) } : {}),
  };
}

function snapshotFromConfig(
  config: T3ServerConfig,
  options: { nowMs: number; ttlMs: number; enabled: boolean; message?: string },
): T3ProviderRegistrySnapshot {
  const { entries, unknownDrivers } = buildProviderEntries(config);
  return {
    enabled: options.enabled,
    entries,
    cliTargets: buildCliTargetStates(entries),
    unknownDrivers,
    fetchedAt: new Date(options.nowMs).toISOString(),
    readAt: new Date(options.nowMs).toISOString(),
    fromCache: false,
    cacheAgeMs: 0,
    cacheTtlMs: options.ttlMs,
    serverContractVersion: serverContractVersion(config),
    ...(options.message ? { message: scrubProviderText(options.message) } : {}),
  };
}

/**
 * Die Registry.
 *
 * Eine Instanz pro Prozess (siehe `index.ts`). `list()` ist billig: innerhalb
 * von 30 s kommt die Antwort aus dem Cache, parallele Aufrufe teilen sich eine
 * Lesung.
 */
export class T3ProviderRegistry {
  readonly #source: T3ProviderConfigSource;
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #enabled: boolean;
  readonly #log:
    | ((message: string, detail?: Record<string, unknown>) => void)
    | undefined;

  #cache: {
    snapshot: T3ProviderRegistrySnapshot;
    fetchedAtMs: number;
    expiresAtMs: number;
  } | null = null;
  #inflight: Promise<T3ProviderRegistrySnapshot> | null = null;

  constructor(options: T3ProviderRegistryOptions) {
    this.#source = options.source;
    this.#ttlMs = Math.max(
      0,
      options.cacheTtlMs ?? T3_PROVIDER_STATUS_CACHE_MS,
    );
    this.#now = options.now ?? Date.now;
    this.#enabled = options.enabled ?? true;
    this.#log = options.log;
  }

  /** Cache leeren (z. B. nach einer Einstellungsänderung). */
  invalidate(): void {
    this.#cache = null;
  }

  /** Aktueller Zustand, ohne den Sidecar zu fragen. */
  get cached(): T3ProviderRegistrySnapshot | null {
    return this.#cache?.snapshot ?? null;
  }

  async list(
    options: { force?: boolean } = {},
  ): Promise<T3ProviderRegistrySnapshot> {
    const now = this.#now();

    if (!this.#enabled) {
      return emptySnapshot(
        now,
        this.#ttlMs,
        false,
        "T3-Brücke ist deaktiviert.",
      );
    }

    if (!options.force && this.#cache && now < this.#cache.expiresAtMs) {
      return {
        ...this.#cache.snapshot,
        readAt: new Date(now).toISOString(),
        fromCache: true,
        cacheAgeMs: Math.max(0, now - this.#cache.fetchedAtMs),
      };
    }

    if (this.#inflight) return this.#inflight;

    const inflight = this.#read(now).then((snapshot) => {
      this.#cache = {
        snapshot,
        fetchedAtMs: now,
        expiresAtMs: now + this.#ttlMs,
      };
      return snapshot;
    });

    this.#inflight = inflight.finally(() => {
      this.#inflight = null;
    });
    return this.#inflight;
  }

  async #read(nowMs: number): Promise<T3ProviderRegistrySnapshot> {
    try {
      const config = await this.#source.getConfig();
      return snapshotFromConfig(config, {
        nowMs,
        ttlMs: this.#ttlMs,
        enabled: true,
      });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Der T3-Sidecar antwortet nicht.";
      this.#log?.("Provider-Status konnte nicht gelesen werden.", {
        message,
      });
      // Degradiert, aber vollständig: jeder Treiber steht als `unavailable` in
      // der Liste — die CLI-Auswahl bleibt bedienbar und erklärt, warum nicht.
      const degraded = snapshotFromConfig(
        { providers: [] },
        {
          nowMs,
          ttlMs: this.#ttlMs,
          enabled: true,
          message,
        },
      );
      return {
        ...degraded,
        entries: degraded.entries.map((entry) => ({
          ...entry,
          availability: "unavailable",
          installed: false,
          enabled: false,
          reason: "T3-Sidecar nicht erreichbar.",
        })),
        cliTargets: buildCliTargetStates(
          degraded.entries.map((entry) => ({
            ...entry,
            availability: "unavailable",
            installed: false,
            reason: "T3-Sidecar nicht erreichbar.",
          })),
        ),
      };
    }
  }
}

/**
 * Vertragskompatible Sicht (`T3ProviderListResponse`).
 *
 * Treiber, die der Vertrag nicht kennt (`provider === null`), können in `providers`
 * nicht stehen (`provider` ist dort ein geschlossener Typ) und werden deshalb in
 * `unknownDrivers` benannt. A23 zeigt sie als „noch nicht unterstützt".
 *
 * Seit der Vertragserweiterung vom 29.10.2026 trägt jede Zeile zusätzlich `driver`,
 * `instanceId`, `displayName`, `availability`, `auth`, `limits` und `fork` — damit sind
 * mehrere ACP-Agenten derselben Treiber-Id (`acpRegistry`) unterscheidbar.
 */
export function toProviderListResponse(
  snapshot: T3ProviderRegistrySnapshot,
): T3ProviderListResponse {
  const providers: T3ProviderStatus[] = snapshot.entries
    .filter(
      (entry): entry is T3ProviderEntry & { provider: T3ProviderId } =>
        entry.provider !== null,
    )
    .map((entry) => ({
      provider: entry.provider,
      installed: entry.installed,
      authenticated: entry.authenticated,
      version: entry.version,
      models: entry.models,
      ...(entry.reason ? { reason: entry.reason } : {}),
      driver: entry.driver,
      instanceId: entry.instanceId,
      displayName: entry.label,
      availability: entry.availability,
      auth: entry.auth,
      limits: entry.limits,
      fork: entry.fork,
    }));

  return {
    providers,
    serverContractVersion: snapshot.serverContractVersion,
    fetchedAt: snapshot.fetchedAt,
    unknownDrivers: [...snapshot.unknownDrivers],
  };
}

/** Anzahl der Treiber, die der Vertrag kennt (für Prüfungen/Doku). */
export const T3_KNOWN_PROVIDER_COUNT = T3_PROVIDER_IDS.length;
