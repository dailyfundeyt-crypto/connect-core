/**
 * T3-Bridge — Usage-Ledger Store (A17)
 *
 * Lane: A17 (Welle W2)
 *
 * Speichert Token- und Kostendaten pro Turn im `usage_ledger`.
 * Bietet In-Memory- und Drizzle-Implementierungen.
 */

import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { usageLedger } from "../../db/schema/t3";
import { defaultPricingCatalog, PricingCatalog } from "./pricing";
import type {
  IUsageLedgerStore,
  UsageLedgerFilter,
  UsageLedgerInsert,
  UsageLedgerRow,
} from "./types";

export type { IUsageLedgerStore, UsageLedgerFilter, UsageLedgerInsert, UsageLedgerRow };

/**
 * In-Memory-Ledger-Store für Tests und zustandslose Ausführungen.
 */
export class MemoryUsageLedgerStore implements IUsageLedgerStore {
  readonly #rows: UsageLedgerRow[] = [];
  readonly #pricing: PricingCatalog;

  constructor(options?: {
    pricing?: PricingCatalog;
    initialRows?: readonly UsageLedgerRow[];
  }) {
    this.#pricing = options?.pricing ?? defaultPricingCatalog;
    if (options?.initialRows) {
      this.#rows.push(...options.initialRows);
    }
  }

  async insert(entry: UsageLedgerInsert): Promise<UsageLedgerRow> {
    const day = entry.day ?? new Date().toISOString().slice(0, 10);
    const createdAt = entry.createdAt ?? new Date().toISOString();
    const id = `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    let costUsd = entry.costUsd;
    let cacheSavingsUsd = entry.cacheSavingsUsd;

    if (costUsd === undefined || cacheSavingsUsd === undefined) {
      const calculated = this.#pricing.calculateCost(entry.model, {
        inputTokens: entry.inputTokens,
        cachedInputTokens: entry.cachedInputTokens,
        cacheCreationTokens: entry.cacheCreationTokens,
        outputTokens: entry.outputTokens,
        reasoningTokens: entry.reasoningTokens,
        costUsd: entry.costUsd,
        cacheSavingsUsd: entry.cacheSavingsUsd,
      });
      costUsd = costUsd ?? calculated.costUsd;
      cacheSavingsUsd = cacheSavingsUsd ?? calculated.cacheSavingsUsd;
    }

    const row: UsageLedgerRow = {
      id,
      agentId: entry.agentId ?? null,
      companyId: entry.companyId ?? null,
      provider: entry.provider,
      model: entry.model,
      inputTokens: entry.inputTokens,
      cachedInputTokens: entry.cachedInputTokens ?? 0,
      cacheCreationTokens: entry.cacheCreationTokens ?? 0,
      outputTokens: entry.outputTokens,
      reasoningTokens: entry.reasoningTokens ?? 0,
      costUsd,
      cacheSavingsUsd,
      turnId: entry.turnId ?? null,
      day,
      createdAt,
    };

    this.#rows.push(row);
    return row;
  }

  async insertBatch(entries: readonly UsageLedgerInsert[]): Promise<UsageLedgerRow[]> {
    const results: UsageLedgerRow[] = [];
    for (const entry of entries) {
      results.push(await this.insert(entry));
    }
    return results;
  }

  async findRows(filter: UsageLedgerFilter): Promise<UsageLedgerRow[]> {
    return this.#rows.filter((r) => {
      if (filter.sinceDay && r.day < filter.sinceDay) return false;
      if (filter.untilDay && r.day > filter.untilDay) return false;
      if (filter.agentId && r.agentId !== filter.agentId) return false;
      if (filter.companyId && r.companyId !== filter.companyId) return false;
      if (filter.provider && r.provider !== filter.provider) return false;
      if (filter.model && r.model !== filter.model) return false;
      return true;
    });
  }

  async count(filter?: UsageLedgerFilter): Promise<number> {
    if (!filter) return this.#rows.length;
    const rows = await this.findRows(filter);
    return rows.length;
  }

  /** Hilfsmethode für Tests: Alle Zeilen zurücksetzen. */
  clear(): void {
    this.#rows.length = 0;
  }
}

/**
 * Drizzle-Implementierung für die Speicherung in Postgres (`usage_ledger`).
 */
export class DrizzleUsageLedgerStore implements IUsageLedgerStore {
  readonly #db: Database;
  readonly #pricing: PricingCatalog;

  constructor(db: Database, pricing: PricingCatalog = defaultPricingCatalog) {
    this.#db = db;
    this.#pricing = pricing;
  }

  async insert(entry: UsageLedgerInsert): Promise<UsageLedgerRow> {
    const day = entry.day ?? new Date().toISOString().slice(0, 10);
    const createdAt = entry.createdAt ? new Date(entry.createdAt) : new Date();

    let costUsd = entry.costUsd;
    let cacheSavingsUsd = entry.cacheSavingsUsd;

    if (costUsd === undefined || cacheSavingsUsd === undefined) {
      const calculated = this.#pricing.calculateCost(entry.model, {
        inputTokens: entry.inputTokens,
        cachedInputTokens: entry.cachedInputTokens,
        cacheCreationTokens: entry.cacheCreationTokens,
        outputTokens: entry.outputTokens,
        reasoningTokens: entry.reasoningTokens,
        costUsd: entry.costUsd,
        cacheSavingsUsd: entry.cacheSavingsUsd,
      });
      costUsd = costUsd ?? calculated.costUsd;
      cacheSavingsUsd = cacheSavingsUsd ?? calculated.cacheSavingsUsd;
    }

    const [row] = await this.#db
      .insert(usageLedger)
      .values({
        agentId: entry.agentId ?? null,
        companyId: entry.companyId ?? null,
        provider: entry.provider,
        model: entry.model,
        inputTokens: entry.inputTokens,
        cachedInputTokens: entry.cachedInputTokens ?? 0,
        cacheCreationTokens: entry.cacheCreationTokens ?? 0,
        outputTokens: entry.outputTokens,
        reasoningTokens: entry.reasoningTokens ?? 0,
        costUsd,
        cacheSavingsUsd,
        turnId: entry.turnId ?? null,
        day,
        createdAt,
      })
      .returning();

    return {
      id: row.id,
      agentId: row.agentId,
      companyId: row.companyId,
      provider: row.provider as any,
      model: row.model,
      inputTokens: row.inputTokens,
      cachedInputTokens: row.cachedInputTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      outputTokens: row.outputTokens,
      reasoningTokens: row.reasoningTokens,
      costUsd: row.costUsd,
      cacheSavingsUsd: row.cacheSavingsUsd,
      turnId: row.turnId,
      day: row.day,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    };
  }

  async insertBatch(entries: readonly UsageLedgerInsert[]): Promise<UsageLedgerRow[]> {
    const results: UsageLedgerRow[] = [];
    for (const entry of entries) {
      results.push(await this.insert(entry));
    }
    return results;
  }

  async findRows(filter: UsageLedgerFilter): Promise<UsageLedgerRow[]> {
    const conditions = [];

    if (filter.sinceDay) {
      conditions.push(gte(usageLedger.day, filter.sinceDay));
    }
    if (filter.untilDay) {
      conditions.push(lte(usageLedger.day, filter.untilDay));
    }
    if (filter.agentId) {
      conditions.push(eq(usageLedger.agentId, filter.agentId));
    }
    if (filter.companyId) {
      conditions.push(eq(usageLedger.companyId, filter.companyId));
    }
    if (filter.provider) {
      conditions.push(eq(usageLedger.provider, filter.provider));
    }
    if (filter.model) {
      conditions.push(eq(usageLedger.model, filter.model));
    }

    const query = this.#db
      .select()
      .from(usageLedger)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const rows = await query;

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      companyId: row.companyId,
      provider: row.provider as any,
      model: row.model,
      inputTokens: row.inputTokens,
      cachedInputTokens: row.cachedInputTokens,
      cacheCreationTokens: row.cacheCreationTokens,
      outputTokens: row.outputTokens,
      reasoningTokens: row.reasoningTokens,
      costUsd: row.costUsd,
      cacheSavingsUsd: row.cacheSavingsUsd,
      turnId: row.turnId,
      day: row.day,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    }));
  }

  async count(filter?: UsageLedgerFilter): Promise<number> {
    const rows = await this.findRows(filter ?? {});
    return rows.length;
  }
}
