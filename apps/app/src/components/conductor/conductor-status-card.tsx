import React from "react";
import { cn } from "@/lib/utils";
import type { ConductorConfig, ConductorRuntimeStatus } from "./types";
import {
  IconCpu,
  IconSparkles,
  IconShieldCheck,
  IconCheck,
  IconAlertTriangle,
  IconClock,
  IconArrowRight,
  IconLayersSubtract,
  IconActivity,
  IconBan,
} from "@tabler/icons-react";

export interface ConductorStatusCardProps {
  config: ConductorConfig;
  runtimes: ConductorRuntimeStatus[];
  isPaused: boolean;
  className?: string;
}

export function ConductorStatusCard({
  config,
  runtimes,
  isPaused,
  className,
}: ConductorStatusCardProps) {
  const primaryStatus = runtimes.find((r) => r.cliKind === config.primary);
  const standbyStatus = runtimes.find((r) => r.cliKind === config.standby);

  const getStatusBadge = (status?: ConductorRuntimeStatus) => {
    if (!status) {
      return (
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 font-medium">
          Offline
        </span>
      );
    }

    switch (status.state) {
      case "available":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Bereit
          </span>
        );
      case "cooldown":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 uppercase tracking-wider">
            <IconClock className="size-3" />
            Cooldown
          </span>
        );
      case "auth_error":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300 uppercase tracking-wider">
            <IconAlertTriangle className="size-3" />
            Auth-Fehler
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-300 uppercase tracking-wider">
            Pausiert
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
            Nicht verfügbar
          </span>
        );
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] bg-[#121216] p-4 text-[#ededef] shadow-sm flex flex-col gap-4",
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
            <IconActivity className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
              Conductor Supervisor
              {config.killSwitch ? (
                <span className="rounded bg-rose-500/20 text-rose-300 text-[10px] px-2 py-0.5 border border-rose-500/40">
                  Not-Aus Aktiv
                </span>
              ) : isPaused ? (
                <span className="rounded bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 border border-amber-500/40">
                  Pausiert
                </span>
              ) : (
                <span className="rounded bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 border border-emerald-500/40">
                  Aktiv
                </span>
              )}
            </h3>
            <p className="text-xs text-zinc-400">
              Automatisches Failover-Routing • Single-Owner Claim-Verwaltung
            </p>
          </div>
        </div>

        {/* Strict Paid API Disallowed Badge */}
        <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 self-start sm:self-auto font-medium">
          <IconShieldCheck className="size-4 shrink-0 text-emerald-400" />
          <span>Paid-API-Fallback: Streng verboten (literal false)</span>
        </div>
      </div>

      {/* Runtimes Routing Grid: Codex (Primary) -> Claude (Standby) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Primary Runtime Card */}
        <div className="rounded-lg border border-white/[0.08] bg-[#16161c] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
                <IconCpu className="size-4" />
              </span>
              <div>
                <span className="text-xs font-semibold text-white block">
                  Primär: OpenAI Codex
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {primaryStatus?.accountId || "acc_codex_orig"}
                </span>
              </div>
            </div>
            {getStatusBadge(primaryStatus)}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06] text-xs">
            <div>
              <span className="text-[10px] text-zinc-500 block">Aktive Claims</span>
              <span className="font-mono font-semibold text-zinc-200">
                {primaryStatus?.activeClaimsCount ?? 0} Tasks
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block">Fehlschläge</span>
              <span className="font-mono font-semibold text-zinc-200">
                {primaryStatus?.consecutiveFailures ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Standby Runtime Card */}
        <div className="rounded-lg border border-white/[0.08] bg-[#16161c] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-400">
                <IconSparkles className="size-4" />
              </span>
              <div>
                <span className="text-xs font-semibold text-white block">
                  Standby: Claude Code
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {standbyStatus?.accountId || "acc_claude_primary"}
                </span>
              </div>
            </div>
            {getStatusBadge(standbyStatus)}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06] text-xs">
            <div>
              <span className="text-[10px] text-zinc-500 block">Aktive Claims</span>
              <span className="font-mono font-semibold text-zinc-200">
                {standbyStatus?.activeClaimsCount ?? 0} Tasks
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block">Fehlschläge</span>
              <span className="font-mono font-semibold text-zinc-200">
                {standbyStatus?.consecutiveFailures ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Summary Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 pt-1">
        <span className="rounded bg-white/[0.04] px-2 py-1 font-mono text-[11px]">
          Cooldown: {config.cooldownMin} min
        </span>
        <span className="rounded bg-white/[0.04] px-2 py-1 font-mono text-[11px]">
          Poll: {config.pollSec}s (Initial: {config.initialPollSec}s)
        </span>
        <span className="rounded bg-white/[0.04] px-2 py-1 font-mono text-[11px]">
          Max Handoffs: {config.maxHandoffsPerTask} pro Task
        </span>
      </div>
    </div>
  );
}
