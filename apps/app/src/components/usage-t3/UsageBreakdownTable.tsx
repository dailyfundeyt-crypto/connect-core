/**
 * Detaillierte Aufschlüsselungstabelle nach Agent, CLI oder Modell (Lane A24).
 *
 * Zeigt pro Einheit Tokens (Input, Cache, Output, Gesamt), Cache-Ersparnis in USD,
 * geschätzte API-Kosten und Turn-Zahlen mit zusammenfassender Summenzeile.
 */
import React, { useMemo, useState } from "react";
import { formatTokens, formatTokensExact, formatUsd } from "./formatters";
import type { UsageBucket, UsageTableGroupBy, UsageViewMetric } from "./types";

interface UsageBreakdownTableProps {
  buckets: readonly UsageBucket[];
  totals: UsageBucket | null;
  groupBy: UsageTableGroupBy;
  metric: UsageViewMetric;
  onGroupByChange?: (next: UsageTableGroupBy) => void;
}

type SortField = "name" | "input" | "cached" | "output" | "total" | "cost" | "savings" | "turns";
type SortDirection = "asc" | "desc";

export function UsageBreakdownTable({
  buckets,
  totals,
  groupBy,
  metric,
  onGroupByChange,
}: UsageBreakdownTableProps) {
  const [sortField, setSortField] = useState<SortField>("total");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedBuckets = useMemo(() => {
    const list = [...buckets];
    list.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortField) {
        case "name":
          valA = a.label || a.key;
          valB = b.label || b.key;
          return sortDirection === "asc"
            ? (valA as string).localeCompare(valB as string)
            : (valB as string).localeCompare(valA as string);
        case "input":
          valA = a.inputTokens;
          valB = b.inputTokens;
          break;
        case "cached":
          valA = a.cachedInputTokens;
          valB = b.cachedInputTokens;
          break;
        case "output":
          valA = a.outputTokens;
          valB = b.outputTokens;
          break;
        case "total":
          valA = a.totalTokens;
          valB = b.totalTokens;
          break;
        case "cost":
          valA = a.costUsd;
          valB = b.costUsd;
          break;
        case "savings":
          valA = a.cacheSavingsUsd;
          valB = b.cacheSavingsUsd;
          break;
        case "turns":
          valA = a.turns;
          valB = b.turns;
          break;
      }

      return sortDirection === "asc"
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number);
    });
    return list;
  }, [buckets, sortField, sortDirection]);

  const groupLabel = useMemo(() => {
    switch (groupBy) {
      case "agent":
        return "Agent";
      case "cli":
        return "CLI / Provider";
      case "model":
        return "Modell";
      default:
        return "Einheit";
    }
  }, [groupBy]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Header mit Gruppierungsauswahl */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Aufschlüsselung nach {groupLabel} ({buckets.length})
          </h4>
          <p className="text-xs text-muted-foreground">
            Klicke auf Spaltenköpfe, um nach Spalte auf- oder absteigend zu sortieren.
          </p>
        </div>

        {onGroupByChange && (
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1 text-xs">
            <button
              type="button"
              onClick={() => onGroupByChange("agent")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                groupBy === "agent"
                  ? "bg-secondary text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Agent
            </button>
            <button
              type="button"
              onClick={() => onGroupByChange("cli")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                groupBy === "cli"
                  ? "bg-secondary text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              CLI
            </button>
            <button
              type="button"
              onClick={() => onGroupByChange("model")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                groupBy === "model"
                  ? "bg-secondary text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Modell
            </button>
          </div>
        )}
      </div>

      {/* Tabelle */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border bg-muted/40 text-muted-foreground">
            <tr>
              <th
                scope="col"
                onClick={() => toggleSort("name")}
                className="cursor-pointer px-4 py-2.5 font-medium hover:text-foreground"
              >
                {groupLabel} {sortField === "name" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th
                scope="col"
                onClick={() => toggleSort("input")}
                className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-foreground"
              >
                Eingabe {sortField === "input" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th
                scope="col"
                onClick={() => toggleSort("cached")}
                className="cursor-pointer px-3 py-2.5 text-right font-medium text-emerald-400 hover:text-emerald-300"
              >
                Cache {sortField === "cached" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th
                scope="col"
                onClick={() => toggleSort("output")}
                className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-foreground"
              >
                Ausgabe {sortField === "output" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th
                scope="col"
                onClick={() => toggleSort("total")}
                className="cursor-pointer px-3 py-2.5 text-right font-semibold text-foreground hover:text-cyan-400"
              >
                Gesamt {sortField === "total" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th
                scope="col"
                onClick={() => toggleSort("savings")}
                className="cursor-pointer px-3 py-2.5 text-right font-medium text-emerald-400 hover:text-emerald-300"
              >
                Cache-Ersparnis {sortField === "savings" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th
                scope="col"
                onClick={() => toggleSort("cost")}
                className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-foreground"
              >
                Kosten {sortField === "cost" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
              <th
                scope="col"
                onClick={() => toggleSort("turns")}
                className="cursor-pointer px-4 py-2.5 text-right font-medium hover:text-foreground"
              >
                Turns {sortField === "turns" && (sortDirection === "asc" ? "▲" : "▼")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sortedBuckets.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  Keine Einträge für diese Gruppierung vorhanden.
                </td>
              </tr>
            ) : (
              sortedBuckets.map((bucket) => (
                <tr
                  key={bucket.key}
                  className="transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    <div className="flex flex-col">
                      <span>{bucket.label || bucket.key}</span>
                      {bucket.label && bucket.label !== bucket.key && (
                        <span className="text-[10px] text-muted-foreground">{bucket.key}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
                    {formatTokens(bucket.inputTokens)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-400 tabular-nums">
                    {formatTokens(bucket.cachedInputTokens)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
                    {formatTokens(bucket.outputTokens)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-medium text-foreground tabular-nums">
                    {formatTokensExact(bucket.totalTokens)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-400 tabular-nums">
                    {formatUsd(bucket.cacheSavingsUsd)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-foreground tabular-nums">
                    {formatUsd(bucket.costUsd)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-muted-foreground tabular-nums">
                    {bucket.turns}
                  </td>
                </tr>
              ))
            )}
          </tbody>

          {/* Summenzeile */}
          {totals && (
            <tfoot className="border-t-2 border-border bg-muted/30 font-semibold text-foreground">
              <tr>
                <td className="px-4 py-3">Gesamtsumme</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                  {formatTokens(totals.inputTokens)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-400">
                  {formatTokens(totals.cachedInputTokens)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-muted-foreground">
                  {formatTokens(totals.outputTokens)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-cyan-400">
                  {formatTokensExact(totals.totalTokens)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-400">
                  {formatUsd(totals.cacheSavingsUsd)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">
                  {formatUsd(totals.costUsd)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums">
                  {totals.turns}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
