/**
 * T3-Bridge — Globale Sieger-Tabelle (Leaderboard API) (A20)
 *
 * Lane: A20 (Welle W2)
 *
 * Berechnet die Rangliste aller Unternehmen nach verbrauchten Tokens:
 *  - Wettkampf-Rangfolge ("1, 1, 3" bei Gleichstand)
 *  - Nur Firmen mit `public === true` (Default: true für alle Firmen)
 *  - Firmen mit 0 Tokens im Zeitraum erscheinen NICHT
 *  - Strengste Allowlist: Nur rank, companyId, companyName, logoUrl, tokens
 *  - Berechnung aus `company_usage_rollup`
 *  - 15-Minuten-Cache
 *  - Eigener Rang der Firma des Aufrufers (`viewerCompanyRank`)
 *  - Paging via limit und offset
 */

import { filterLeaderboardEntry } from "./allowlist";
import { getOrComputeCompanyRollup } from "./aggregator";
import type { ICompanyUsageStore } from "./store";
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  UsageRange,
} from "./types";

/** Lebensdauer des Leaderboard-Caches: 15 Minuten (in Millisekunden). */
export const LEADERBOARD_CACHE_TTL_MS = 15 * 60 * 1000;

type CachedLeaderboard = {
  rankedAll: LeaderboardEntry[];
  cachedAtMs: number;
};

/**
 * Cache für die vollständige Sieger-Tabelle je Zeitraum ("7d" | "30d" | "all").
 */
const leaderboardMemoryCache = new Map<UsageRange, CachedLeaderboard>();

/**
 * Leert den Leaderboard-Cache (für Tests oder nach erzwungenem Refresh).
 */
export function clearLeaderboardCache(): void {
  leaderboardMemoryCache.clear();
}

/**
 * Berechnet oder holt aus dem Cache die vollständige sortierte und rangierte Liste aller Firmen.
 */
export async function getFullRankedLeaderboard(
  store: ICompanyUsageStore,
  range: UsageRange,
  options: { forceRefresh?: boolean; now?: Date } = {},
): Promise<{ rankedAll: LeaderboardEntry[]; cachedAt: string }> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();

  // 1. In-Memory-Cache prüfen (15 Minuten Gültigkeit)
  if (!options.forceRefresh) {
    const cached = leaderboardMemoryCache.get(range);
    if (cached && nowMs - cached.cachedAtMs < LEADERBOARD_CACHE_TTL_MS) {
      return {
        rankedAll: cached.rankedAll,
        cachedAt: new Date(cached.cachedAtMs).toISOString(),
      };
    }
  }

  // 2. Alle Firmen-IDs zusammentragen
  const companyIds = await store.listAllCompanyIds();

  // 3. Einstellungen aller Firmen laden (für schnellen Lookup)
  const allSettings = await store.getAllSettings();

  // 4. Tokens für jede Firma im gewählten Zeitraum ermitteln
  type CompanyCandidate = {
    companyId: string;
    companyName: string;
    logoUrl: string | null;
    tokens: number;
  };

  const candidates: CompanyCandidate[] = [];

  for (const companyId of companyIds) {
    // Sichtbarkeitsprüfung: Standard ist public=true (auch wenn kein DB-Eintrag existiert)
    const settings = allSettings.get(companyId) ?? (await store.getSettings(companyId));
    if (!settings.public) {
      // Opt-out: Firma will nicht öffentlich gelistet werden
      continue;
    }

    // Rollup-Daten für den gewählten Zeitraum laden (stündlich gecacht)
    const rollup = await getOrComputeCompanyRollup(store, companyId, range, {
      forceRefresh: options.forceRefresh,
      now,
    });

    // Anforderung 6: Firmen mit 0 Tokens im Zeitraum erscheinen nicht!
    if (rollup.totalTokens <= 0) {
      continue;
    }

    // Firmen-Metadaten (Name, Logo)
    const meta = await store.getCompanyMetadata(companyId);

    candidates.push({
      companyId,
      companyName: meta.companyName,
      logoUrl: meta.logoUrl,
      tokens: rollup.totalTokens,
    });
  }

  // 5. Absteigend nach Tokens sortieren
  // Bei Gleichstand: Deterministische Sortierung nach Firmenname und Id
  candidates.sort((a, b) => {
    if (b.tokens !== a.tokens) {
      return b.tokens - a.tokens;
    }
    const nameCmp = a.companyName.localeCompare(b.companyName);
    if (nameCmp !== 0) return nameCmp;
    return a.companyId.localeCompare(b.companyId);
  });

  // 6. Wettkampf-Rangfolge berechnen ("1, 1, 3")
  // Erste Firma: Rang 1
  // Jede weitere Firma: Wenn gleiche Tokens wie die vorherige -> gleicher Rang
  //                     Wenn weniger Tokens -> Rang = tatsächlicher Index + 1
  let previousTokens = -1;
  let previousRank = 0;

  const rankedAll: LeaderboardEntry[] = candidates.map((item, index) => {
    let rank = index + 1;
    if (index > 0 && item.tokens === previousTokens) {
      rank = previousRank;
    } else {
      previousRank = rank;
    }
    previousTokens = item.tokens;

    return filterLeaderboardEntry({
      rank,
      companyId: item.companyId,
      companyName: item.companyName,
      logoUrl: item.logoUrl,
      tokens: item.tokens,
    });
  });

  // 7. Im 15-Minuten-Cache speichern
  leaderboardMemoryCache.set(range, {
    rankedAll,
    cachedAtMs: nowMs,
  });

  return {
    rankedAll,
    cachedAt: now.toISOString(),
  };
}

/**
 * Ruft die Sieger-Tabelle mit Paging und Aufrufer-Rang ab.
 */
export async function queryLeaderboard(
  store: ICompanyUsageStore,
  params: {
    range?: UsageRange;
    limit?: number;
    offset?: number;
    viewerCompanyId?: string;
    forceRefresh?: boolean;
    now?: Date;
  } = {},
): Promise<LeaderboardResponse> {
  const range: UsageRange = params.range === "7d" || params.range === "all" ? params.range : "30d";
  const limit = Math.max(1, Math.min(500, Math.floor(Number(params.limit) || 100)));
  const offset = Math.max(0, Math.floor(Number(params.offset) || 0));

  const { rankedAll, cachedAt } = await getFullRankedLeaderboard(store, range, {
    forceRefresh: params.forceRefresh,
    now: params.now,
  });

  const total = rankedAll.length;

  // Paging anwenden
  const entries = rankedAll.slice(offset, offset + limit);

  // Eigener Rang der Aufrufer-Firma ermitteln
  let viewerCompanyRank: LeaderboardEntry | null = null;
  if (params.viewerCompanyId) {
    const found = rankedAll.find((e) => e.companyId === params.viewerCompanyId);
    if (found) {
      viewerCompanyRank = found;
    }
  }

  return {
    entries,
    leaderboard: entries, // Alias
    viewerCompanyRank,
    viewerCompany: viewerCompanyRank, // Alias
    range,
    total,
    limit,
    offset,
    cachedAt,
  };
}
