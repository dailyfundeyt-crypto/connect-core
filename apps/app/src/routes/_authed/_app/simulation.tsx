/**
 * Simulation Studio Route (/simulation) - Swarm-v3 (Lane 7 & 9)
 *
 * Zukunfts-Simulation mit 20 Agenten, Dual-Engine (Native TypeScript & MiroFish Sidecar),
 * p10/p50/p90 Unsicherheitsintervallen und automatischer Evidence-Synthese für den Council.
 */

import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import {
  IconCpu,
  IconFlask,
  IconPlayerPlay,
  IconRefresh,
  IconReportAnalytics,
  IconSparkles,
  IconChartDots,
  IconCheck,
} from "@tabler/icons-react";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/_app/simulation")({
  component: SimulationRoute,
});

interface EngineStatus {
  success: boolean;
  activeEngine: string;
  mirofishAvailable: boolean;
  activeRunsCount: number;
}

function SimulationRoute() {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/simulation/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  const runSampleSimulation = async () => {
    try {
      setRunning(true);
      const res = await fetch("/api/simulation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "CNT Computing & Connect Marktsimulation",
          scenario: "cnt-scale-2026",
          maxTicks: 10,
          budgetTokens: 50000,
          engine: "native",
          seed: {
            initialMarketSize: 1000,
            baseConversionRate: 0.035,
            competitors: ["Traditional ERP", "Standalone AI Agents"],
          },
        }),
      });
      const data = await res.json();
      setLastResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <SidebarToggleBar />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                <IconFlask className="size-5" />
              </span>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                Zukunfts-Simulations-Studio
              </h1>
              <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
                Swarm-v3
              </span>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Multi-Agenten Zukunfts-Simulation aus Spark-Plänen mit Unsicherheitsintervallen (p10 / p50 / p90).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={fetchStatus}
              disabled={loading}
              className="gap-1.5 text-xs h-9"
            >
              <IconRefresh className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Status prüfen
            </Button>
            <Button
              size="sm"
              onClick={runSampleSimulation}
              disabled={running}
              className="gap-1.5 text-xs h-9 bg-cyan-600 hover:bg-cyan-700 text-white font-medium"
            >
              <IconPlayerPlay className="size-3.5" />
              {running ? "Simulation läuft…" : "Plan-Simulation starten"}
            </Button>
          </div>
        </div>

        {/* Engine Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Aktive Simulations-Engine</span>
              <IconCpu className="size-4 text-cyan-400" />
            </div>
            <div className="text-lg font-bold text-foreground">
              {status?.activeEngine === "mirofish" ? "MiroFish Sidecar" : "Native TypeScript"}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Dual-Engine Architektur mit automatischem Fallback
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>MiroFish (AGPL-3.0) Status</span>
              <span className={`size-2 rounded-full ${status?.mirofishAvailable ? "bg-emerald-500" : "bg-amber-500"}`} />
            </div>
            <div className="text-lg font-bold text-foreground">
              {status?.mirofishAvailable ? "Sidecar Verbunden (Port 5011)" : "Isoliert / Standby"}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Feature-Flag: CONNECT_SIM_MIROFISH · Zero Cloud Leak
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Metriken & Konfidenz</span>
              <IconChartDots className="size-4 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-foreground">
              p10 · p50 · p90
            </div>
            <p className="text-[11px] text-muted-foreground">
              Robuste Wahrscheinlichkeitsverteilungen & Synthese
            </p>
          </div>
        </div>

        {/* Report / Results Preview */}
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <IconReportAnalytics className="size-4 text-cyan-500" />
              Simulations-Pipeline: Spark Plans → Ticks → Synthese-Report → Council
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              20 Agenten x 10 Ticks
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Liest Seed-Informationen aus den Spark-Dateien (z. B. <code className="text-primary font-mono text-[11px]">CNT Idee.md</code>, <code className="text-primary font-mono text-[11px]">Plan 1.md</code>).
            Erzeugt deterministische Marktentwicklungen und bereitet Entscheidungs-Optionen für den Council vor.
          </p>

          {lastResult && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-2 mt-4">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                <IconCheck className="size-4 text-cyan-400" />
                Simulationslauf abgeschlossen: {lastResult.runId || lastResult.id}
              </div>
              <p className="text-xs text-muted-foreground">
                Dauer: {lastResult.durationMs ? `${lastResult.durationMs}ms` : "OK"} · Ticks: {lastResult.ticksCount || 10} · Status: Erfolgreich
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default SimulationRoute;
