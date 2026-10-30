/**
 * T3-Bridge — Allowlist-Filter für Company-Usage & Leaderboard (A20)
 *
 * Lane: A20 (Welle W2)
 *
 * Datenschutz-Garantie:
 * Nur autorisierte Felder passieren diese Filter.
 * Keine Prompts, Antworten, Dateinamen, Agentennamen, Keys, Nutzer-IDs,
 * interne IDs oder unzulässige Tokens-Breakdowns dürfen nach außen gelangen.
 */

import type {
  CompanyPublicUsage,
  LeaderboardEntry,
  RawCompanyAggregation,
} from "./types";

/**
 * Erlaubte Schlüssel für das öffentliche Firmenprofil.
 */
export const PUBLIC_USAGE_ALLOWLIST = [
  "companyId",
  "windowDays",
  "totalTokens",
  "costUsd",
  "byProvider",
  "computedAt",
] as const;

/**
 * Erlaubte Schlüssel für Einträge im byProvider-Array.
 */
export const PROVIDER_BREAKDOWN_ALLOWLIST = [
  "provider",
  "tokens",
  "costUsd",
] as const;

/**
 * Erlaubte Schlüssel für die Sieger-Tabelle.
 */
export const LEADERBOARD_ENTRY_ALLOWLIST = [
  "rank",
  "companyId",
  "companyName",
  "logoUrl",
  "tokens",
] as const;

/**
 * Filtert rohe Aggregationsdaten strikt auf die Allowlist für das öffentliche Firmenprofil.
 *
 * @param raw - Das rohe Aggregationsergebnis
 * @param showCost - Ob Kosten angezeigt werden dürfen (Standard: false)
 * @returns Ein neues Objekt, das ausschließlich Allowlist-Felder enthält.
 */
export function filterCompanyPublicUsage(
  raw: RawCompanyAggregation | CompanyPublicUsage,
  showCost: boolean = false,
): CompanyPublicUsage {
  const byProvider = (raw.byProvider ?? []).map((p) => {
    const entry: { provider: string; tokens: number; costUsd?: number } = {
      provider: String(p.provider ?? "unknown"),
      tokens: Math.max(0, Math.floor(Number(p.tokens) || 0)),
    };
    if (showCost && typeof p.costUsd === "number" && Number.isFinite(p.costUsd)) {
      entry.costUsd = Math.round(p.costUsd * 10000) / 10000;
    }
    return entry;
  });

  const filtered: CompanyPublicUsage = {
    companyId: String(raw.companyId),
    windowDays: Math.max(1, Math.floor(Number(raw.windowDays) || 30)),
    totalTokens: Math.max(0, Math.floor(Number(raw.totalTokens) || 0)),
    byProvider,
    computedAt:
      typeof raw.computedAt === "string" && raw.computedAt.trim() !== ""
        ? raw.computedAt
        : new Date().toISOString(),
  };

  if (showCost && typeof raw.costUsd === "number" && Number.isFinite(raw.costUsd)) {
    filtered.costUsd = Math.round(raw.costUsd * 10000) / 10000;
  }

  return Object.freeze(filtered);
}

/**
 * Filtert einen Sieger-Tabellen-Eintrag strikt auf die Allowlist.
 *
 * @param raw - Der rohe Eintrag
 * @returns Ein neues Objekt mit genau den 5 erlaubten Eigenschaften.
 */
export function filterLeaderboardEntry(raw: {
  rank: number;
  companyId: string;
  companyName: string;
  logoUrl?: string | null;
  tokens: number;
  [key: string]: unknown;
}): LeaderboardEntry {
  const filtered: LeaderboardEntry = {
    rank: Math.max(1, Math.floor(Number(raw.rank) || 1)),
    companyId: String(raw.companyId),
    companyName: String(raw.companyName || raw.companyId),
    logoUrl: raw.logoUrl ? String(raw.logoUrl) : null,
    tokens: Math.max(0, Math.floor(Number(raw.tokens) || 0)),
  };

  return Object.freeze(filtered);
}

/**
 * Prüft, ob ein Objekt ausschließlich Felder der jeweiligen Allowlist enthält.
 * Nützlich für automatisierte Tests und Sicherheitsprüfungen.
 */
export function isAllowlistCompliant(
  obj: unknown,
  kind: "public-usage" | "leaderboard-entry",
): boolean {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return false;
  }

  const keys = Object.keys(obj);

  if (kind === "leaderboard-entry") {
    const allowed = new Set<string>(LEADERBOARD_ENTRY_ALLOWLIST);
    for (const key of keys) {
      if (!allowed.has(key)) return false;
    }
    return true;
  }

  if (kind === "public-usage") {
    const allowed = new Set<string>(PUBLIC_USAGE_ALLOWLIST);
    for (const key of keys) {
      if (!allowed.has(key)) return false;
    }
    const pu = obj as CompanyPublicUsage;
    if (Array.isArray(pu.byProvider)) {
      const allowedProviderKeys = new Set<string>(PROVIDER_BREAKDOWN_ALLOWLIST);
      for (const p of pu.byProvider) {
        if (!p || typeof p !== "object") return false;
        for (const pKey of Object.keys(p)) {
          if (!allowedProviderKeys.has(pKey)) return false;
        }
      }
    }
    return true;
  }

  return false;
}
