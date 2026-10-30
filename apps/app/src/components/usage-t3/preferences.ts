/**
 * Speicherung von Benutzer-Präferenzen für die T3-Nutzungsansicht (Lane A24).
 *
 * Speichert ausschließlich nicht-geheime Ansichtseinstellungen im localStorage:
 * - metric: "tokens" | "cost" | "limits"
 * - windowDays: 7 | 30 | 90
 * - groupBy: "agent" | "cli" | "model" | "day"
 *
 * Es werden unter keinen Umständen Tokens, Passwörter oder Secrets abgelegt.
 */
import {
  DEFAULT_USAGE_PREFERENCES,
  type UsageTableGroupBy,
  type UsageViewMetric,
  type UsageViewPreferences,
  type UsageWindowDays,
} from "./types";

export const USAGE_STORAGE_KEY = "connect:usage-preferences:v1";

function isValidMetric(val: unknown): val is UsageViewMetric {
  return val === "tokens" || val === "cost" || val === "limits";
}

function isValidWindowDays(val: unknown): val is UsageWindowDays {
  return val === 7 || val === 30 || val === 90;
}

function isValidGroupBy(val: unknown): val is UsageTableGroupBy {
  return val === "agent" || val === "cli" || val === "model" || val === "day";
}

/**
 * Liest die gespeicherten Nutzungsansicht-Präferenzen aus dem localStorage.
 * Fällt bei Fehlern, ungültigen Daten oder SSR sicher auf Standardwerte zurück.
 */
export function readUsagePreferences(): UsageViewPreferences {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ...DEFAULT_USAGE_PREFERENCES };
  }

  try {
    const raw = window.localStorage.getItem(USAGE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USAGE_PREFERENCES };

    const parsed = JSON.parse(raw) as Partial<UsageViewPreferences>;
    return {
      metric: isValidMetric(parsed.metric) ? parsed.metric : DEFAULT_USAGE_PREFERENCES.metric,
      windowDays: isValidWindowDays(parsed.windowDays)
        ? parsed.windowDays
        : DEFAULT_USAGE_PREFERENCES.windowDays,
      groupBy: isValidGroupBy(parsed.groupBy)
        ? parsed.groupBy
        : DEFAULT_USAGE_PREFERENCES.groupBy,
    };
  } catch {
    return { ...DEFAULT_USAGE_PREFERENCES };
  }
}

/**
 * Speichert die Nutzungsansicht-Präferenzen im localStorage.
 */
export function saveUsagePreferences(preferences: UsageViewPreferences): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    const safePayload: UsageViewPreferences = {
      metric: isValidMetric(preferences.metric) ? preferences.metric : "tokens",
      windowDays: isValidWindowDays(preferences.windowDays) ? preferences.windowDays : 30,
      groupBy: isValidGroupBy(preferences.groupBy) ? preferences.groupBy : "agent",
    };
    window.localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(safePayload));
  } catch (err) {
    console.warn("[UsageT3] Konnte Einstellungen nicht im localStorage speichern:", err);
  }
}
