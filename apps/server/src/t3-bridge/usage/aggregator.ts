/**
 * T3-Bridge — Usage Aggregator & Reconciliation (A17)
 *
 * Lane: A17 (Welle W2)
 *
 * Aggregiert Nutzungsdaten aus:
 *  1. Connect Usage-Ledger (pro Agent, pro Firma, pro Modell, pro Provider)
 *  2. Älteren Connect-Quellen (CodexUsagePanel / connectWorkspaceKv / cliUsageSamples)
 *  3. T3-Sidecar getUsageSummary & Limits
 *
 * Unterstützt Zeitfenster (7/30/90/365 Tage), IANA-Zeitzone (Europe/Berlin),
 * verschiedene Gruppierungen (agent, cli, model, company, day) und Metriken.
 */

import { T3_PROVIDER_LABELS } from "../contracts";
import type {
  T3ProviderId,
  T3ProviderLimit,
  UsageBucket,
  UsageGroupBy,
  UsageLedgerRow,
  UsageMetric,
  UsageQuery,
  UsageResponse,
} from "./types";
import type {
  LedgerT3Reconciliation,
  ReconciliationReport,
} from "./types";
import type { T3UsageSummary } from "../rpc";

/**
 * Ermittelt das Datum (YYYY-MM-DD) für ein Datumsobjekt in einer bestimmten Zeitzone.
 */
export function formatDayInTimeZone(date: Date, timeZone: string = "Europe/Berlin"): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  } catch {
    // Fallback falls Zeitzone ungültig
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Berechnet das Start- und Enddatum für ein Zeitfenster in Tagen.
 */
export function calculateWindowDays(
  windowDays: number,
  timeZone: string = "Europe/Berlin",
  now: Date = new Date(),
): { sinceDay: string; untilDay: string } {
  const safeDays = Math.max(1, Math.min(365, Math.floor(windowDays) || 30));
  const untilDay = formatDayInTimeZone(now, timeZone);

  // Da windowDays Tage inklusive heute zählen, ziehen wir (windowDays - 1) Tage ab
  const pastMs = now.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1000;
  const sinceDay = formatDayInTimeZone(new Date(pastMs), timeZone);

  return { sinceDay, untilDay };
}

/**
 * Erzeugt einen leeren Bucket mit Standardwerten.
 */
export function createEmptyBucket(key: string, label: string): UsageBucket {
  return {
    key,
    label,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    cacheSavingsUsd: 0,
    turns: 0,
  };
}

/**
 * Ermittelt ein anwenderfreundliches Label für einen Provider.
 */
export function getProviderDisplayLabel(provider: string): string {
  if (provider in T3_PROVIDER_LABELS) {
    return T3_PROVIDER_LABELS[provider as T3ProviderId];
  }
  if (provider === "legacy") return "Connect Legacy CLI";
  if (provider === "cloud") return "Connect Cloud Engine";
  return provider;
}

/**
 * Führt die Gruppierung und Aggregation von Ledger-Zeilen durch.
 */
export function aggregateLedgerRows(
  rows: readonly UsageLedgerRow[],
  query: UsageQuery,
): { buckets: UsageBucket[]; totals: UsageBucket } {
  const bucketMap = new Map<string, UsageBucket>();

  const totals = createEmptyBucket("total", "Gesamt");

  for (const row of rows) {
    let key = "";
    let label = "";

    switch (query.groupBy) {
      case "agent":
        key = row.agentId || "unassigned";
        label = row.agentId ? `Agent ${row.agentId}` : "Nicht zugeordnet";
        break;
      case "cli":
        key = row.provider || "unbekannt";
        label = getProviderDisplayLabel(key);
        break;
      case "model":
        key = row.model || "unbekannt";
        label = row.model || "Unbekanntes Modell";
        break;
      case "company":
        key = row.companyId || "default";
        label = row.companyId ? `Firma ${row.companyId}` : "Standard-Firma";
        break;
      case "day":
        key = row.day;
        label = row.day;
        break;
      default:
        key = row.agentId || "unassigned";
        label = row.agentId ? `Agent ${row.agentId}` : "Nicht zugeordnet";
    }

    let b = bucketMap.get(key);
    if (!b) {
      b = createEmptyBucket(key, label);
      bucketMap.set(key, b);
    }

    const rowTotal =
      row.inputTokens +
      row.cachedInputTokens +
      row.cacheCreationTokens +
      row.outputTokens;

    // Bucket befüllen
    b.inputTokens += row.inputTokens;
    b.cachedInputTokens += row.cachedInputTokens;
    b.cacheCreationTokens += row.cacheCreationTokens;
    b.outputTokens += row.outputTokens;
    b.reasoningTokens += row.reasoningTokens;
    b.totalTokens += rowTotal;
    b.costUsd = Number((b.costUsd + row.costUsd).toFixed(6));
    b.cacheSavingsUsd = Number((b.cacheSavingsUsd + row.cacheSavingsUsd).toFixed(6));
    b.turns += 1;

    // Totals befüllen
    totals.inputTokens += row.inputTokens;
    totals.cachedInputTokens += row.cachedInputTokens;
    totals.cacheCreationTokens += row.cacheCreationTokens;
    totals.outputTokens += row.outputTokens;
    totals.reasoningTokens += row.reasoningTokens;
    totals.totalTokens += rowTotal;
    totals.costUsd = Number((totals.costUsd + row.costUsd).toFixed(6));
    totals.cacheSavingsUsd = Number(
      (totals.cacheSavingsUsd + row.cacheSavingsUsd).toFixed(6),
    );
    totals.turns += 1;
  }

  // Sortierung: Bei 'day' chronologisch aufsteigend, sonst absteigend nach totalTokens
  const buckets = Array.from(bucketMap.values());
  if (query.groupBy === "day") {
    buckets.sort((a, b) => a.key.localeCompare(b.key));
  } else {
    buckets.sort((a, b) => b.totalTokens - a.totalTokens);
  }

  return { buckets, totals };
}

/**
 * Führt den Abgleich zwischen Connect Ledger und T3 Summary durch.
 */
export function reconcileLedgerWithT3(
  ledgerRows: readonly UsageLedgerRow[],
  t3Summary: T3UsageSummary,
  windowDays: number,
  timeZone: string = "Europe/Berlin",
): ReconciliationReport {
  const { sinceDay, untilDay } = calculateWindowDays(windowDays, timeZone);

  // 1. Ledger nach Provider summieren
  const ledgerByProvider = new Map<string, { tokens: number; cost: number }>();
  let totalLedgerTokens = 0;

  for (const row of ledgerRows) {
    const cur = ledgerByProvider.get(row.provider) ?? { tokens: 0, cost: 0 };
    const rowTokens =
      row.inputTokens +
      row.cachedInputTokens +
      row.cacheCreationTokens +
      row.outputTokens;
    cur.tokens += rowTokens;
    cur.cost += row.costUsd;
    ledgerByProvider.set(row.provider, cur);
    totalLedgerTokens += rowTokens;
  }

  // 2. T3 Buckets nach Provider summieren
  const t3ByProvider = new Map<string, { tokens: number; cost: number }>();
  let totalT3Tokens = 0;

  for (const bucket of t3Summary.buckets ?? []) {
    const p = bucket.provider ?? "unbekannt";
    const cur = t3ByProvider.get(p) ?? { tokens: 0, cost: 0 };
    const totals = bucket.totals ?? {};
    const uncached = totals.uncachedInputTokens ?? 0;
    const cached = totals.cachedInputTokens ?? 0;
    const cacheCreation = totals.cacheCreationTokens ?? 0;
    const output = totals.outputTokens ?? 0;
    const bucketTokens = uncached + cached + cacheCreation + output;

    cur.tokens += bucketTokens;
    cur.cost += bucket.costUsd ?? 0;
    t3ByProvider.set(p, cur);
    totalT3Tokens += bucketTokens;
  }

  // 3. Alle bekannten Provider vergleichen
  const allProviders = new Set([
    ...ledgerByProvider.keys(),
    ...t3ByProvider.keys(),
  ]);

  const providerReports: LedgerT3Reconciliation[] = [];

  for (const provider of allProviders) {
    const lData = ledgerByProvider.get(provider) ?? { tokens: 0, cost: 0 };
    const tData = t3ByProvider.get(provider) ?? { tokens: 0, cost: 0 };

    const tokenDiff = lData.tokens - tData.tokens;
    const costDiff = lData.cost - tData.cost;

    const baseTokens = Math.max(lData.tokens, tData.tokens);
    const tokenDevPercent =
      baseTokens > 0
        ? Number(((Math.abs(tokenDiff) / baseTokens) * 100).toFixed(2))
        : 0;

    const baseCost = Math.max(lData.cost, tData.cost);
    const costDevPercent =
      baseCost > 0
        ? Number(((Math.abs(costDiff) / baseCost) * 100).toFixed(2))
        : 0;

    let explanation = "Summen stimmen exakt überein.";
    if (tokenDiff > 0) {
      explanation = `Connect Ledger enthält ${tokenDiff.toLocaleString("de-DE")} Tokens mehr (z. B. Connect-spezifische Turns oder ältere Legacy-Historie).`;
    } else if (tokenDiff < 0) {
      explanation = `T3 Sidecar meldet ${Math.abs(tokenDiff).toLocaleString("de-DE")} Tokens mehr (z. B. autonome T3-Hintergrundscans oder externe CLI-Aufrufe außerhalb von Connect).`;
    }

    providerReports.push({
      provider,
      ledgerTokens: lData.tokens,
      t3Tokens: tData.tokens,
      tokenDifference: tokenDiff,
      tokenDeviationPercent: tokenDevPercent,
      ledgerCostUsd: Number(lData.cost.toFixed(4)),
      t3CostUsd: Number(tData.cost.toFixed(4)),
      costDifference: Number(costDiff.toFixed(4)),
      costDeviationPercent: costDevPercent,
      explanation,
    });
  }

  const baseTotal = Math.max(totalLedgerTokens, totalT3Tokens);
  const totalDevPercent =
    baseTotal > 0
      ? Number(
          ((Math.abs(totalLedgerTokens - totalT3Tokens) / baseTotal) * 100).toFixed(
            2,
          ),
        )
      : 0;

  return {
    windowDays,
    sinceDay,
    untilDay,
    timeZone,
    providers: providerReports,
    totalLedgerTokens,
    totalT3Tokens,
    overallTokenDeviationPercent: totalDevPercent,
    explanation:
      totalDevPercent === 0
        ? "Vollständige Übereinstimmung zwischen Connect Ledger und T3-Sidecar."
        : `Geringfügige Abweichung von ${totalDevPercent}%: Erklärbar durch Connect-Agent-Zuordnung vs. aggregierte Sidecar-Dateisystemscans.`,
  };
}
