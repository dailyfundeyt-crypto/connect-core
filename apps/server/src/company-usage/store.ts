/**
 * T3-Bridge — Company-Usage Data Store (A20)
 *
 * Lane: A20 (Welle W2)
 *
 * Datenhaltung für:
 *  - `company_usage_settings`: Sichtbarkeit (public=true default, show_cost=false default)
 *  - `company_usage_rollup`: Aggregations-Cache (stündlich) für 7d, 30d, all
 *  - `usage_ledger`: Ledger-Aggregation pro Firma
 *  - Firmen-Metadaten (Name, Logo)
 */

import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  companyUsageRollup,
  companyUsageSettings,
  usageLedger,
} from "../db/schema/t3";
import { connectWorkspaceKv } from "../db/schema";
import type {
  CompanyMetadata,
  CompanyUsageRollupRow,
  CompanyUsageSettings,
  CompanyUsageVisibilityUpdate,
  RawCompanyAggregation,
  UsageRange,
} from "./types";

export interface ICompanyUsageStore {
  getSettings(companyId: string): Promise<CompanyUsageSettings>;
  updateSettings(
    companyId: string,
    update: CompanyUsageVisibilityUpdate,
  ): Promise<CompanyUsageSettings>;
  getAllSettings(): Promise<Map<string, CompanyUsageSettings>>;

  getRollup(
    companyId: string,
    range: UsageRange,
  ): Promise<CompanyUsageRollupRow | null>;
  saveRollup(row: CompanyUsageRollupRow): Promise<void>;
  getRollupsForRange(range: UsageRange): Promise<CompanyUsageRollupRow[]>;

  getLedgerTotals(
    companyId: string,
    range: UsageRange,
    now?: Date,
  ): Promise<RawCompanyAggregation>;

  getCompanyMetadata(companyId: string): Promise<CompanyMetadata>;
  listAllCompanyIds(): Promise<string[]>;
}

/**
 * Wandelt einen UsageRange ("7d" | "30d" | "all") in Tage um.
 */
export function rangeToWindowDays(range: UsageRange): number {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "all":
      return 3650; // 10 Jahre als All-Zeit-Repräsentant
  }
}

/**
 * Berechnet das Startdatum (YYYY-MM-DD) für ein Zeitfenster.
 */
export function calculateSinceDay(range: UsageRange, now: Date = new Date()): string | null {
  if (range === "all") return null;
  const days = rangeToWindowDays(range);
  const pastMs = now.getTime() - (days - 1) * 24 * 60 * 60 * 1000;
  return new Date(pastMs).toISOString().slice(0, 10);
}

/**
 * In-Memory-Implementierung für Unit-Tests, CI und entkoppelte Umgebungen.
 */
export class MemoryCompanyUsageStore implements ICompanyUsageStore {
  readonly #settings = new Map<string, CompanyUsageSettings>();
  readonly #rollups = new Map<string, CompanyUsageRollupRow>(); // Key: `${companyId}:${range}`
  readonly #ledgerEntries: {
    companyId: string;
    provider: string;
    model: string;
    inputTokens: number;
    cachedInputTokens: number;
    cacheCreationTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    costUsd: number;
    day: string;
    createdAt: string;
  }[] = [];
  readonly #metadata = new Map<string, CompanyMetadata>();
  #clock: () => Date;

  constructor(options?: {
    clock?: () => Date;
    initialSettings?: Record<string, Partial<CompanyUsageSettings>>;
    initialMetadata?: Record<string, Partial<CompanyMetadata>>;
  }) {
    this.#clock = options?.clock ?? (() => new Date());

    if (options?.initialSettings) {
      for (const [companyId, s] of Object.entries(options.initialSettings)) {
        this.#settings.set(companyId, {
          companyId,
          public: s.public ?? true,
          showCost: s.showCost ?? false,
          updatedAt: s.updatedAt ?? this.#clock().toISOString(),
        });
      }
    }

    if (options?.initialMetadata) {
      for (const [companyId, m] of Object.entries(options.initialMetadata)) {
        this.#metadata.set(companyId, {
          companyId,
          companyName: m.companyName ?? companyId,
          logoUrl: m.logoUrl ?? null,
        });
      }
    }
  }

  setClock(clock: () => Date): void {
    this.#clock = clock;
  }

  async getSettings(companyId: string): Promise<CompanyUsageSettings> {
    const existing = this.#settings.get(companyId);
    if (existing) {
      return { ...existing };
    }
    // ENTSCHIEDEN: Standard ist public=true, showCost=false
    return {
      companyId,
      public: true,
      showCost: false,
      updatedAt: this.#clock().toISOString(),
    };
  }

  async updateSettings(
    companyId: string,
    update: CompanyUsageVisibilityUpdate,
  ): Promise<CompanyUsageSettings> {
    const current = await this.getSettings(companyId);
    const updated: CompanyUsageSettings = {
      companyId,
      public: update.public !== undefined ? Boolean(update.public) : current.public,
      showCost: update.showCost !== undefined ? Boolean(update.showCost) : current.showCost,
      updatedAt: this.#clock().toISOString(),
    };
    this.#settings.set(companyId, updated);
    return { ...updated };
  }

  async getAllSettings(): Promise<Map<string, CompanyUsageSettings>> {
    return new Map(this.#settings);
  }

  async getRollup(
    companyId: string,
    range: UsageRange,
  ): Promise<CompanyUsageRollupRow | null> {
    const key = `${companyId}:${range}`;
    const row = this.#rollups.get(key);
    return row ? { ...row } : null;
  }

  async saveRollup(row: CompanyUsageRollupRow): Promise<void> {
    const key = `${row.companyId}:${row.range}`;
    this.#rollups.set(key, { ...row });
  }

  async getRollupsForRange(range: UsageRange): Promise<CompanyUsageRollupRow[]> {
    const results: CompanyUsageRollupRow[] = [];
    for (const [key, row] of this.#rollups.entries()) {
      if (key.endsWith(`:${range}`)) {
        results.push({ ...row });
      }
    }
    return results;
  }

  /**
   * Hilfsmethode für Tests: Ledger-Eintrag hinzufügen.
   */
  addLedgerEntry(entry: {
    companyId: string;
    provider?: string;
    model?: string;
    inputTokens?: number;
    cachedInputTokens?: number;
    cacheCreationTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    costUsd?: number;
    day?: string;
    createdAt?: string;
  }): void {
    const now = this.#clock();
    this.#ledgerEntries.push({
      companyId: entry.companyId,
      provider: entry.provider ?? "anthropic",
      model: entry.model ?? "claude-3-5-sonnet",
      inputTokens: entry.inputTokens ?? 0,
      cachedInputTokens: entry.cachedInputTokens ?? 0,
      cacheCreationTokens: entry.cacheCreationTokens ?? 0,
      outputTokens: entry.outputTokens ?? 0,
      reasoningTokens: entry.reasoningTokens ?? 0,
      costUsd: entry.costUsd ?? 0,
      day: entry.day ?? now.toISOString().slice(0, 10),
      createdAt: entry.createdAt ?? now.toISOString(),
    });
  }

  async getLedgerTotals(
    companyId: string,
    range: UsageRange,
    nowDate?: Date,
  ): Promise<RawCompanyAggregation> {
    const now = nowDate ?? this.#clock();
    const sinceDay = calculateSinceDay(range, now);
    const windowDays = rangeToWindowDays(range);

    const relevant = this.#ledgerEntries.filter((e) => {
      if (e.companyId !== companyId) return false;
      if (sinceDay && e.day < sinceDay) return false;
      return true;
    });

    let totalTokens = 0;
    let costUsd = 0;
    const providerMap = new Map<string, { tokens: number; costUsd: number }>();

    for (const r of relevant) {
      const tokens =
        r.inputTokens +
        r.cachedInputTokens +
        r.cacheCreationTokens +
        r.outputTokens +
        r.reasoningTokens;

      totalTokens += tokens;
      costUsd += r.costUsd;

      const pEntry = providerMap.get(r.provider) ?? { tokens: 0, costUsd: 0 };
      pEntry.tokens += tokens;
      pEntry.costUsd += r.costUsd;
      providerMap.set(r.provider, pEntry);
    }

    const byProvider = Array.from(providerMap.entries()).map(([provider, data]) => ({
      provider,
      tokens: data.tokens,
      costUsd: Math.round(data.costUsd * 10000) / 10000,
    }));

    return {
      companyId,
      windowDays,
      totalTokens,
      costUsd: Math.round(costUsd * 10000) / 10000,
      byProvider,
      computedAt: now.toISOString(),
    };
  }

  setCompanyMetadata(companyId: string, meta: Partial<CompanyMetadata>): void {
    const current = this.#metadata.get(companyId) ?? {
      companyId,
      companyName: companyId,
      logoUrl: null,
    };
    this.#metadata.set(companyId, {
      companyId,
      companyName: meta.companyName ?? current.companyName,
      logoUrl: meta.logoUrl !== undefined ? meta.logoUrl : current.logoUrl,
    });
  }

  async getCompanyMetadata(companyId: string): Promise<CompanyMetadata> {
    const found = this.#metadata.get(companyId);
    if (found) return { ...found };
    return {
      companyId,
      companyName: companyId,
      logoUrl: null,
    };
  }

  async listAllCompanyIds(): Promise<string[]> {
    const set = new Set<string>();
    for (const id of this.#settings.keys()) set.add(id);
    for (const e of this.#ledgerEntries) if (e.companyId) set.add(e.companyId);
    for (const row of this.#rollups.values()) set.add(row.companyId);
    for (const id of this.#metadata.keys()) set.add(id);
    return Array.from(set);
  }

  clear(): void {
    this.#settings.clear();
    this.#rollups.clear();
    this.#ledgerEntries.length = 0;
    this.#metadata.clear();
  }
}

/**
 * Drizzle-Implementierung für die Speicherung in Postgres.
 */
export class DrizzleCompanyUsageStore implements ICompanyUsageStore {
  readonly #db: Database;
  #clock: () => Date;

  constructor(db: Database, options?: { clock?: () => Date }) {
    this.#db = db;
    this.#clock = options?.clock ?? (() => new Date());
  }

  setClock(clock: () => Date): void {
    this.#clock = clock;
  }

  async getSettings(companyId: string): Promise<CompanyUsageSettings> {
    try {
      const rows = await this.#db
        .select()
        .from(companyUsageSettings)
        .where(eq(companyUsageSettings.companyId, companyId))
        .limit(1);

      if (rows[0]) {
        return {
          companyId: rows[0].companyId,
          public: rows[0].public,
          showCost: rows[0].showCost,
          updatedAt: rows[0].updatedAt ? new Date(rows[0].updatedAt).toISOString() : undefined,
        };
      }
    } catch (err) {
      console.warn(`[company-usage-store] DB read failed for settings ${companyId}:`, err);
    }

    // ENTSCHIEDEN: Standard ist public=true, showCost=false
    return {
      companyId,
      public: true,
      showCost: false,
      updatedAt: this.#clock().toISOString(),
    };
  }

  async updateSettings(
    companyId: string,
    update: CompanyUsageVisibilityUpdate,
  ): Promise<CompanyUsageSettings> {
    const now = this.#clock();
    const current = await this.getSettings(companyId);

    const targetPublic = update.public !== undefined ? Boolean(update.public) : current.public;
    const targetShowCost = update.showCost !== undefined ? Boolean(update.showCost) : current.showCost;

    try {
      await this.#db
        .insert(companyUsageSettings)
        .values({
          companyId,
          public: targetPublic,
          showCost: targetShowCost,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: companyUsageSettings.companyId,
          set: {
            public: targetPublic,
            showCost: targetShowCost,
            updatedAt: now,
          },
        });
    } catch (err) {
      console.warn(`[company-usage-store] DB write failed for settings ${companyId}:`, err);
    }

    return {
      companyId,
      public: targetPublic,
      showCost: targetShowCost,
      updatedAt: now.toISOString(),
    };
  }

  async getAllSettings(): Promise<Map<string, CompanyUsageSettings>> {
    const map = new Map<string, CompanyUsageSettings>();
    try {
      const rows = await this.#db.select().from(companyUsageSettings);
      for (const r of rows) {
        map.set(r.companyId, {
          companyId: r.companyId,
          public: r.public,
          showCost: r.showCost,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
        });
      }
    } catch (err) {
      console.warn("[company-usage-store] DB read failed for all settings:", err);
    }
    return map;
  }

  async getRollup(
    companyId: string,
    range: UsageRange,
  ): Promise<CompanyUsageRollupRow | null> {
    try {
      const rows = await this.#db
        .select()
        .from(companyUsageRollup)
        .where(
          and(
            eq(companyUsageRollup.companyId, companyId),
            eq(companyUsageRollup.range, range),
          ),
        )
        .limit(1);

      if (rows[0]) {
        return {
          companyId: rows[0].companyId,
          range: rows[0].range as UsageRange,
          totalTokens: Number(rows[0].totalTokens) || 0,
          costUsd: Number(rows[0].costUsd) || 0,
          computedAt: rows[0].computedAt
            ? new Date(rows[0].computedAt).toISOString()
            : new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn(`[company-usage-store] DB read failed for rollup ${companyId}:${range}:`, err);
    }
    return null;
  }

  async saveRollup(row: CompanyUsageRollupRow): Promise<void> {
    try {
      const computedAt = new Date(row.computedAt);
      await this.#db
        .insert(companyUsageRollup)
        .values({
          companyId: row.companyId,
          range: row.range,
          totalTokens: Math.floor(row.totalTokens),
          costUsd: row.costUsd,
          computedAt,
        })
        .onConflictDoUpdate({
          target: [companyUsageRollup.companyId, companyUsageRollup.range],
          set: {
            totalTokens: Math.floor(row.totalTokens),
            costUsd: row.costUsd,
            computedAt,
          },
        });
    } catch (err) {
      console.warn(`[company-usage-store] DB write failed for rollup ${row.companyId}:${row.range}:`, err);
    }
  }

  async getRollupsForRange(range: UsageRange): Promise<CompanyUsageRollupRow[]> {
    try {
      const rows = await this.#db
        .select()
        .from(companyUsageRollup)
        .where(eq(companyUsageRollup.range, range));

      return rows.map((r) => ({
        companyId: r.companyId,
        range: r.range as UsageRange,
        totalTokens: Number(r.totalTokens) || 0,
        costUsd: Number(r.costUsd) || 0,
        computedAt: r.computedAt ? new Date(r.computedAt).toISOString() : new Date().toISOString(),
      }));
    } catch (err) {
      console.warn(`[company-usage-store] DB read failed for rollups ${range}:`, err);
      return [];
    }
  }

  async getLedgerTotals(
    companyId: string,
    range: UsageRange,
    nowDate?: Date,
  ): Promise<RawCompanyAggregation> {
    const now = nowDate ?? this.#clock();
    const sinceDay = calculateSinceDay(range, now);
    const windowDays = rangeToWindowDays(range);

    let totalTokens = 0;
    let costUsd = 0;
    const providerMap = new Map<string, { tokens: number; costUsd: number }>();

    try {
      const conditions = [eq(usageLedger.companyId, companyId)];
      if (sinceDay) {
        conditions.push(sql`${usageLedger.day} >= ${sinceDay}`);
      }

      const rows = await this.#db
        .select({
          provider: usageLedger.provider,
          inputTokens: usageLedger.inputTokens,
          cachedInputTokens: usageLedger.cachedInputTokens,
          cacheCreationTokens: usageLedger.cacheCreationTokens,
          outputTokens: usageLedger.outputTokens,
          reasoningTokens: usageLedger.reasoningTokens,
          costUsd: usageLedger.costUsd,
        })
        .from(usageLedger)
        .where(and(...conditions));

      for (const r of rows) {
        const tokens =
          (r.inputTokens ?? 0) +
          (r.cachedInputTokens ?? 0) +
          (r.cacheCreationTokens ?? 0) +
          (r.outputTokens ?? 0) +
          (r.reasoningTokens ?? 0);

        totalTokens += tokens;
        costUsd += r.costUsd ?? 0;

        const p = r.provider || "unknown";
        const pEntry = providerMap.get(p) ?? { tokens: 0, costUsd: 0 };
        pEntry.tokens += tokens;
        pEntry.costUsd += r.costUsd ?? 0;
        providerMap.set(p, pEntry);
      }
    } catch (err) {
      console.warn(`[company-usage-store] DB aggregation failed for ${companyId}:`, err);
    }

    const byProvider = Array.from(providerMap.entries()).map(([provider, data]) => ({
      provider,
      tokens: data.tokens,
      costUsd: Math.round(data.costUsd * 10000) / 10000,
    }));

    return {
      companyId,
      windowDays,
      totalTokens,
      costUsd: Math.round(costUsd * 10000) / 10000,
      byProvider,
      computedAt: now.toISOString(),
    };
  }

  async getCompanyMetadata(companyId: string): Promise<CompanyMetadata> {
    try {
      // 1. Aus connectWorkspaceKv lesen
      const rows = await this.#db
        .select({ value: connectWorkspaceKv.value })
        .from(connectWorkspaceKv)
        .where(sql`${connectWorkspaceKv.key} LIKE '%connect.companies.custom%'`);

      for (const r of rows) {
        let raw = r.value;
        if (typeof raw === "string") {
          try {
            raw = JSON.parse(raw);
          } catch {
            raw = null;
          }
        }
        const arr = Array.isArray(raw)
          ? raw
          : raw && typeof raw === "object" && Array.isArray((raw as any).companies)
            ? (raw as any).companies
            : [];

        for (const item of arr) {
          if (item && typeof item === "object" && item.id === companyId) {
            return {
              companyId,
              companyName: String(item.name || companyId),
              logoUrl: item.logo ? String(item.logo) : null,
            };
          }
        }
      }
    } catch {
      // Ignore
    }

    return {
      companyId,
      companyName: companyId,
      logoUrl: null,
    };
  }

  async listAllCompanyIds(): Promise<string[]> {
    const ids = new Set<string>();

    try {
      // Aus Ledger
      const ledgerRows = await this.#db
        .selectDistinct({ companyId: usageLedger.companyId })
        .from(usageLedger)
        .where(sql`${usageLedger.companyId} IS NOT NULL`);
      for (const r of ledgerRows) {
        if (r.companyId) ids.add(r.companyId);
      }

      // Aus Settings
      const settingRows = await this.#db
        .select({ companyId: companyUsageSettings.companyId })
        .from(companyUsageSettings);
      for (const r of settingRows) {
        if (r.companyId) ids.add(r.companyId);
      }

      // Aus Rollups
      const rollupRows = await this.#db
        .selectDistinct({ companyId: companyUsageRollup.companyId })
        .from(companyUsageRollup);
      for (const r of rollupRows) {
        if (r.companyId) ids.add(r.companyId);
      }
    } catch (err) {
      console.warn("[company-usage-store] DB list companies failed:", err);
    }

    return Array.from(ids);
  }
}
