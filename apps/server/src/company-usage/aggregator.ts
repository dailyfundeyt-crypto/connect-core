/**
 * T3-Bridge — Company Usage Aggregator & Caching Engine (A20)
 *
 * Lane: A20 (Welle W2)
 *
 * Berechnet und cacht Token-Summen und Kosten pro Firma:
 *  - Stündlich gecachter Rollup in `company_usage_rollup` für 7d, 30d, all.
 *  - Aggregation aus `usage_ledger` je `company_id`.
 *  - Liefert `CompanyPublicUsage` gefiltert auf die Allowlist (Kosten nur wenn `showCost === true`).
 */

import { filterCompanyPublicUsage } from "./allowlist";
import type { ICompanyUsageStore } from "./store";
import type {
  CompanyPublicUsage,
  CompanyUsageRollupRow,
  RawCompanyAggregation,
  UsageRange,
} from "./types";

/** Lebensdauer des Rollup-Caches: 1 Stunde (in Millisekunden). */
export const ROLLUP_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Aggregiert die Token-Nutzung einer Firma und aktualisiert bei Bedarf den stündlichen Rollup.
 *
 * @param store - Daten-Store
 * @param companyId - Id der Firma
 * @param range - Zeitraum ("7d" | "30d" | "all")
 * @param options - Optionale Parameter (forceRefresh, now)
 */
export async function getOrComputeCompanyRollup(
  store: ICompanyUsageStore,
  companyId: string,
  range: UsageRange,
  options: { forceRefresh?: boolean; now?: Date } = {},
): Promise<CompanyUsageRollupRow> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();

  // 1. Prüfen, ob ein aktueller Rollup (< 1 Stunde) vorliegt
  if (!options.forceRefresh) {
    const existing = await store.getRollup(companyId, range);
    if (existing) {
      const computedMs = new Date(existing.computedAt).getTime();
      if (!Number.isNaN(computedMs) && nowMs - computedMs < ROLLUP_CACHE_TTL_MS) {
        return existing;
      }
    }
  }

  // 2. Neu aus dem Ledger aggregieren
  const raw = await store.getLedgerTotals(companyId, range, now);

  const newRollup: CompanyUsageRollupRow = {
    companyId,
    range,
    totalTokens: raw.totalTokens,
    costUsd: raw.costUsd,
    computedAt: now.toISOString(),
  };

  // 3. Rollup persistieren
  await store.saveRollup(newRollup);

  return newRollup;
}

/**
 * Ermittelt die öffentlichen 30-Tage-Nutzungsdaten einer Firma.
 *
 * Beachtet:
 *  - Wenn die Firma `public === false` eingestellt hat -> gibt `null` zurück!
 *  - Filterung strikt auf die Allowlist.
 *  - Kosten werden NUR geliefert, wenn `showCost === true`.
 *
 * @param store - Daten-Store
 * @param companyId - Id der Firma
 * @param options - Optionale Parameter (windowDays, forceRefresh, now)
 */
export async function getCompanyPublicUsage(
  store: ICompanyUsageStore,
  companyId: string,
  options: { windowDays?: number; forceRefresh?: boolean; now?: Date } = {},
): Promise<CompanyPublicUsage | null> {
  const settings = await store.getSettings(companyId);

  // Opt-out Prüfung: Ist die Firma auf privat gestellt?
  if (!settings.public) {
    return null;
  }

  const now = options.now ?? new Date();
  const range: UsageRange =
    options.windowDays === 7 ? "7d" : options.windowDays && options.windowDays > 30 ? "all" : "30d";

  // Für die vollständige öffentliche Ansicht mit byProvider aggregieren wir die Ledger-Summen
  // und aktualisieren parallel den stündlichen Rollup.
  const raw = await store.getLedgerTotals(companyId, range, now);

  // Snapshot im Rollup hinterlegen
  await store.saveRollup({
    companyId,
    range,
    totalTokens: raw.totalTokens,
    costUsd: raw.costUsd,
    computedAt: now.toISOString(),
  });

  // Strikt auf Allowlist filtern
  return filterCompanyPublicUsage(raw, settings.showCost);
}

/**
 * Aktualisiert alle Rollup-Snapshots für alle bekannten Firmen im Hintergrund.
 */
export async function refreshAllRollups(
  store: ICompanyUsageStore,
  range: UsageRange = "30d",
  now: Date = new Date(),
): Promise<void> {
  const companyIds = await store.listAllCompanyIds();
  for (const companyId of companyIds) {
    try {
      await getOrComputeCompanyRollup(store, companyId, range, {
        forceRefresh: true,
        now,
      });
    } catch (err) {
      console.warn(`[company-aggregator] Failed refreshing rollup for ${companyId}:`, err);
    }
  }
}
