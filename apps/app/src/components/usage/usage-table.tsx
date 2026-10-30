import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  UsageGroupBy,
  UsageRange,
  UsageSummaryItem,
  UsageSummaryTotals,
} from "./types";
import {
  IconSearch,
  IconTable,
  IconClock,
  IconLayersSubtract,
  IconCpu,
  IconSparkles,
  IconTerminal2,
  IconRobot,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react";

export interface UsageTableProps {
  items: UsageSummaryItem[];
  totals: UsageSummaryTotals;
  range: UsageRange;
  groupBy: UsageGroupBy;
  onRangeChange?: (range: UsageRange) => void;
  onGroupByChange?: (groupBy: UsageGroupBy) => void;
  className?: string;
}

/** Formats token numbers cleanly (e.g. 14,270 -> 14.3k) */
export function formatTokens(num: number | undefined): string {
  if (num === undefined || num === 0) return "0";
  if (num >= 1_000_000) return `${(Math.round(num / 100_000) / 10).toFixed(1)}M`;
  if (num >= 1_000) return `${(Math.round(num / 100) / 10).toFixed(1)}k`;
  return num.toLocaleString();
}

/** Formats seconds into human-readable duration */
export function formatDuration(sec: number): string {
  if (sec <= 0) return "0s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function UsageTable({
  items,
  totals,
  range,
  groupBy,
  onRangeChange,
  onGroupByChange,
  className,
}: UsageTableProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof UsageSummaryItem>("totalTokens");
  const [sortAsc, setSortAsc] = useState(false);

  const filteredItems = useMemo(() => {
    let result = [...items];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (it) =>
          it.label.toLowerCase().includes(q) ||
          it.key.toLowerCase().includes(q) ||
          (it.cliKind && it.cliKind.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === "number" && typeof valB === "number") {
        return sortAsc ? valA - valB : valB - valA;
      }
      const strA = String(valA ?? "");
      const strB = String(valB ?? "");
      return sortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });

    return result;
  }, [items, search, sortField, sortAsc]);

  const handleSort = (field: keyof UsageSummaryItem) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const renderIcon = (it: UsageSummaryItem) => {
    if (it.agentId) return <IconRobot className="size-4 text-purple-400" />;
    switch (it.cliKind) {
      case "codex":
        return <IconCpu className="size-4 text-emerald-400" />;
      case "claude":
        return <IconSparkles className="size-4 text-amber-400" />;
      case "antigravity":
        return <IconTerminal2 className="size-4 text-sky-400" />;
      default:
        return <IconTerminal2 className="size-4 text-zinc-400" />;
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] bg-[#121216] p-4 text-[#ededef] shadow-sm flex flex-col gap-4",
        className
      )}
    >
      {/* Top Controls: Title, Range Toggle, Grouping, Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <IconTable className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">
              Token-Verbrauch & Läufe
            </h3>
            <p className="text-xs text-zinc-400">
              Aggregiert nach {groupBy === "cli" ? "CLI" : groupBy === "agent" ? "Agent" : "Account"} • Zeitraum: {range}
            </p>
          </div>
        </div>

        {/* Action Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* GroupBy Switch */}
          {onGroupByChange && (
            <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#18181e] p-0.5 text-xs">
              {(["cli", "agent", "account"] as UsageGroupBy[]).map((gb) => (
                <button
                  key={gb}
                  type="button"
                  onClick={() => onGroupByChange(gb)}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium capitalize transition-colors",
                    groupBy === gb
                      ? "bg-white/[0.12] text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {gb === "cli" ? "CLI" : gb === "agent" ? "Agent" : "Konto"}
                </button>
              ))}
            </div>
          )}

          {/* Range Switch */}
          {onRangeChange && (
            <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#18181e] p-0.5 text-xs">
              {(["24h", "7d", "30d"] as UsageRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onRangeChange(r)}
                  className={cn(
                    "rounded-md px-2 py-1 font-medium transition-colors",
                    range === r
                      ? "bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtern nach Name, CLI oder Agent..."
            className="w-full rounded-lg border border-white/[0.08] bg-[#18181f] py-1.5 pl-8 pr-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50"
          />
        </div>
        <div className="text-xs text-zinc-400 font-mono">
          {filteredItems.length} Zeilen
        </div>
      </div>

      {/* Table Container with horizontal scroll for mobile 390px */}
      <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-[#0f0f13]">
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/[0.08] bg-white/[0.02] text-zinc-400 font-medium select-none">
              <th
                onClick={() => handleSort("label")}
                className="py-2.5 px-3 cursor-pointer hover:text-white"
              >
                Instanz / Entity {sortField === "label" && (sortAsc ? "▲" : "▼")}
              </th>
              <th className="py-2.5 px-3">Isolation</th>
              <th
                onClick={() => handleSort("totalTokens")}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-white"
              >
                Gesamt-Tokens {sortField === "totalTokens" && (sortAsc ? "▲" : "▼")}
              </th>
              <th
                onClick={() => handleSort("inputTokens")}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-white"
              >
                Input
              </th>
              <th
                onClick={() => handleSort("cachedTokens")}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-white"
              >
                Cached
              </th>
              <th
                onClick={() => handleSort("outputTokens")}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-white"
              >
                Output
              </th>
              <th
                onClick={() => handleSort("reasoningTokens")}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-white"
              >
                Reasoning
              </th>
              <th
                onClick={() => handleSort("runsCount")}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-white"
              >
                Läufe {sortField === "runsCount" && (sortAsc ? "▲" : "▼")}
              </th>
              <th
                onClick={() => handleSort("durationSeconds")}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-white"
              >
                Dauer
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-zinc-500">
                  <IconLayersSubtract className="mx-auto size-6 text-zinc-600 mb-1" />
                  Keine Einträge für diese Auswahl.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.key}
                  className="hover:bg-white/[0.03] transition-colors"
                >
                  {/* Entity Column */}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded bg-white/[0.06]">
                        {renderIcon(item)}
                      </span>
                      <div>
                        <span className="font-medium text-white block">
                          {item.label}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {item.key}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Isolation */}
                  <td className="py-2.5 px-3">
                    {item.isolation === "shared" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                        <IconUsers className="size-2.5" />
                        shared
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                        <IconShieldCheck className="size-2.5" />
                        per_agent
                      </span>
                    )}
                  </td>

                  {/* Total Tokens */}
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-white">
                    {formatTokens(item.totalTokens)}
                  </td>

                  {/* Input Tokens */}
                  <td className="py-2.5 px-3 text-right font-mono text-zinc-300">
                    {formatTokens(item.inputTokens)}
                  </td>

                  {/* Cached Tokens */}
                  <td className="py-2.5 px-3 text-right font-mono text-cyan-400">
                    {formatTokens(item.cachedTokens)}
                  </td>

                  {/* Output Tokens */}
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                    {formatTokens(item.outputTokens)}
                  </td>

                  {/* Reasoning Tokens */}
                  <td className="py-2.5 px-3 text-right font-mono text-purple-400">
                    {formatTokens(item.reasoningTokens)}
                  </td>

                  {/* Runs Count */}
                  <td className="py-2.5 px-3 text-right font-mono text-zinc-200">
                    {item.runsCount}
                  </td>

                  {/* Duration */}
                  <td className="py-2.5 px-3 text-right font-mono text-zinc-400">
                    {formatDuration(item.durationSeconds)}
                  </td>
                </tr>
              ))
            )}
          </tbody>

          {/* Footer Totals Row */}
          <tfoot>
            <tr className="border-t-2 border-white/[0.1] bg-white/[0.04] font-semibold text-white">
              <td className="py-2.5 px-3">
                Gesamt ({items.length} {groupBy === "cli" ? "CLIs" : groupBy === "agent" ? "Agenten" : "Konten"})
              </td>
              <td className="py-2.5 px-3 text-zinc-400 text-[11px] font-normal">
                Summe
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-sky-400">
                {formatTokens(totals.totalTokens)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-zinc-300">
                {formatTokens(totals.inputTokens)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-cyan-400">
                {formatTokens(totals.cachedTokens)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                {formatTokens(totals.outputTokens)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-purple-400">
                {formatTokens(totals.reasoningTokens)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-zinc-100">
                {totals.runsCount}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-zinc-300">
                {formatDuration(totals.durationSeconds)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
