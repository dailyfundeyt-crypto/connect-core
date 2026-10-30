/**
 * ledger-client.ts — Usage-Ledger Anbindung für Token-Sparen (A14)
 *
 * Verwaltet das Schreiben der Turn-Messungen (Tokens vorher/nachher,
 * Kennzeichen `saving_applied`, cacheSavingsUsd und angewandte Regeln)
 * in das Usage-Ledger (A17).
 *
 * Da A17 laut Abhängigkeitsmatrix noch im Entstehen ist, stellt dieses Modul
 * eine vollständige, typsichere Mock- und Integrationsschicht bereit, die
 * 1:1 den Verträgen aus A01 (`UsageLedgerRow`) entspricht.
 */

import { randomUUID } from "node:crypto";
import type {
  IUsageLedgerClient,
  TokenSavingLedgerEntry,
  TurnTokenMeasurement,
} from "./types";
import { getPricingForModel } from "./token-estimator";

/**
 * In-Memory Mock-Client für das Usage-Ledger (A17 Mock).
 */
export class MockUsageLedgerClient implements IUsageLedgerClient {
  private entries: TokenSavingLedgerEntry[] = [];

  async recordTurnSaving(measurement: TurnTokenMeasurement): Promise<TokenSavingLedgerEntry> {
    const today = new Date().toISOString().slice(0, 10);
    const pricing = getPricingForModel(measurement.model);

    // Gesamtkosten berechnen
    const costUsd =
      (measurement.optimizedInputTokens / 1_000_000) * pricing.inputPerMillion +
      (measurement.outputTokens / 1_000_000) * pricing.outputPerMillion;

    const entry: TokenSavingLedgerEntry = {
      id: randomUUID(),
      agentId: measurement.agentId ?? null,
      companyId: measurement.companyId ?? null,
      provider: (measurement.provider as any) || "claude",
      model: measurement.model,
      // A01 UsageLedgerRow Basisfelder
      inputTokens: measurement.optimizedInputTokens,
      cachedInputTokens: measurement.cachedInputTokens,
      cacheCreationTokens: measurement.cacheCreationTokens,
      outputTokens: measurement.outputTokens,
      reasoningTokens: measurement.reasoningTokens,
      costUsd: Math.round(costUsd * 100_000) / 100_000,
      cacheSavingsUsd: measurement.cacheSavingsUsd,
      turnId: measurement.turnId,
      day: today,
      createdAt: measurement.timestamp || new Date().toISOString(),
      // A14 Spezifische Erweiterungen
      saving_applied: measurement.saving_applied,
      rawInputTokens: measurement.rawInputTokens,
      savedTokens: measurement.savedTokens,
      rulesApplied: [...measurement.rulesApplied],
    };

    this.entries.push(entry);
    return entry;
  }

  async getEntries(): Promise<TokenSavingLedgerEntry[]> {
    return [...this.entries];
  }

  async getEntryByTurnId(turnId: string): Promise<TokenSavingLedgerEntry | undefined> {
    return this.entries.find((e) => e.turnId === turnId);
  }

  /**
   * Liefert eine aggregierte Statistik über alle erfassten Turns.
   */
  async getSummary(): Promise<{
    totalTurns: number;
    totalRawInputTokens: number;
    totalOptimizedInputTokens: number;
    totalSavedTokens: number;
    totalSavedCostUsd: number;
    totalCacheSavingsUsd: number;
    savingAppliedCount: number;
  }> {
    let totalRaw = 0;
    let totalOptimized = 0;
    let totalSaved = 0;
    let totalCacheSavings = 0;
    let appliedCount = 0;

    for (const e of this.entries) {
      totalRaw += e.rawInputTokens;
      totalOptimized += e.inputTokens;
      totalSaved += e.savedTokens;
      totalCacheSavings += e.cacheSavingsUsd;
      if (e.saving_applied) appliedCount += 1;
    }

    return {
      totalTurns: this.entries.length,
      totalRawInputTokens: totalRaw,
      totalOptimizedInputTokens: totalOptimized,
      totalSavedTokens: totalSaved,
      totalSavedCostUsd: Math.round(((totalRaw - totalOptimized) / 1_000_000) * 3.0 * 100) / 100,
      totalCacheSavingsUsd: Math.round(totalCacheSavings * 100) / 100,
      savingAppliedCount: appliedCount,
    };
  }

  /**
   * Bereinigt alle Einträge (für Tests).
   */
  clear(): void {
    this.entries = [];
  }
}

// Globaler Singleton für Laufzeit- und Modul-übergreifenden Zugriff
let globalLedgerInstance: IUsageLedgerClient = new MockUsageLedgerClient();

export function getGlobalTokenSavingLedger(): IUsageLedgerClient {
  return globalLedgerInstance;
}

export function setGlobalTokenSavingLedger(ledger: IUsageLedgerClient): void {
  globalLedgerInstance = ledger;
}
