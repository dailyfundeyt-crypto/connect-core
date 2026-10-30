/**
 * Responsives SVG-Verlaufsdiagramm je Tag für Tokens oder Kosten (Lane A24).
 *
 * Zeigt die tägliche Entwicklung im gewählten Zeitfenster (7/30/90 Tage) mit
 * getrennten Farbbändern für Eingabe-Tokens, Cache-Ersparnis und Ausgabe-Tokens
 * sowie interaktivem Hover-Tooltip.
 */
import React, { useId, useMemo, useState } from "react";
import { formatDayLabel, formatTokens, formatTokensExact, formatUsd } from "./formatters";
import type { UsageBucket, UsageViewMetric } from "./types";

interface UsageChartProps {
  buckets: readonly UsageBucket[];
  metric: "tokens" | "cost";
  windowDays: number;
}

const CHART_WIDTH = 800;
const CHART_HEIGHT = 220;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 36;
const PADDING_LEFT = 56;
const PADDING_RIGHT = 16;

const PLOT_WIDTH = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

export function UsageChart({ buckets, metric, windowDays }: UsageChartProps) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Relevante Metrik-Werte je Bucket
  const dataPoints = useMemo(() => {
    return buckets.map((b) => {
      const primaryValue = metric === "tokens" ? b.totalTokens : b.costUsd;
      const input = metric === "tokens" ? b.inputTokens : b.costUsd;
      const cached = metric === "tokens" ? b.cachedInputTokens : b.cacheSavingsUsd;
      const output = metric === "tokens" ? b.outputTokens : 0;
      return {
        bucket: b,
        key: b.key,
        label: b.label || b.key,
        primaryValue,
        input,
        cached,
        output,
      };
    });
  }, [buckets, metric]);

  const maxVal = useMemo(() => {
    const peak = Math.max(...dataPoints.map((d) => d.primaryValue), 0);
    if (peak <= 0) return 1;
    // Runden auf schöne Zehnerpotenz
    const factor = Math.pow(10, Math.floor(Math.log10(peak)));
    return Math.ceil(peak / factor) * factor;
  }, [dataPoints]);

  // Gitterlinien & Y-Ticks
  const yTicks = useMemo(() => {
    const steps = 4;
    const ticks: { val: number; y: number; label: string }[] = [];
    for (let i = 0; i <= steps; i++) {
      const val = (maxVal / steps) * i;
      const y = PADDING_TOP + PLOT_HEIGHT - (val / maxVal) * PLOT_HEIGHT;
      const label = metric === "tokens" ? formatTokens(val) : formatUsd(val);
      ticks.push({ val, y, label });
    }
    return ticks;
  }, [maxVal, metric]);

  // Schrittweite auf der X-Achse
  const count = dataPoints.length;
  const colWidth = count > 0 ? PLOT_WIDTH / count : PLOT_WIDTH;
  const barWidth = Math.max(2, Math.min(colWidth * 0.72, 32));

  // Ausdünnung der X-Achsenbeschriftung
  const labelInterval = useMemo(() => {
    if (count <= 10) return 1;
    if (count <= 35) return Math.ceil(count / 7);
    return Math.ceil(count / 8);
  }, [count]);

  if (count === 0 || maxVal === 1) {
    return (
      <div className="flex h-56 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Keine Tagesverläufe für den ausgewählten Zeitraum ({windowDays} Tage) vorhanden.
        </p>
      </div>
    );
  }

  const activeHoverPoint = hoverIndex !== null ? dataPoints[hoverIndex] : null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm">
      {/* Header über dem Chart */}
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Täglicher Verlauf ({metric === "tokens" ? "Tokens gesamt" : "API-Kosten"})
        </span>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-cyan-500" />
            {metric === "tokens" ? "Eingabe (Uncached)" : "Kosten (USD)"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-emerald-500" />
            {metric === "tokens" ? "Cache-Treffer" : "Cache-Ersparnis"}
          </span>
          {metric === "tokens" && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-violet-500" />
              Ausgabe
            </span>
          )}
        </div>
      </div>

      {/* SVG Plot */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-auto w-full select-none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`${gradientId}-bar-tokens`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0891b2" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id={`${gradientId}-bar-cost`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id={`${gradientId}-bar-cache`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.65" />
            </linearGradient>
            <linearGradient id={`${gradientId}-bar-output`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.65" />
            </linearGradient>
          </defs>

          {/* Horizontale Gitterlinien */}
          {yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={PADDING_LEFT}
                y1={t.y}
                x2={CHART_WIDTH - PADDING_RIGHT}
                y2={t.y}
                stroke="currentColor"
                strokeOpacity={idx === 0 ? "0.3" : "0.1"}
                strokeDasharray={idx === 0 ? undefined : "3 3"}
              />
              <text
                x={PADDING_LEFT - 8}
                y={t.y + 3.5}
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {t.label}
              </text>
            </g>
          ))}

          {/* Balken je Tag */}
          {dataPoints.map((dp, idx) => {
            const centerX = PADDING_LEFT + idx * colWidth + colWidth / 2;
            const x = centerX - barWidth / 2;

            if (dp.primaryValue <= 0) {
              return null;
            }

            // Gesamthöhe des Tages
            const totalHeight = (dp.primaryValue / maxVal) * PLOT_HEIGHT;
            const barY = PADDING_TOP + PLOT_HEIGHT - totalHeight;

            // Segment-Höhen bei Tokens
            let inputHeight = 0;
            let cachedHeight = 0;
            let outputHeight = 0;

            if (metric === "tokens" && dp.primaryValue > 0) {
              inputHeight = (dp.input / maxVal) * PLOT_HEIGHT;
              cachedHeight = (dp.cached / maxVal) * PLOT_HEIGHT;
              outputHeight = (dp.output / maxVal) * PLOT_HEIGHT;
            }

            const isHovered = hoverIndex === idx;

            return (
              <g
                key={dp.key}
                className="cursor-pointer transition-opacity"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                {/* Unsichtbare Hitbox über die gesamte Spalte für einfaches Hovern */}
                <rect
                  x={PADDING_LEFT + idx * colWidth}
                  y={PADDING_TOP}
                  width={colWidth}
                  height={PLOT_HEIGHT}
                  fill="transparent"
                />

                {/* Hervorhebungshintergrund bei Hover */}
                {isHovered && (
                  <rect
                    x={PADDING_LEFT + idx * colWidth}
                    y={PADDING_TOP}
                    width={colWidth}
                    height={PLOT_HEIGHT}
                    className="fill-cyan-500/10"
                    rx="3"
                  />
                )}

                {metric === "tokens" ? (
                  // Gestapelte Abschnitte: Input (unten), Cache (Mitte), Output (oben)
                  <g>
                    {/* Input Tokens */}
                    <rect
                      x={x}
                      y={PADDING_TOP + PLOT_HEIGHT - inputHeight}
                      width={barWidth}
                      height={Math.max(1, inputHeight)}
                      fill={`url(#${gradientId}-bar-tokens)`}
                      rx={cachedHeight + outputHeight > 0 ? 0 : 2}
                    />
                    {/* Cache Tokens */}
                    {cachedHeight > 0 && (
                      <rect
                        x={x}
                        y={PADDING_TOP + PLOT_HEIGHT - inputHeight - cachedHeight}
                        width={barWidth}
                        height={cachedHeight}
                        fill={`url(#${gradientId}-bar-cache)`}
                        rx={outputHeight > 0 ? 0 : 2}
                      />
                    )}
                    {/* Output Tokens */}
                    {outputHeight > 0 && (
                      <rect
                        x={x}
                        y={barY}
                        width={barWidth}
                        height={outputHeight}
                        fill={`url(#${gradientId}-bar-output)`}
                        rx="2"
                      />
                    )}
                  </g>
                ) : (
                  // Einzelner Kosten-Balken
                  <rect
                    x={x}
                    y={barY}
                    width={barWidth}
                    height={Math.max(2, totalHeight)}
                    fill={`url(#${gradientId}-bar-cost)`}
                    rx="2"
                  />
                )}
              </g>
            );
          })}

          {/* X-Achsen-Labels */}
          {dataPoints.map((dp, idx) => {
            const isLabeled = idx % labelInterval === 0 || idx === count - 1;
            if (!isLabeled) return null;
            const centerX = PADDING_LEFT + idx * colWidth + colWidth / 2;
            return (
              <text
                key={`label-${dp.key}`}
                x={centerX}
                y={CHART_HEIGHT - 10}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {formatDayLabel(dp.key)}
              </text>
            );
          })}
        </svg>

        {/* Hover-Tooltip (Floating) */}
        {activeHoverPoint && (
          <div
            className="pointer-events-none absolute top-2 z-20 min-w-44 rounded-lg border border-border bg-popover/95 p-2.5 text-xs text-popover-foreground shadow-xl backdrop-blur-md transition-all"
            style={{
              left: `${Math.min(
                Math.max(
                  10,
                  ((PADDING_LEFT + (hoverIndex ?? 0) * colWidth + colWidth / 2) / CHART_WIDTH) * 100,
                ),
                70,
              )}%`,
            }}
          >
            <div className="mb-1.5 flex items-center justify-between border-b border-border/60 pb-1 font-semibold text-foreground">
              <span>{formatDayLabel(activeHoverPoint.key)}</span>
              <span className="text-[10px] text-muted-foreground">{activeHoverPoint.key}</span>
            </div>

            {metric === "tokens" ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <span className="size-2 rounded-sm bg-cyan-400" />
                    Input:
                  </span>
                  <span className="font-mono">{formatTokensExact(activeHoverPoint.input)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="size-2 rounded-sm bg-emerald-400" />
                    Cached:
                  </span>
                  <span className="font-mono">{formatTokensExact(activeHoverPoint.cached)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-violet-400">
                    <span className="size-2 rounded-sm bg-violet-400" />
                    Output:
                  </span>
                  <span className="font-mono">{formatTokensExact(activeHoverPoint.output)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-border/50 pt-1 font-medium text-foreground">
                  <span>Gesamt:</span>
                  <span className="font-mono">{formatTokensExact(activeHoverPoint.primaryValue)}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Kosten:</span>
                  <span className="font-mono font-medium text-foreground">
                    {formatUsd(activeHoverPoint.primaryValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-emerald-400">
                  <span>Cache gespart:</span>
                  <span className="font-mono">{formatUsd(activeHoverPoint.cached)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Turns:</span>
                  <span className="font-mono">{activeHoverPoint.bucket.turns}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
