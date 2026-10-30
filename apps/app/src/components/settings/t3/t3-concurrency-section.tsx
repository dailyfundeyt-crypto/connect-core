/**
 * T3-Einstellungen — Gleichzeitigkeit & Scheduler (Lane A25).
 *
 * Verwaltet:
 *  - Maximale gleichzeitige Turns gesamt (Standard: 5)
 *  - Maximale gleichzeitige Turns pro CLI (Codex: 3, Claude: 2, sonst: 1 gemäß A08)
 *  - Scheduler-Timeouts (Queue-Timeout 120 min, Leerlauf-Schlaf 15 min, RAM-Schutz maxAwakeAgents: 8)
 *  - Automatische Last-Drosselung (A09 Hook)
 *  - Live-Status der Flotte (useSchedulerStatus)
 */

import { useState } from "react";
import {
  IconActivity,
  IconClock,
  IconCpu,
  IconGauge,
  IconInfoCircle,
  IconMoon,
  IconPlus,
  IconRefresh,
  IconServer,
  IconUsers,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSchedulerStatus } from "@/lib/t3";
import type { T3ConcurrencySettings } from "./types";

interface T3ConcurrencySectionProps {
  settings: T3ConcurrencySettings;
  onChange: (patch: Partial<T3ConcurrencySettings>) => void;
  className?: string;
}

export function T3ConcurrencySection({
  settings,
  onChange,
  className,
}: T3ConcurrencySectionProps) {
  const { running, limits, agents, loading, refetch } = useSchedulerStatus();

  const activeAgentsCount = agents.filter((a) => a.state === "running").length;
  const queuedAgentsCount = agents.filter((a) => a.state === "queued").length;
  const sleepingAgentsCount = agents.filter((a) => a.state === "sleeping").length;

  const handleTotalChange = (val: number) => {
    const clamped = Math.max(1, Math.min(val, 20));
    onChange({ maxConcurrentTurns: clamped });
  };

  const handleProviderLimitChange = (provider: string, val: number) => {
    const clamped = Math.max(1, Math.min(val, 10));
    onChange({
      providerLimits: {
        ...settings.providerLimits,
        [provider]: clamped,
      },
    });
  };

  return (
    <div className={cn("space-y-4", className)} data-testid="t3-concurrency-section">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Gleichzeitigkeit & Scheduler</h3>
          <p className="text-xs text-[#888]">
            Orchestrierung von Hintergrund-Turns, Warteschlangen und RAM-Schutz (A08).
          </p>
        </div>

        <Button
          aria-label="Scheduler-Status aktualisieren"
          className="border-white/10 text-[#aaa] hover:text-white"
          disabled={loading}
          onClick={() => void refetch()}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconRefresh className={cn("size-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Live Flottenstatus Snapshot */}
      <div className="rounded-xl border border-white/[0.08] bg-[#141413] p-3 text-xs">
        <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 text-[11px] text-[#777]">
          <span className="flex items-center gap-1.5 font-medium text-[#aaa]">
            <IconActivity className="size-3.5 text-emerald-400" />
            Live Flottenzustand
          </span>
          <span className="font-mono text-[10px]">
            {running ? "Scheduler aktiv" : "Scheduler im Ruhezustand"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20 p-2">
            <span className="text-[10px] text-emerald-300">Laufend</span>
            <div className="text-base font-bold text-emerald-400" data-testid="active-turns-count">
              {activeAgentsCount} / {settings.maxConcurrentTurns}
            </div>
          </div>
          <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 p-2">
            <span className="text-[10px] text-amber-300">In Warteschlange</span>
            <div className="text-base font-bold text-amber-400" data-testid="queued-turns-count">
              {queuedAgentsCount}
            </div>
          </div>
          <div className="rounded-lg bg-sky-500/[0.06] border border-sky-500/20 p-2">
            <span className="text-[10px] text-sky-300">Schlafend (&gt;15m)</span>
            <div className="text-base font-bold text-sky-400">
              {sleepingAgentsCount}
            </div>
          </div>
        </div>
      </div>

      {/* Gesamt-Gleichzeitigkeit */}
      <div className="rounded-xl border border-white/[0.06] bg-[#141413] p-4 text-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-white">Gleichzeitige Turns gesamt</h4>
            <p className="text-[11px] text-[#777]">
              Obergrenze paralleler LLM-Turns über alle Agenten hinweg (Standard: 5).
            </p>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-2">
            <Button
              className="size-7 rounded-md border-white/10 p-0 text-white hover:bg-white/10"
              disabled={settings.maxConcurrentTurns <= 1}
              onClick={() => handleTotalChange(settings.maxConcurrentTurns - 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              -
            </Button>
            <span
              className="w-8 text-center font-mono text-sm font-semibold text-white"
              data-testid="max-concurrent-turns-value"
            >
              {settings.maxConcurrentTurns}
            </span>
            <Button
              className="size-7 rounded-md border-white/10 p-0 text-white hover:bg-white/10"
              disabled={settings.maxConcurrentTurns >= 20}
              onClick={() => handleTotalChange(settings.maxConcurrentTurns + 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              +
            </Button>
          </div>
        </div>

        {/* Pro-Provider Limits */}
        <div className="border-t border-white/[0.04] pt-3">
          <h4 className="font-medium text-white mb-2">Gleichzeitigkeit je Provider-CLI</h4>
          <p className="text-[11px] text-[#777] mb-3">
            Verhindert Rate-Limits bei einzelnen Anbietern. Vorgabe von Stefan: Codex 3, Claude 2, sonstige 1.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {/* Codex */}
            <div className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
              <div>
                <span className="font-medium text-white">Codex</span>
                <p className="text-[10px] text-[#666]">OpenAI Standard: max. 3</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  className="size-6 rounded p-0 text-xs border-white/10 text-white"
                  disabled={(settings.providerLimits.codex ?? 3) <= 1}
                  onClick={() =>
                    handleProviderLimitChange("codex", (settings.providerLimits.codex ?? 3) - 1)
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  -
                </Button>
                <span className="w-6 text-center font-mono font-medium text-white">
                  {settings.providerLimits.codex ?? 3}
                </span>
                <Button
                  className="size-6 rounded p-0 text-xs border-white/10 text-white"
                  disabled={(settings.providerLimits.codex ?? 3) >= 10}
                  onClick={() =>
                    handleProviderLimitChange("codex", (settings.providerLimits.codex ?? 3) + 1)
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  +
                </Button>
              </div>
            </div>

            {/* Claude */}
            <div className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
              <div>
                <span className="font-medium text-white">Claude</span>
                <p className="text-[10px] text-[#666]">Anthropic Standard: max. 2</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  className="size-6 rounded p-0 text-xs border-white/10 text-white"
                  disabled={(settings.providerLimits.claudeAgent ?? 2) <= 1}
                  onClick={() =>
                    handleProviderLimitChange(
                      "claudeAgent",
                      (settings.providerLimits.claudeAgent ?? 2) - 1,
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  -
                </Button>
                <span className="w-6 text-center font-mono font-medium text-white">
                  {settings.providerLimits.claudeAgent ?? 2}
                </span>
                <Button
                  className="size-6 rounded p-0 text-xs border-white/10 text-white"
                  disabled={(settings.providerLimits.claudeAgent ?? 2) >= 10}
                  onClick={() =>
                    handleProviderLimitChange(
                      "claudeAgent",
                      (settings.providerLimits.claudeAgent ?? 2) + 1,
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  +
                </Button>
              </div>
            </div>

            {/* Cursor */}
            <div className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
              <div>
                <span className="font-medium text-white">Cursor</span>
                <p className="text-[10px] text-[#666]">Standard: max. 1</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-[#888]">
                  {settings.providerLimits.cursor ?? 1}
                </span>
              </div>
            </div>

            {/* Grok */}
            <div className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
              <div>
                <span className="font-medium text-white">Grok</span>
                <p className="text-[10px] text-[#666]">Standard: max. 1</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs text-[#888]">
                  {settings.providerLimits.grok ?? 1}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scheduler Timeouts & Schlaf */}
      <div className="rounded-xl border border-white/[0.06] bg-[#141413] p-4 text-xs space-y-3">
        <h4 className="font-medium text-white">Lifecycle & Arbeitsspeicher (RAM)</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Leerlauf-Schlaf */}
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
            <div className="flex items-center gap-1.5 text-white font-medium">
              <IconMoon className="size-3.5 text-sky-400" />
              <span>Automatischer Schlaf</span>
            </div>
            <p className="mt-1 text-[11px] text-[#777]">
              Nach {settings.idleSessionTimeoutMinutes} min Inaktivität wird der Agent schlafen gelegt.
              Bei neuer Nachricht wacht er mit resumeThread automatisch auf.
            </p>
          </div>

          {/* RAM-Schutz */}
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
            <div className="flex items-center gap-1.5 text-white font-medium">
              <IconCpu className="size-3.5 text-purple-400" />
              <span>RAM-Schutz ({settings.maxAwakeAgents} Agenten)</span>
            </div>
            <p className="mt-1 text-[11px] text-[#777]">
              Hält maximal {settings.maxAwakeAgents} Agenten gleichzeitig im Speicher. Ältere Agenten
              werden automatisch ausgelagert.
            </p>
          </div>
        </div>

        {/* Lastschutz-Schalter */}
        <div className="flex items-center justify-between border-t border-white/[0.04] pt-3">
          <div>
            <p className="font-medium text-white">Automatische Last-Drosselung (A09 Hook)</p>
            <p className="text-[11px] text-[#777]">
              Pausiert neue Queue-Starts bei hoher System-CPU/RAM-Last (&gt;90 %) temporär
            </p>
          </div>
          <Switch
            aria-label="Last-Drosselung"
            checked={settings.autoThrottleOnHighLoad}
            onCheckedChange={(checked) => onChange({ autoThrottleOnHighLoad: checked })}
          />
        </div>
      </div>
    </div>
  );
}
