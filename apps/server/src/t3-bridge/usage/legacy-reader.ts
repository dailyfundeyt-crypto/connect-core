/**
 * T3-Bridge — Ältere Connect-Usage Reader (A17)
 *
 * Lane: A17 (Welle W2)
 *
 * Bezieht ältere Connect-Usage-Quellen ein (Aufgabe 4):
 *  1. `codex.usage` aus dem Workspace-KV (Basis für CodexUsagePanel / codex-usage-panel.tsx)
 *  2. `cli_usage_samples` Tabelle (Drizzle Schema / Migration 0161)
 *
 * Diese Daten werden als zusätzliche Quelle einbezogen, nicht überschrieben
 * oder ersetzt.
 */

import type { Database } from "../../db/client";
import { connectWorkspaceKv } from "../../db/schema";
import { cliUsageSamples } from "../../db/schema/usage";
import { eq, gte, lte } from "drizzle-orm";
import type { UsageLedgerRow } from "./types";

export type LegacyCodexDay = {
  tokens: number;
  prompt: number;
  completion: number;
  calls: number;
};

export type LegacyCodexUsageStore = {
  days: Record<string, LegacyCodexDay>;
  totalTokens: number;
  peakDayTokens: number;
  peakDay: string | null;
};

export interface ILegacyUsageReader {
  /**
   * Liest historische Codex-/CLI-Bridge-Nutzungsdaten im angegebenen Datumsfenster.
   */
  readLegacyUsage(params: {
    sinceDay: string;
    untilDay: string;
    agentId?: string;
  }): Promise<UsageLedgerRow[]>;
}

/**
 * In-Memory-Implementierung für Tests und Umgebungen ohne Live-Datenbank.
 */
export class MemoryLegacyUsageReader implements ILegacyUsageReader {
  readonly #records: UsageLedgerRow[] = [];

  constructor(initialRecords: UsageLedgerRow[] = []) {
    this.#records = [...initialRecords];
  }

  addRecord(record: UsageLedgerRow): void {
    this.#records.push(record);
  }

  setCodexDays(
    days: Record<string, { prompt: number; completion: number; tokens?: number }>,
    options?: { agentId?: string; companyId?: string },
  ): void {
    for (const [day, val] of Object.entries(days)) {
      const input = val.prompt || 0;
      const output = val.completion || 0;
      const total = val.tokens ?? input + output;
      this.#records.push({
        id: `legacy-codex-${day}`,
        agentId: options?.agentId ?? null,
        companyId: options?.companyId ?? null,
        provider: "codex",
        model: "gpt-5",
        inputTokens: input,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: output,
        reasoningTokens: 0,
        costUsd: Number(((total / 1_000_000) * 10).toFixed(4)),
        cacheSavingsUsd: 0,
        turnId: null,
        day,
        createdAt: `${day}T12:00:00.000Z`,
      });
    }
  }

  async readLegacyUsage(params: {
    sinceDay: string;
    untilDay: string;
    agentId?: string;
  }): Promise<UsageLedgerRow[]> {
    return this.#records.filter((r) => {
      if (params.sinceDay && r.day < params.sinceDay) return false;
      if (params.untilDay && r.day > params.untilDay) return false;
      if (params.agentId && r.agentId !== params.agentId) return false;
      return true;
    });
  }
}

/**
 * Drizzle-gestützte Implementierung für Postgres.
 */
export class DrizzleLegacyUsageReader implements ILegacyUsageReader {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async readLegacyUsage(params: {
    sinceDay: string;
    untilDay: string;
    agentId?: string;
  }): Promise<UsageLedgerRow[]> {
    const results: UsageLedgerRow[] = [];

    // 1. Quelle: connectWorkspaceKv ("codex.usage")
    try {
      const [kvRow] = await this.#db
        .select()
        .from(connectWorkspaceKv)
        .where(eq(connectWorkspaceKv.key, "codex.usage"))
        .limit(1);

      if (kvRow && typeof kvRow.value === "object" && kvRow.value !== null) {
        const store = kvRow.value as Partial<LegacyCodexUsageStore>;
        const days = store.days ?? {};

        for (const [day, dayData] of Object.entries(days)) {
          if (day < params.sinceDay || day > params.untilDay) continue;
          const input = dayData.prompt ?? 0;
          const output = dayData.completion ?? 0;
          const total = dayData.tokens ?? input + output;

          results.push({
            id: `legacy-kv-${day}`,
            agentId: params.agentId ?? null,
            companyId: null,
            provider: "codex",
            model: "gpt-5",
            inputTokens: input,
            cachedInputTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: output,
            reasoningTokens: 0,
            costUsd: Number(((total / 1_000_000) * 10).toFixed(4)),
            cacheSavingsUsd: 0,
            turnId: null,
            day,
            createdAt: `${day}T12:00:00.000Z`,
          });
        }
      }
    } catch {
      // Wenn connectWorkspaceKv nicht existiert oder Tabelle leer ist, ignorieren
    }

    // 2. Quelle: cli_usage_samples (Migration 0161)
    try {
      const sinceDate = new Date(`${params.sinceDay}T00:00:00.000Z`);
      const untilDate = new Date(`${params.untilDay}T23:59:59.999Z`);

      const query = this.#db
        .select()
        .from(cliUsageSamples)
        .where(
          params.agentId
            ? eq(cliUsageSamples.agentId, params.agentId)
            : gte(cliUsageSamples.ts, sinceDate),
        );

      const samples = await query;
      for (const sample of samples) {
        if (sample.ts < sinceDate || sample.ts > untilDate) continue;
        const day = sample.ts.toISOString().slice(0, 10);
        results.push({
          id: `sample-${sample.id}`,
          agentId: sample.agentId ?? null,
          companyId: null,
          provider: (sample.cliKind as any) ?? "legacy",
          model: "legacy-model",
          inputTokens: sample.inputTokens ?? 0,
          cachedInputTokens: sample.cachedTokens ?? 0,
          cacheCreationTokens: 0,
          outputTokens: sample.outputTokens ?? 0,
          reasoningTokens: sample.reasoningTokens ?? 0,
          costUsd: Number(
            (
              ((sample.inputTokens ?? 0) * 2.5 + (sample.outputTokens ?? 0) * 10) /
              1_000_000
            ).toFixed(4),
          ),
          cacheSavingsUsd: 0,
          turnId: sample.sessionId ?? null,
          day,
          createdAt: sample.ts.toISOString(),
        });
      }
    } catch {
      // Wenn cliUsageSamples nicht vorhanden ist, ignorieren
    }

    return results;
  }
}
