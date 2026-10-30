/**
 * T3-Bridge — Usage-Ledger & Usage-API: Typdefinitionen (A17)
 *
 * Lane: A17 (Welle W2)
 *
 * Definiert alle Typen für das Usage-Ledger, Abfragen, Aggregationen,
 * Preistabellen und den Datenabgleich zwischen Connect und dem T3-Sidecar.
 */

import type {
  ConnectChatUsage,
  T3ProviderId,
  T3ProviderLimit,
  UsageBucket,
  UsageGroupBy,
  UsageLedgerRow,
  UsageMetric,
  UsageQuery,
  UsageResponse,
} from "../contracts";

export type {
  ConnectChatUsage,
  T3ProviderId,
  T3ProviderLimit,
  UsageBucket,
  UsageGroupBy,
  UsageLedgerRow,
  UsageMetric,
  UsageQuery,
  UsageResponse,
};

/**
 * Eingabedaten für das Einbuchen eines Turns in das Ledger.
 */
export type UsageLedgerInsert = {
  /** Optionaler Agent-Bezeichner in Connect. */
  agentId?: string | null;
  /** Optionale Firmen-ID in Connect. */
  companyId?: string | null;
  /** T3-Provider-ID oder "legacy" / "cloud". */
  provider: T3ProviderId | "legacy" | "cloud";
  /** Modell-Name (z. B. "gpt-4o", "claude-3-5-sonnet"). */
  model: string;
  /** Ungecachte Eingabe-Tokens. */
  inputTokens: number;
  /** Gelesene Cache-Tokens. */
  cachedInputTokens?: number;
  /** Neu geschriebene Cache-Tokens. */
  cacheCreationTokens?: number;
  /** Ausgabe-Tokens. */
  outputTokens: number;
  /** Reasoning-Tokens (z. B. o1/o3). */
  reasoningTokens?: number;
  /** Bereits ermittelte Kosten in USD (falls bekannt, sonst Preistabelle). */
  costUsd?: number;
  /** Eingesparte Kosten durch Cache. */
  cacheSavingsUsd?: number;
  /** Turn-ID aus T3-Stream / Translate. */
  turnId?: string | null;
  /** Tag (YYYY-MM-DD), Standard: aktueller Tag in timeZone. */
  day?: string;
  /** ISO-Zeitstempel der Erstellung. */
  createdAt?: string;
};

/**
 * Filter für Rohdatenabfragen aus dem Ledger.
 */
export type UsageLedgerFilter = {
  sinceDay?: string;
  untilDay?: string;
  agentId?: string;
  companyId?: string;
  provider?: T3ProviderId | "legacy" | "cloud";
  model?: string;
};

/**
 * Schnittstelle für den Ledger-Datenspeicher (Postgres via Drizzle oder In-Memory).
 */
export interface IUsageLedgerStore {
  /** Speichert eine neue Turn-Nutzungszeile (Append-only). */
  insert(entry: UsageLedgerInsert): Promise<UsageLedgerRow>;

  /** Fügt mehrere Zeilen im Batch ein. */
  insertBatch(entries: readonly UsageLedgerInsert[]): Promise<UsageLedgerRow[]>;

  /** Liest Ledger-Zeilen anhand von Filtern. */
  findRows(filter: UsageLedgerFilter): Promise<UsageLedgerRow[]>;

  /** Zählt Ledger-Zeilen. */
  count(filter?: UsageLedgerFilter): Promise<number>;
}

/**
 * Daten eines Modell-Preises pro Million Tokens.
 */
export type ModelTokenRates = {
  /** Kosten in USD pro 1M Eingabe-Tokens (ungecached). */
  inputCostPerMillion: number;
  /** Kosten in USD pro 1M Ausgabe-Tokens. */
  outputCostPerMillion: number;
  /** Kosten in USD pro 1M gelesene Cache-Tokens. */
  cacheReadCostPerMillion: number;
  /** Kosten in USD pro 1M geschriebene Cache-Tokens. */
  cacheWriteCostPerMillion: number;
};

/**
 * Ergebnis der Kostenberechnung eines Turns.
 */
export type TurnCostCalculation = {
  costUsd: number;
  cacheSavingsUsd: number;
  costSource: "priced" | "reported" | "fallback";
};

/**
 * Abgleichsergebnis zwischen Connect Ledger und T3 Sidecar Summary.
 */
export type LedgerT3Reconciliation = {
  provider: string;
  ledgerTokens: number;
  t3Tokens: number;
  tokenDifference: number;
  tokenDeviationPercent: number;
  ledgerCostUsd: number;
  t3CostUsd: number;
  costDifference: number;
  costDeviationPercent: number;
  explanation: string;
};

/**
 * Gesamtbericht der Abstimmung.
 */
export type ReconciliationReport = {
  windowDays: number;
  sinceDay: string;
  untilDay: string;
  timeZone: string;
  providers: LedgerT3Reconciliation[];
  totalLedgerTokens: number;
  totalT3Tokens: number;
  overallTokenDeviationPercent: number;
  explanation: string;
};
