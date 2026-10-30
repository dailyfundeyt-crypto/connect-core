/**
 * T3-Bridge — Zahlen- und Diagrammformatierung für das Token-Widget (Lane A35).
 *
 * Reine Funktionen ohne React, damit Anzeige und Tests deterministisch bleiben.
 * Deutsche Schreibweise: Dezimalkomma, Tausenderpunkt; Kurzform wie „12,4 Mio.“.
 */

import { T3_PROVIDER_IDS, T3_PROVIDER_LABELS } from "@/lib/t3/contracts";
import type { TokenUsagePoint } from "./types";

const deInteger = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const deUsd = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const deDate = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function deDecimal(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

/** Große Zahl in Kurzform: „12,4“ + „Mio. Tokens“. */
export type TokenAmount = {
  /** Kurzform der Zahl, z. B. „12,4“. */
  value: string;
  /** Einheit, z. B. „Mio. Tokens“. */
  unit: string;
  /** Voller Wert für Tooltip/Screenreader, z. B. „12.400.000 Tokens“. */
  full: string;
};

/**
 * Formatiert eine Token-Summe für die große Anzeige.
 * 0 → „0 Tokens“, 8 420 → „8.420 Tokens“, 12 400 000 → „12,4 Mio. Tokens“.
 */
export function formatTokenAmount(totalTokens: number): TokenAmount {
  const total =
    Number.isFinite(totalTokens) && totalTokens > 0 ? totalTokens : 0;
  const full = `${deInteger.format(total)} Tokens`;

  if (total >= 1_000_000_000) {
    return {
      value: deDecimal(total / 1_000_000_000),
      unit: "Mrd. Tokens",
      full,
    };
  }
  if (total >= 1_000_000) {
    return { value: deDecimal(total / 1_000_000), unit: "Mio. Tokens", full };
  }
  if (total >= 1_000) {
    return { value: deInteger.format(total), unit: "Tokens", full };
  }
  return { value: deInteger.format(total), unit: "Tokens", full };
}

/** Kosten in USD, deutsche Schreibweise („12,34 $“). */
export function formatCostUsd(costUsd: number): string {
  if (!Number.isFinite(costUsd) || costUsd < 0) return deUsd.format(0);
  return deUsd.format(costUsd);
}

/** Zeitraum-Label: „Letzte 30 Tage“ / „Letzter Tag“. */
export function formatWindowLabel(windowDays: number): string {
  const days =
    Number.isFinite(windowDays) && windowDays > 0 ? Math.trunc(windowDays) : 30;
  return days === 1 ? "Letzter Tag" : `Letzte ${days} Tage`;
}

/** Zeitraum im Satz: „im letzten Tag“ / „in den letzten 30 Tagen“. */
export function formatWindowPhrase(windowDays: number): string {
  const days =
    Number.isFinite(windowDays) && windowDays > 0 ? Math.trunc(windowDays) : 30;
  return days === 1 ? "im letzten Tag" : `in den letzten ${days} Tagen`;
}

/** Stand der Aggregation als Datum („29.10.2026“); leer, wenn kein Datum. */
export function formatComputedAt(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return deDate.format(date);
}

/** Anzeigename einer CLI/eines Providers (Allowlist-Feld `provider`). */
export function providerLabel(provider: string): string {
  const id = provider.trim();
  if (!id) return "Unbekannt";
  if ((T3_PROVIDER_IDS as readonly string[]).includes(id)) {
    return T3_PROVIDER_LABELS[id as keyof typeof T3_PROVIDER_LABELS];
  }
  const humanized = id.replace(/[-_]+/g, " ").trim();
  if (!humanized) return "Unbekannt";
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}

/** Ein Anteil in der optionalen CLI-Aufteilung. */
export type ProviderShare = {
  provider: string;
  label: string;
  tokens: number;
  /** Anteil 0…1. */
  share: number;
  /** Gerundeter Prozenttext, z. B. „58 %“. */
  percentLabel: string;
};

const MAX_VISIBLE_PROVIDER_ROWS = 4;

/**
 * Anteile je CLI aus `byProvider`, absteigend sortiert.
 * Kleine Reste werden zu „Weitere“ zusammengefasst, damit die Karte ruhig bleibt.
 * Nur Summen — keine Agenten- oder Modellnamen.
 */
export function providerShares(
  byProvider: { provider: string; tokens: number }[],
  maxRows: number = MAX_VISIBLE_PROVIDER_ROWS,
): ProviderShare[] {
  const entries = byProvider
    .filter(
      (entry) =>
        typeof entry.provider === "string" &&
        entry.provider.trim().length > 0 &&
        Number.isFinite(entry.tokens) &&
        entry.tokens > 0,
    )
    .map((entry) => ({
      provider: entry.provider.trim(),
      tokens: entry.tokens,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const total = entries.reduce((sum, entry) => sum + entry.tokens, 0);
  if (!total) return [];

  const limit = Math.max(1, Math.trunc(maxRows));
  const head = entries.slice(0, limit);
  const rest = entries.slice(limit);
  const restTokens = rest.reduce((sum, entry) => sum + entry.tokens, 0);

  const rows = head.map((entry) => ({
    provider: entry.provider,
    label: providerLabel(entry.provider),
    tokens: entry.tokens,
    share: entry.tokens / total,
  }));

  if (restTokens > 0) {
    rows.push({
      provider: "other",
      label: "Weitere",
      tokens: restTokens,
      share: restTokens / total,
    });
  }

  return rows.map((row) => ({
    ...row,
    percentLabel: `${Math.round(row.share * 100)} %`,
  }));
}

export type SparklineGeometry = {
  width: number;
  height: number;
  /** Linienzug für `<path d>`. */
  line: string;
  /** Geschlossene Fläche für den Verlauf unter der Linie. */
  area: string;
};

/**
 * Baut die SVG-Geometrie der kleinen Verlaufslinie.
 * Gibt `null` zurück, wenn weniger als zwei Tagespunkte vorliegen —
 * dann wird bewusst keine Linie erfunden.
 */
export function buildSparklinePath(
  points: TokenUsagePoint[],
  options: { width?: number; height?: number; padding?: number } = {},
): SparklineGeometry | null {
  const width = options.width ?? 120;
  const height = options.height ?? 32;
  const padding = options.padding ?? 3;

  const values = points
    .filter((point) => Number.isFinite(point.tokens) && point.tokens >= 0)
    .map((point) => point.tokens);

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  const stepX = innerW / (values.length - 1);

  const coords = values.map((value, index) => {
    const x = padding + stepX * index;
    const ratio = span === 0 ? 0.5 : (value - min) / span;
    const y = padding + (1 - ratio) * innerH;
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  });

  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = `${line} L${last.x},${height} L${first.x},${height} Z`;

  return { width, height, line, area };
}
