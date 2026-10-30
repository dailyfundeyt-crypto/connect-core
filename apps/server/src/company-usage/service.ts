/**
 * T3-Bridge — Company Usage Service (A20)
 *
 * Lane: A20 (Welle W2)
 *
 * Zentraler Service für:
 *  - Öffentliche Firmen-Nutzung (`/api/companies/:id/public-usage`)
 *  - Sichtbarkeits-Einstellungen (`/api/companies/:id/usage-visibility`)
 *  - Globale Sieger-Tabelle (`/api/leaderboard/tokens`)
 */

import type { Database } from "../db/client";
import { getCompanyPublicUsage, getOrComputeCompanyRollup } from "./aggregator";
import {
  clearLeaderboardCache,
  queryLeaderboard,
} from "./leaderboard";
import {
  DrizzleCompanyUsageStore,
  type ICompanyUsageStore,
  MemoryCompanyUsageStore,
} from "./store";
import type {
  CompanyPublicUsage,
  CompanyUsageSettings,
  CompanyUsageVisibilityUpdate,
  LeaderboardResponse,
  UsageRange,
} from "./types";

export type CompanyUsageServiceOptions = {
  store?: ICompanyUsageStore;
  database?: Database;
  clock?: () => Date;
};

export class CompanyUsageService {
  readonly #store: ICompanyUsageStore;
  #clock: () => Date;

  constructor(options: CompanyUsageServiceOptions = {}) {
    this.#clock = options.clock ?? (() => new Date());

    if (options.store) {
      this.#store = options.store;
    } else if (options.database) {
      this.#store = new DrizzleCompanyUsageStore(options.database, {
        clock: this.#clock,
      });
    } else {
      this.#store = new MemoryCompanyUsageStore({
        clock: this.#clock,
      });
    }
  }

  get store(): ICompanyUsageStore {
    return this.#store;
  }

  setClock(clock: () => Date): void {
    this.#clock = clock;
    if (this.#store instanceof MemoryCompanyUsageStore) {
      this.#store.setClock(clock);
    } else if (this.#store instanceof DrizzleCompanyUsageStore) {
      this.#store.setClock(clock);
    }
  }

  /**
   * Ermittelt die öffentlichen 30-Tage-Nutzungsdaten einer Firma.
   * Liefert null, wenn die Firma privat ist (public === false).
   */
  async getPublicUsage(
    companyId: string,
    options: { windowDays?: number; forceRefresh?: boolean; now?: Date } = {},
  ): Promise<CompanyPublicUsage | null> {
    return getCompanyPublicUsage(this.#store, companyId, {
      ...options,
      now: options.now ?? this.#clock(),
    });
  }

  /**
   * Liest die Sichtbarkeits-Einstellungen einer Firma.
   */
  async getSettings(companyId: string): Promise<CompanyUsageSettings> {
    return this.#store.getSettings(companyId);
  }

  /**
   * Ändert die Sichtbarkeit einer Firma (nur Firmen-Admins).
   */
  async updateVisibility(
    companyId: string,
    update: CompanyUsageVisibilityUpdate,
  ): Promise<CompanyUsageSettings> {
    const updated = await this.#store.updateSettings(companyId, update);
    // Cache invalidieren, da sich die Sichtbarkeit auf das Leaderboard auswirkt
    clearLeaderboardCache();
    return updated;
  }

  /**
   * Ruft die globale Sieger-Tabelle ab.
   */
  async getLeaderboard(params: {
    range?: UsageRange;
    limit?: number;
    offset?: number;
    viewerCompanyId?: string;
    forceRefresh?: boolean;
    now?: Date;
  } = {}): Promise<LeaderboardResponse> {
    return queryLeaderboard(this.#store, {
      ...params,
      now: params.now ?? this.#clock(),
    });
  }

  /**
   * Leert alle Caches (für Tests).
   */
  clearCache(): void {
    clearLeaderboardCache();
  }
}

/**
 * Factory zur Erstellung des CompanyUsageService.
 */
export function createCompanyUsageService(
  options: CompanyUsageServiceOptions = {},
): CompanyUsageService {
  return new CompanyUsageService(options);
}
