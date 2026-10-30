/**
 * T3-Bridge — Usage Service (A17)
 *
 * Lane: A17 (Welle W2)
 *
 * Zentraler Dienst für die Verwaltung von Verbrauchsdaten, Ledger-Buchungen,
 * T3-Sidecar-Abfragen und Abgleiche.
 */

import type { Database } from "../../db/client";
import {
  aggregateLedgerRows,
  calculateWindowDays,
  formatDayInTimeZone,
  reconcileLedgerWithT3,
} from "./aggregator";
import {
  DrizzleLegacyUsageReader,
  type ILegacyUsageReader,
  MemoryLegacyUsageReader,
} from "./legacy-reader";
import { defaultPricingCatalog, PricingCatalog } from "./pricing";
import {
  DrizzleUsageLedgerStore,
  type IUsageLedgerStore,
  MemoryUsageLedgerStore,
} from "./store";
import {
  type IT3UsageClient,
  MockT3UsageClient,
  T3RpcUsageClient,
} from "./t3-client";
import type {
  ConnectChatUsage,
  ReconciliationReport,
  T3ProviderId,
  UsageLedgerInsert,
  UsageLedgerRow,
  UsageQuery,
  UsageResponse,
} from "./types";
import type { T3RpcClient } from "../rpc";

export type UsageBridgeServiceOptions = {
  store?: IUsageLedgerStore;
  legacyReader?: ILegacyUsageReader;
  t3Client?: IT3UsageClient;
  pricing?: PricingCatalog;
  database?: Database;
  rpcClient?: T3RpcClient;
};

export class UsageBridgeService {
  readonly #store: IUsageLedgerStore;
  readonly #legacyReader: ILegacyUsageReader;
  readonly #t3Client: IT3UsageClient;
  readonly #pricing: PricingCatalog;

  constructor(options: UsageBridgeServiceOptions = {}) {
    this.#pricing = options.pricing ?? defaultPricingCatalog;

    if (options.store) {
      this.#store = options.store;
    } else if (options.database) {
      this.#store = new DrizzleUsageLedgerStore(options.database, this.#pricing);
    } else {
      this.#store = new MemoryUsageLedgerStore({ pricing: this.#pricing });
    }

    if (options.legacyReader) {
      this.#legacyReader = options.legacyReader;
    } else if (options.database) {
      this.#legacyReader = new DrizzleLegacyUsageReader(options.database);
    } else {
      this.#legacyReader = new MemoryLegacyUsageReader();
    }

    if (options.t3Client) {
      this.#t3Client = options.t3Client;
    } else if (options.rpcClient) {
      this.#t3Client = new T3RpcUsageClient(options.rpcClient);
    } else {
      this.#t3Client = new MockT3UsageClient();
    }
  }

  /**
   * Bucht einen Turn in das Usage-Ledger ein (Aufgabe 2).
   */
  async recordTurnUsage(params: {
    agentId?: string | null;
    companyId?: string | null;
    provider: T3ProviderId | "legacy" | "cloud";
    model: string;
    usage: ConnectChatUsage;
    turnId?: string | null;
    timeZone?: string;
  }): Promise<UsageLedgerRow> {
    const timeZone = params.timeZone ?? "Europe/Berlin";
    const day = formatDayInTimeZone(new Date(), timeZone);

    const uncachedInput = params.usage.uncachedInputTokens ?? 0;
    const cachedInput = params.usage.cachedInputTokens ?? 0;
    const cacheCreation = params.usage.cacheCreationTokens ?? 0;
    const output = params.usage.outputTokens ?? 0;
    const reasoning = params.usage.reasoningTokens ?? 0;

    let costUsd = params.usage.costUsd;
    let cacheSavingsUsd = params.usage.cacheSavingsUsd;

    if (costUsd === undefined || cacheSavingsUsd === undefined) {
      const calculated = this.#pricing.calculateCost(params.model, {
        inputTokens: uncachedInput,
        cachedInputTokens: cachedInput,
        cacheCreationTokens: cacheCreation,
        outputTokens: output,
        reasoningTokens: reasoning,
        costUsd,
        cacheSavingsUsd,
      });
      costUsd = costUsd ?? calculated.costUsd;
      cacheSavingsUsd = cacheSavingsUsd ?? calculated.cacheSavingsUsd;
    }

    const insertData: UsageLedgerInsert = {
      agentId: params.agentId,
      companyId: params.companyId,
      provider: params.provider,
      model: params.model,
      inputTokens: uncachedInput,
      cachedInputTokens: cachedInput,
      cacheCreationTokens: cacheCreation,
      outputTokens: output,
      reasoningTokens: reasoning,
      costUsd,
      cacheSavingsUsd,
      turnId: params.turnId,
      day,
    };

    return await this.#store.insert(insertData);
  }

  /**
   * Führt eine Verbrauchsabfrage gemäß A01-Vertrag aus (Aufgabe 3).
   */
  async queryUsage(query: UsageQuery): Promise<UsageResponse> {
    const timeZone = query.timeZone ?? "Europe/Berlin";
    const windowDays = query.windowDays || 30;
    const { sinceDay, untilDay } = calculateWindowDays(windowDays, timeZone);

    // 1. Daten aus dem Connect Usage-Ledger holen
    const ledgerRows = await this.#store.findRows({
      sinceDay,
      untilDay,
      agentId: query.agentId,
      companyId: query.companyId,
      provider: query.provider,
      model: query.model,
    });

    // 2. Ältere Connect-Usage (Legacy) holen, falls nicht durch Filter ausgeschlossen
    let legacyRows: UsageLedgerRow[] = [];
    if (!query.provider || query.provider === "codex" || (query.provider as string) === "legacy") {
      legacyRows = await this.#legacyReader.readLegacyUsage({
        sinceDay,
        untilDay,
        agentId: query.agentId,
      });
    }

    // Kombinierte Zeilen
    const allRows = [...ledgerRows, ...legacyRows];

    // 3. Aggregation nach groupBy
    const { buckets, totals } = aggregateLedgerRows(allRows, query);

    // 4. Provider-Limits abfragen
    let limits = await this.#t3Client.getUsageLimits();
    if (query.provider) {
      limits = limits.filter((l) => l.provider === query.provider);
    }

    return {
      metric: query.metric,
      windowDays,
      groupBy: query.groupBy,
      buckets,
      totals,
      limits,
      readAt: new Date().toISOString(),
    };
  }

  /**
   * Führt den Soll-Ist-Abgleich zwischen Connect-Ledger und T3-Sidecar durch.
   */
  async reconcile(
    windowDays: number = 30,
    timeZone: string = "Europe/Berlin",
  ): Promise<ReconciliationReport> {
    const { sinceDay, untilDay } = calculateWindowDays(windowDays, timeZone);

    const [ledgerRows, t3Summary] = await Promise.all([
      this.#store.findRows({ sinceDay, untilDay }),
      this.#t3Client.getUsageSummary({ sinceDay, untilDay, timeZone }),
    ]);

    return reconcileLedgerWithT3(ledgerRows, t3Summary, windowDays, timeZone);
  }

  /** Zugriff auf die interne Preistabelle für Overrides. */
  get pricing(): PricingCatalog {
    return this.#pricing;
  }

  /** Zugriff auf den internen Store. */
  get store(): IUsageLedgerStore {
    return this.#store;
  }

  /** Zugriff auf den T3-Client. */
  get t3Client(): IT3UsageClient {
    return this.#t3Client;
  }
}

/**
 * Factory zur Erstellung eines konfigurierten UsageBridgeService.
 */
export function createUsageBridgeService(
  options: UsageBridgeServiceOptions = {},
): UsageBridgeService {
  return new UsageBridgeService(options);
}
