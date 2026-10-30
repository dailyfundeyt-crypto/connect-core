/**
 * Vollständige Anzeige der Provider-Limits und Quotas (Lane A24).
 *
 * Stellt Quota-Fenster (Session, wöchentlich, monatlich), prozentualen Verbrauch,
 * visuelle Fortschrittsbalken und Reset-Zeiten in der Zeitzone `Europe/Berlin` dar.
 */
import React from "react";
import { formatPercent, formatResetTime } from "./formatters";
import type { T3ProviderLimit } from "./types";

interface UsageLimitsViewProps {
  limits: readonly T3ProviderLimit[];
  nowMs?: number;
}

function getProviderBadgeColor(provider: string): string {
  switch (provider.toLowerCase()) {
    case "codex":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "claude":
    case "claudeagent":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    case "openai":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-400";
    case "gemini":
      return "border-blue-500/30 bg-blue-500/10 text-blue-400";
    case "grok":
      return "border-orange-500/30 bg-orange-500/10 text-orange-400";
    case "deepseek":
      return "border-indigo-500/30 bg-indigo-500/10 text-indigo-400";
    default:
      return "border-muted bg-muted/30 text-muted-foreground";
  }
}

function getUsageBarColor(percent: number): string {
  if (percent >= 90) return "bg-rose-500";
  if (percent >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}

function getKindLabel(kind: T3ProviderLimit["kind"]): string {
  switch (kind) {
    case "session":
      return "Session-Fenster";
    case "weekly":
      return "Wöchentliches Limit";
    case "monthly":
      return "Monatliches Limit";
    default:
      return "Kontingent";
  }
}

export function UsageLimitsView({ limits, nowMs = Date.now() }: UsageLimitsViewProps) {
  if (!limits || limits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
        <div className="mb-2 text-2xl">⚡</div>
        <h4 className="text-sm font-semibold text-foreground">Keine aktiven Limits</h4>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Für die aktuell konfigurierten Provider liegen keine Ratenbegrenzungen oder Quota-Limits vor.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Aktive Quota- und Provider-Limits ({limits.length})
        </h3>
        <span className="text-xs text-muted-foreground">Zeitzone: Europe/Berlin</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {limits.map((lim, index) => {
          const usedPct = Math.min(100, Math.max(0, lim.usedPercent));
          const remainingPct = Math.max(0, 100 - usedPct);
          const resetLabel = formatResetTime(lim.resetsAt, "Europe/Berlin", nowMs);
          const barColor = getUsageBarColor(usedPct);
          const badgeClass = getProviderBadgeColor(lim.provider);

          return (
            <div
              key={`${lim.provider}-${lim.kind}-${index}`}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-border/80"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${badgeClass}`}
                  >
                    {lim.provider}
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {getKindLabel(lim.kind)}
                  </span>
                </div>

                <div className="mt-3">
                  <div className="text-sm font-medium text-foreground">{lim.label}</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                      {formatPercent(usedPct)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {remainingPct}% verbleibend
                    </span>
                  </div>
                </div>

                {/* Fortschrittsbalken */}
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              </div>

              {/* Reset-Zeitpunkt */}
              <div className="mt-4 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">Reset: </span>
                <span>{resetLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
