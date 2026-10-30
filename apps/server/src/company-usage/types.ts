/**
 * T3-Bridge — Firmen-Token-Aggregation & Sieger-Tabelle Typen (A20)
 *
 * Lane: A20 (Welle W2)
 *
 * Beinhaltet:
 *  - CompanyPublicUsage (Allowlist-Felder für öffentliches Firmenprofil)
 *  - CompanyUsageSettings (Sichtbarkeits-Einstellungen je Firma)
 *  - LeaderboardEntry & LeaderboardResponse (Globale Sieger-Tabelle)
 *  - Rollup- und Store-Schnittstellen
 */

import type { T3ProviderId } from "../t3-bridge/contracts";

/**
 * Aggregationszeitraum für Sieger-Tabelle und Rollups.
 * "7d"  = Letzte 7 Tage
 * "30d" = Letzte 30 Tage
 * "all" = Gesamter Zeitraum
 */
export type UsageRange = "7d" | "30d" | "all";

/**
 * Öffentlich sichtbare Nutzungsdaten eines Unternehmens.
 *
 * DATENSCHUTZ: Ausschließlich Summen!
 * Streng KEINE Prompts, Antworten, Dateinamen, Keys, Agenten-Details oder Nutzer-IDs.
 */
export type CompanyPublicUsage = {
  companyId: string;
  /** Zeitraum in Tagen (Standard: 30). */
  windowDays: number;
  /** Summe aller verbrauchten Tokens im Zeitraum. */
  totalTokens: number;
  /**
   * Gesamtkosten in USD.
   * Streng optional: Wird NUR mitgeliefert, wenn `showCost === true`.
   */
  costUsd?: number;
  /**
   * Aufteilung je Provider/CLI (nur Summen pro Provider-Kategorie).
   * Keine individuellen Agentennamen oder Modell-Prompts.
   */
  byProvider: {
    provider: string;
    tokens: number;
    costUsd?: number;
  }[];
  /** Zeitstempel der Aggregation (ISO 8601). */
  computedAt: string;
};

/**
 * Einstellungen eines Unternehmens zur Token- und Kosten-Sichtbarkeit.
 */
export type CompanyUsageSettings = {
  companyId: string;
  /**
   * Token-Summen öffentlich anzeigen (Opt-out).
   * ENTSCHIEDEN: Standard ist `true` (auch für neue/bestehende Firmen ohne DB-Eintrag).
   */
  public: boolean;
  /**
   * Kostenbetrag in USD öffentlich anzeigen.
   * Standard ist `false` (Kosten sind sensibel).
   */
  showCost: boolean;
  /** Wann die Einstellung zuletzt geändert wurde (ISO 8601). */
  updatedAt?: string;
};

/**
 * Aktualisierungs-Payload für die Sichtbarkeit (nur Firmen-Admins).
 */
export type CompanyUsageVisibilityUpdate = {
  public?: boolean;
  showCost?: boolean;
};

/**
 * Ein Eintrag in der globalen Sieger-Tabelle (Rangliste nach Tokens).
 *
 * ALLOWLIST: Nur rank, companyId, companyName, logoUrl, tokens.
 * Streng KEINE Agenten, CLIs, Kosten, Nutzer oder Inhalte.
 */
export type LeaderboardEntry = {
  /** Rang in der Wettkampf-Rangfolge (z. B. 1, 1, 3 bei Gleichstand). */
  rank: number;
  companyId: string;
  companyName: string;
  logoUrl: string | null;
  tokens: number;
};

/**
 * Antwort der Sieger-Tabellen-API (`GET /api/leaderboard/tokens`).
 */
export type LeaderboardResponse = {
  /** Die Liste der rangierten Unternehmen (Allowlist-Felder). */
  entries: LeaderboardEntry[];
  /** Alias für direkte Iteration. */
  leaderboard: LeaderboardEntry[];
  /**
   * Eigener Rang der Firma des Aufrufers (sofern ermittelt/zugeordnet).
   * Auch dann vorhanden, wenn die Firma außerhalb des aktuellen Limit/Offset Fensters liegt.
   */
  viewerCompanyRank?: LeaderboardEntry | null;
  /** Alias für viewerCompanyRank. */
  viewerCompany?: LeaderboardEntry | null;
  /** Gewählter Zeitraum ("7d" | "30d" | "all"). */
  range: UsageRange;
  /** Gesamtzahl aller öffentlichen Firmen mit >0 Tokens im Zeitraum. */
  total: number;
  /** Paging Limit. */
  limit: number;
  /** Paging Offset. */
  offset: number;
  /** Zeitstempel des Caches (ISO 8601). */
  cachedAt?: string;
};

/**
 * Zeile im aggregierten Rollup-Cache (`company_usage_rollup`).
 */
export type CompanyUsageRollupRow = {
  companyId: string;
  range: UsageRange;
  totalTokens: number;
  costUsd: number;
  computedAt: string;
};

/**
 * Metadaten eines Unternehmens für das Leaderboard (Name, Logo).
 */
export type CompanyMetadata = {
  companyId: string;
  companyName: string;
  logoUrl: string | null;
};

/**
 * Aggregationsergebnis vor der Filterung auf die Allowlist.
 */
export type RawCompanyAggregation = {
  companyId: string;
  windowDays: number;
  totalTokens: number;
  costUsd: number;
  byProvider: {
    provider: string;
    tokens: number;
    costUsd: number;
  }[];
  computedAt: string;
};
