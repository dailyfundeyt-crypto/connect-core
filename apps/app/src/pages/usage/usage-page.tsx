import React from "react";
import { cn } from "@/lib/utils";
import { useConductorData } from "./use-conductor-data";
import { AccountQuotaGrid } from "@/components/usage/account-quota-grid";
import { UsageTable } from "@/components/usage/usage-table";
import { UsageChart } from "@/components/usage/usage-chart";
import { ConductorStatusCard } from "@/components/conductor/conductor-status-card";
import { ConductorKillSwitch } from "@/components/conductor/conductor-kill-switch";
import { ConductorCooldowns } from "@/components/conductor/conductor-cooldowns";
import { ConductorHandoffs } from "@/components/conductor/conductor-handoffs";
import { ConductorEventLog } from "@/components/conductor/conductor-event-log";
import { Button } from "@/components/ui/button";
import {
  IconRefresh,
  IconActivity,
  IconServer,
  IconRadio,
  IconGauge,
  IconShieldLock,
} from "@tabler/icons-react";

export interface UsagePageProps {
  className?: string;
}

export function UsagePage({ className }: UsagePageProps) {
  const {
    accounts,
    quotaWindows,
    usageSummary,
    timeSeries,
    config,
    runtimes,
    transfers,
    events,
    isPaused,
    isLoading,
    isLiveConnected,
    range,
    groupBy,
    setRange,
    setGroupBy,
    toggleKillSwitch,
    triggerHandoff,
    refresh,
  } = useConductorData();

  return (
    <div
      className={cn(
        "min-h-screen bg-[#0c0c10] text-[#ededef] font-sans transition-colors duration-150 antialiased",
        className
      )}
    >
      <div className="max-w-7xl mx-auto p-3.5 sm:p-6 space-y-6">
        {/* Page Top Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 text-white shadow-md shadow-sky-500/20">
                <IconGauge className="size-4.5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Nutzung & Conductor
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              CLI-Quotas, Token-Verbrauch & nativer Supervisor (Codex primär → Claude Standby)
            </p>
          </div>

          {/* Top Status Badges & Controls */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Host Status Badge */}
            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141419] px-2.5 py-1 text-xs text-zinc-300 font-mono">
              <IconServer className="size-3.5 text-zinc-400" />
              <span>Kunc GmbH : 3101</span>
            </div>

            {/* Live SSE / Polling Indicator */}
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
                isLiveConnected
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-300"
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isLiveConnected
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-sky-400"
                )}
              />
              <span>{isLiveConnected ? "SSE Live" : "Polling (30s)"}</span>
            </div>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={isLoading}
              className="text-xs gap-1.5 border-white/[0.08] bg-[#141419] text-zinc-200 hover:bg-white/[0.06]"
            >
              <IconRefresh
                className={cn("size-3.5", isLoading && "animate-spin text-sky-400")}
              />
              <span className="hidden sm:inline">Aktualisieren</span>
            </Button>
          </div>
        </header>

        {/* Section 1: Quota-Ringe pro Account (Kacheln) */}
        <section aria-label="Quota pro Account">
          <AccountQuotaGrid
            accounts={accounts}
            quotaWindows={quotaWindows}
          />
        </section>

        {/* Section 2: Conductor Supervisor & Failover */}
        <section aria-label="Conductor Steuerung" className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-indigo-400" />
            <h2 className="text-base font-semibold text-white tracking-tight">
              Conductor Supervisor & Failover
            </h2>
          </div>

          {/* Kill Switch Banner & Toggle */}
          <ConductorKillSwitch
            killSwitchActive={config.killSwitch}
            onToggle={toggleKillSwitch}
            isLoading={isLoading}
          />

          {/* Status & Routing Card */}
          <ConductorStatusCard
            config={config}
            runtimes={runtimes}
            isPaused={isPaused}
          />

          {/* Cooldowns & Handoffs Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ConductorCooldowns
              runtimes={runtimes}
              cooldownMin={config.cooldownMin}
            />
            <ConductorHandoffs
              transfers={transfers}
              onTriggerHandoff={triggerHandoff}
            />
          </div>

          {/* Conductor Event-Log */}
          <ConductorEventLog events={events} />
        </section>

        {/* Section 3: Token-Verbrauch & Zeitreihe */}
        <section aria-label="Token Verbrauch" className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400" />
            <h2 className="text-base font-semibold text-white tracking-tight">
              Token-Verbrauch & Aktivität
            </h2>
          </div>

          {/* Zeitreihe Chart */}
          <UsageChart data={timeSeries} />

          {/* Tabelle Agent x CLI */}
          <UsageTable
            items={usageSummary.items}
            totals={usageSummary.totals}
            range={range}
            groupBy={groupBy}
            onRangeChange={setRange}
            onGroupByChange={setGroupBy}
          />
        </section>
      </div>
    </div>
  );
}

export default UsagePage;
