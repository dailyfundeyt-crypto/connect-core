/**
 * T3-Bridge — Allowlist für öffentliche Firmen-Token-Summen (Lane A35).
 *
 * DATENSCHUTZ: Das Widget darf ausschließlich die von A20 freigegebenen Summenfelder
 * anzeigen. Diese Datei filtert rohe Serverantworten defensiv erneut, damit selbst ein
 * fehlerhaft erweitertes Backend (oder ein fremder Proxy) keine Prompts, Keys,
 * Agenten-Details, Nutzer-IDs oder Dateinamen ins DOM bringt.
 *
 * Allowlist (identisch zu A20 `CompanyPublicUsage`):
 *   companyId, windowDays, totalTokens, costUsd, byProvider[provider, tokens, costUsd], computedAt
 */

import type { CompanyPublicUsage, CompanyUsageSettings } from "./types";

/** Einzige erlaubte Felder der öffentlichen Token-Summen. */
export const PUBLIC_USAGE_ALLOWLIST = [
  "companyId",
  "windowDays",
  "totalTokens",
  "costUsd",
  "byProvider",
  "computedAt",
] as const;

/** Einzige erlaubte Felder eines Provider-Anteils. */
export const PUBLIC_USAGE_PROVIDER_ALLOWLIST = [
  "provider",
  "tokens",
  "costUsd",
] as const;

const DEFAULT_WINDOW_DAYS = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

/**
 * Baut aus einer rohen Antwort ausschließlich das Allowlist-Objekt.
 * Gibt `null` zurück, wenn keine belastbare Token-Summe enthalten ist.
 */
export function toPublicUsage(raw: unknown): CompanyPublicUsage | null {
  if (!isRecord(raw)) return null;

  const companyId = typeof raw.companyId === "string" ? raw.companyId : "";
  if (!companyId) return null;

  const totalTokens = toNonNegativeNumber(raw.totalTokens);
  if (totalTokens === undefined) return null;

  const rawWindowDays = toNonNegativeNumber(raw.windowDays);
  const windowDays =
    rawWindowDays !== undefined && rawWindowDays > 0
      ? Math.trunc(rawWindowDays)
      : DEFAULT_WINDOW_DAYS;

  const costUsd = toNonNegativeNumber(raw.costUsd);

  const byProvider: CompanyPublicUsage["byProvider"] = [];
  if (Array.isArray(raw.byProvider)) {
    for (const entry of raw.byProvider) {
      if (!isRecord(entry)) continue;
      const provider =
        typeof entry.provider === "string" ? entry.provider.trim() : "";
      const tokens = toNonNegativeNumber(entry.tokens);
      if (!provider || tokens === undefined) continue;
      const providerCost = toNonNegativeNumber(entry.costUsd);
      byProvider.push(
        providerCost === undefined
          ? { provider, tokens }
          : { provider, tokens, costUsd: providerCost },
      );
    }
  }

  const usage: CompanyPublicUsage = {
    companyId,
    windowDays,
    totalTokens,
    byProvider,
    computedAt: typeof raw.computedAt === "string" ? raw.computedAt : "",
  };
  if (costUsd !== undefined) usage.costUsd = costUsd;
  return usage;
}

/**
 * Baut aus einer rohen Antwort ausschließlich die Sichtbarkeits-Einstellungen.
 * Akzeptiert sowohl `{ public, showCost }` (GET) als auch
 * `{ success, settings: { public, showCost } }` (PUT, A20).
 */
export function toVisibilitySettings(
  raw: unknown,
  companyId: string,
): CompanyUsageSettings | null {
  if (!isRecord(raw)) return null;

  const nested = isRecord(raw.settings) ? raw.settings : null;
  const source = typeof raw.public === "boolean" ? raw : (nested ?? raw);

  if (typeof source.public !== "boolean") return null;
  if (typeof source.showCost !== "boolean") return null;

  return {
    companyId:
      typeof source.companyId === "string" && source.companyId
        ? source.companyId
        : companyId,
    public: source.public,
    showCost: source.showCost,
  };
}
