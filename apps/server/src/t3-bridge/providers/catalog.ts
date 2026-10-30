/**
 * T3-Bridge — Treiber-Katalog (A04).
 *
 * Lane: A04 (Welle W1). Diese Datei ist die *einzige* Stelle, an der die
 * Reihenfolge und die Herkunft der T3-Treiber beschrieben wird.
 *
 * Quelle der Wahrheit (nur gelesen, nie geändert):
 *   `C:\Users\Kunc GmbH\.gemini\antigravity\scratch\t3code\apps\server\src\provider\builtInDrivers.ts`
 *   → `BUILT_IN_DRIVERS` (Hermes-Fork)
 *
 * Die Treiber-*Ids* stehen bewusst nicht noch einmal hier: sie kommen aus
 * `T3_PROVIDER_IDS` im Vertrag (`../contracts.ts`, Eigentümer A01). Ein
 * Record über `T3ProviderId` zwingt den Compiler dazu, jeden neuen Treiber des
 * Vertrags hier zu beschreiben — ein vergessener Treiber ist damit ein
 * Typecheck-Fehler statt einer Lücke in der CLI-Auswahl.
 *
 * Neue Fork-Treiber ohne Code-Änderung: Der Katalog ist nur die *Beschreibung*
 * bekannter Treiber. Alles, was der T3-Server zusätzlich meldet, erscheint
 * trotzdem in der Liste — dann als `unavailable` mit dem Hinweis, dass der
 * Treiber dem Vertrag noch unbekannt ist (siehe `registry.ts`).
 */

import {
  T3_PROVIDER_IDS,
  T3_PROVIDER_LABELS,
  type T3ProviderId,
} from "../contracts";

/** Wie der Treiber mit seiner CLI spricht. */
export type T3ProviderTransport = "process" | "acp" | "cloud" | "unknown";

export type T3DriverCatalogEntry = {
  /** Id im Vertrag (= T3-Treiber-Id). */
  provider: T3ProviderId;
  label: string;
  /** Herkunft im Fork: Paketname oder Datei unter `apps/server/src/provider`. */
  source: string;
  transport: T3ProviderTransport;
  /** Vom Hermes-Fork ergänzt (nicht Upstream-t3code). */
  fork: boolean;
  /** Mehrere Instanzen möglich → eine Zeile je Instanz (ACP-Registry). */
  multiInstance: boolean;
};

/**
 * Reihenfolge von `BUILT_IN_DRIVERS` im Fork, wörtlich übernommen.
 *
 * Der Test `providers.test.ts` hält diese Liste gegen den Katalog; sie ist die
 * Prüfliste für „jeder Treiber des Forks ist enthalten" (inkl. Hermes/Freebuff).
 */
export const T3_FORK_BUILT_IN_DRIVER_ORDER = [
  "codex",
  "claudeAgent",
  "cursor",
  "grok",
  "hermes",
  "freebuff",
  "opencode",
  "antigravity",
  "pi",
  "muse",
  "acpRegistry",
] as const satisfies readonly T3ProviderId[];

/**
 * Anzeige-Reihenfolge der CLI-Auswahl.
 *
 * Stefans Entscheidung: **Codex und Claude zuerst**, danach alle weiteren
 * Treiber in der Reihenfolge des Forks. A23 rendert die Liste in dieser Folge.
 */
export const T3_DRIVER_DISPLAY_ORDER: readonly T3ProviderId[] = [
  "codex",
  "claudeAgent",
  ...T3_FORK_BUILT_IN_DRIVER_ORDER.filter(
    (provider) => provider !== "codex" && provider !== "claudeAgent",
  ),
];

type CatalogMeta = Omit<T3DriverCatalogEntry, "provider" | "label">;

/**
 * Beschreibung je Treiber. Pfade sind *Quellcode*-Pfade des Forks (Doku), keine
 * Pfade zu Credential-Dateien — solche verlassen die Registry nie (siehe
 * `redact.ts`).
 */
const CATALOG_META: Record<T3ProviderId, CatalogMeta> = {
  codex: {
    source: "apps/server/src/provider/Drivers/CodexDriver.ts",
    transport: "process",
    fork: false,
    multiInstance: false,
  },
  claudeAgent: {
    source: "apps/server/src/provider/Drivers/ClaudeDriver.ts",
    transport: "process",
    fork: false,
    multiInstance: false,
  },
  cursor: {
    source: "@t3tools/provider-cursor",
    transport: "process",
    fork: false,
    multiInstance: false,
  },
  grok: {
    source: "@t3tools/provider-grok",
    transport: "acp",
    fork: false,
    multiInstance: false,
  },
  hermes: {
    source: "apps/server/src/provider/Drivers/HermesDriver.ts",
    transport: "acp",
    fork: true,
    multiInstance: false,
  },
  freebuff: {
    source: "apps/server/src/provider/Drivers/FreebuffDriver.ts",
    transport: "acp",
    fork: true,
    multiInstance: false,
  },
  opencode: {
    source: "@t3tools/provider-opencode",
    transport: "process",
    fork: false,
    multiInstance: false,
  },
  antigravity: {
    source: "apps/server/src/provider/Drivers/AntigravityDriver.ts",
    transport: "acp",
    fork: false,
    multiInstance: false,
  },
  pi: {
    source: "@t3tools/provider-pi",
    transport: "process",
    fork: false,
    multiInstance: false,
  },
  muse: {
    source: "@t3tools/provider-muse",
    transport: "cloud",
    fork: false,
    multiInstance: false,
  },
  acpRegistry: {
    source: "@t3tools/provider-acp-registry",
    transport: "acp",
    fork: false,
    multiInstance: true,
  },
};

/** Der vollständige Katalog in Anzeige-Reihenfolge. */
export const T3_DRIVER_CATALOG: readonly T3DriverCatalogEntry[] =
  T3_DRIVER_DISPLAY_ORDER.map((provider) => ({
    provider,
    label: T3_PROVIDER_LABELS[provider],
    ...CATALOG_META[provider],
  }));

const CATALOG_BY_PROVIDER = new Map<T3ProviderId, T3DriverCatalogEntry>(
  T3_DRIVER_CATALOG.map((entry) => [entry.provider, entry]),
);

/** Katalogeintrag zu einer Treiber-Id (oder `undefined` bei unbekannter Id). */
export function t3DriverCatalogEntry(
  provider: string,
): T3DriverCatalogEntry | undefined {
  return CATALOG_BY_PROVIDER.get(provider as T3ProviderId);
}

/**
 * Rang eines Treibers in der Anzeige-Reihenfolge. Unbekannte Treiber landen
 * hinter allen bekannten (Rang = Anzahl bekannter Treiber).
 */
export function t3DriverRank(provider: string | null): number {
  if (provider === null) return T3_DRIVER_DISPLAY_ORDER.length;
  const index = T3_DRIVER_DISPLAY_ORDER.indexOf(provider as T3ProviderId);
  return index === -1 ? T3_DRIVER_DISPLAY_ORDER.length : index;
}

/* ---------------------------------------------------------------------------------------- *
 * Connect-CLI-Ziele (Spiegel von `apps/app/src/lib/agents/agent-cli.ts`)
 * ---------------------------------------------------------------------------------------- */

/**
 * Die 9 Ziele aus `CLI_TARGETS` der App, in deren Reihenfolge.
 *
 * Der Server kann die App-Datei nicht importieren (eigener Workspace). Der
 * Test prüft deshalb, dass jedes dieser Ziele im Vertrag
 * (`CLI_TARGET_TO_T3_PROVIDER`) gemappt ist — ein neues App-Ziel ohne Mapping
 * fällt damit sofort auf.
 */
export const T3_CLI_TARGETS = [
  { target: "antigravity", label: "Antigravity" },
  { target: "manus", label: "Manus" },
  { target: "codex", label: "Codex" },
  { target: "chatgpt", label: "ChatGPT" },
  { target: "claude", label: "Claude" },
  { target: "grok", label: "Grok" },
  { target: "cursor", label: "Cursor" },
  { target: "lovable", label: "Lovable" },
  { target: "freebuff", label: "Freebuff" },
] as const;

export type T3CliTarget = (typeof T3_CLI_TARGETS)[number]["target"];

/**
 * Ziele ohne T3-Treiber: sie bleiben auf dem alten Weg (`cli-bridge`).
 *
 * `zgpt` steht nur im Vertrag, nicht in `CLI_TARGETS` — es bleibt trotzdem hier
 * vermerkt, damit die Liste der Alt-Ziele vollständig ist.
 */
export const T3_LEGACY_CLI_TARGETS = ["manus", "lovable", "zgpt"] as const;

/** Alle Treiber-Ids, die dieser Vertrag kennt (für Prüfungen von außen). */
export function isKnownT3ProviderId(value: string): value is T3ProviderId {
  return (T3_PROVIDER_IDS as readonly string[]).includes(value);
}
