import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { QuotaRing } from "./quota-ring";
import type { CliAccount, QuotaWindow } from "./types";
import {
  IconCpu,
  IconClock,
  IconShieldCheck,
  IconSparkles,
  IconUsers,
  IconTerminal2,
  IconAlertCircle,
} from "@tabler/icons-react";

export interface AccountQuotaCardProps {
  account: CliAccount;
  quotaWindow?: QuotaWindow;
  className?: string;
}

/** Formats remaining time until reset */
function formatCountdown(resetsAt: number | string | null | undefined): string {
  if (!resetsAt) return "Kein Timer";

  const target = typeof resetsAt === "number" ? resetsAt * 1000 : new Date(resetsAt).getTime();
  const now = Date.now();
  const diffMs = target - now;

  if (diffMs <= 0) return "Reset fällig";

  const diffSec = Math.floor(diffMs / 1000);
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  const seconds = diffSec % 60;

  if (days > 1) {
    return `${days}d ${hours}h`;
  }
  if (days === 1) {
    return `1d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

/** Formats window minutes to human-readable label */
function formatWindowMinutes(min: number): string {
  if (min >= 43200) return `${Math.round(min / 1440)} Tage`;
  if (min >= 1440) return `${Math.round(min / 1440)} Tag(e)`;
  if (min >= 60) return `${Math.round(min / 60)} Std.`;
  return `${min} Min.`;
}

export function AccountQuotaCard({
  account,
  quotaWindow,
  className,
}: AccountQuotaCardProps) {
  const [countdown, setCountdown] = useState<string>(() =>
    formatCountdown(quotaWindow?.resetsAt)
  );

  useEffect(() => {
    if (!quotaWindow?.resetsAt) return;

    // Update countdown every second
    const interval = setInterval(() => {
      setCountdown(formatCountdown(quotaWindow.resetsAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [quotaWindow?.resetsAt]);

  const isShared = account.isolation === "shared";
  const confidence = quotaWindow?.confidence ?? (isShared ? "estimated" : "exact");
  const usedPercent = quotaWindow ? quotaWindow.usedPercent : 0;

  // Icon for CLI
  const renderCliIcon = () => {
    switch (account.cliKind) {
      case "codex":
        return <IconCpu className="size-4 text-emerald-400" />;
      case "claude":
        return <IconSparkles className="size-4 text-amber-400" />;
      case "antigravity":
        return <IconTerminal2 className="size-4 text-sky-400" />;
      case "gemini":
      case "gemini-cli":
        return <IconTerminal2 className="size-4 text-indigo-400" />;
      default:
        return <IconTerminal2 className="size-4 text-zinc-400" />;
    }
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#121216] p-4 text-[#ededef] shadow-sm transition-all duration-200 hover:border-white/20 hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-sky-500/40",
        className
      )}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.06]">
              {renderCliIcon()}
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold tracking-tight truncate text-white" title={account.label}>
                {account.label}
              </h4>
              <p className="text-xs text-zinc-400 truncate uppercase tracking-wider font-mono font-medium">
                {account.cliKind}
              </p>
            </div>
          </div>
        </div>

        {/* Isolation / Confidence Badge */}
        <div className="flex flex-col items-end gap-1">
          {isShared ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300 uppercase tracking-wider"
              title="Geteiltes Konto (Global auf diesem Host)"
            >
              <IconUsers className="size-2.5" />
              Shared
            </span>
          ) : confidence === "exact" ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 uppercase tracking-wider"
              title="Exakte Quota aus lokalem Session-Log"
            >
              <IconShieldCheck className="size-2.5" />
              Exact
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 uppercase tracking-wider"
              title="Heuristische Schätzung des Zeitfensters"
            >
              <IconAlertCircle className="size-2.5" />
              Estimated
            </span>
          )}

          {account.planType && (
            <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-zinc-400 font-mono">
              Plan: {account.planType}
            </span>
          )}
        </div>
      </div>

      {/* Middle: Quota Ring & Window Stats */}
      <div className="my-4 flex items-center justify-between gap-4">
        <div className="flex-1 space-y-1">
          {isShared ? (
            <div className="space-y-0.5">
              <span className="text-xs font-medium text-zinc-400">Verbindung</span>
              <p className="text-sm font-semibold text-zinc-200">Shared Host</p>
              <p className="text-[11px] text-zinc-500 leading-tight">
                Lokale Quota wird serverseitig nach Läufen erfasst
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <div>
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">
                  {quotaWindow?.windowKind === "primary"
                    ? "Haupt-Quota"
                    : quotaWindow?.windowKind === "heuristic_5h"
                    ? "5h-Rolling"
                    : "Aktives Fenster"}
                </span>
                <p className="text-xs font-semibold text-zinc-300">
                  {quotaWindow ? formatWindowMinutes(quotaWindow.windowMinutes) : "–"}
                </p>
              </div>

              {/* Reset Countdown */}
              {quotaWindow?.resetsAt && (
                <div className="flex items-center gap-1.5 text-xs text-sky-400 pt-0.5">
                  <IconClock className="size-3.5 shrink-0 text-sky-400/80" />
                  <span className="font-mono font-medium truncate" title={`Reset: ${quotaWindow.resetsAt}`}>
                    {countdown}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ring */}
        <div className="shrink-0">
          <QuotaRing
            percent={usedPercent}
            size={72}
            strokeWidth={6.5}
            confidence={confidence}
            isShared={isShared}
          />
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-white/[0.06] pt-2.5 flex items-center justify-between text-[11px] text-zinc-500">
        <span className="truncate max-w-[170px] font-mono text-[10px]" title={account.homePath}>
          {account.id}
        </span>
        <span className="shrink-0 text-zinc-400 font-medium">
          {isShared ? "Gemeinsam genutzt" : "Dediziert"}
        </span>
      </div>
    </div>
  );
}
