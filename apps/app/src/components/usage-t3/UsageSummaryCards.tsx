/**
 * KPI-Zusammenfassungskarten mit prominenter Cache-Ersparnis (Lane A24).
 */
import React from "react";
import { formatPercent, formatTokens, formatTokensExact, formatUsd } from "./formatters";
import type { UsageBucket, UsageViewMetric } from "./types";

interface UsageSummaryCardsProps {
  totals: UsageBucket | null;
  metric: UsageViewMetric;
  windowDays: number;
}

export function UsageSummaryCards({ totals, metric, windowDays }: UsageSummaryCardsProps) {
  if (!totals) {
    return null;
  }

  // Cache-Hit-Rate berechnen
  const totalInput = totals.inputTokens + totals.cachedInputTokens;
  const cacheHitRate = totalInput > 0 ? (totals.cachedInputTokens / totalInput) * 100 : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Hauptmetrik: Kosten oder Gesamt-Tokens */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="text-xs font-medium text-muted-foreground">
          {metric === "cost" ? "Geschätzte API-Kosten" : "Token-Verbrauch gesamt"}
        </div>
        <div className="mt-2 text-2xl font-bold tracking-tight text-foreground tabular-nums">
          {metric === "cost" ? formatUsd(totals.costUsd) : formatTokens(totals.totalTokens)}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{windowDays} Tage</span>
          {metric === "tokens" && (
            <span className="font-mono text-[11px] text-muted-foreground/80">
              {formatTokensExact(totals.totalTokens)}
            </span>
          )}
        </div>
      </div>

      {/* 2. Prominente Cache-Ersparnis */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs font-medium text-emerald-400">
          <span>Cache-Ersparnis</span>
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
            {formatPercent(cacheHitRate)} Treffer
          </span>
        </div>
        <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-400 tabular-nums">
          {formatUsd(totals.cacheSavingsUsd)}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-emerald-400/80">
          <span>Eingesparte Tokens:</span>
          <span className="font-mono font-medium">{formatTokens(totals.cachedInputTokens)}</span>
        </div>
      </div>

      {/* 3. Eingabe & Ausgabe Tokens */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="text-xs font-medium text-muted-foreground">Eingabe & Ausgabe</div>
        <div className="mt-2 text-2xl font-bold tracking-tight text-foreground tabular-nums">
          {formatTokens(totals.outputTokens)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">out</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Input (frisch):</span>
          <span className="font-mono">{formatTokens(totals.inputTokens)}</span>
        </div>
      </div>

      {/* 4. Aktivität / Turns */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="text-xs font-medium text-muted-foreground">Gesprächsaktivität</div>
        <div className="mt-2 text-2xl font-bold tracking-tight text-foreground tabular-nums">
          {totals.turns}
          <span className="ml-1 text-sm font-normal text-muted-foreground">Turns</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Zeitraum:</span>
          <span>{windowDays} Tage</span>
        </div>
      </div>
    </div>
  );
}
