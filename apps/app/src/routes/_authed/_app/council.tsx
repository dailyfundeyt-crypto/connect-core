/**
 * Council (Roast-Room) Route (/council) - Swarm-v3 (Lane 6 & 9)
 *
 * Interaktive Debatten-Arena mit 5 Kern-Säulen, Anti-Groupthink,
 * Devil's Advocate Intervention und verifizierten Zitaten aus $100M Money Models.
 */

import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import {
  IconCheck,
  IconGavel,
  IconFlame,
  IconPlayerPlay,
  IconRefresh,
  IconScale,
  IconShieldCheck,
  IconSparkles,
  IconUserCheck,
} from "@tabler/icons-react";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/_app/council")({
  component: CouncilRoute,
});

interface CouncilHealth {
  status: string;
  module: string;
  lane: string;
  timestamp: string;
}

function CouncilRoute() {
  const [health, setHealth] = useState<CouncilHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [debateStarting, setDebateStarting] = useState(false);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/council/health");
      const data = await res.json();
      setHealth(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHealth();
  }, []);

  const startScaleStefanDebate = async () => {
    try {
      setDebateStarting(true);
      const res = await fetch("/api/council/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Wie skaliert Stefan am besten von 100k auf 1M ARR?",
          options: [
            "Option A: Decoy Offer mit Setup-Fee Waiver",
            "Option B: Continuity Discount mit Jahresvertrag",
            "Option C: High-Ticket Done-for-you Consulting",
          ],
          mode: "quick",
          seats: [
            { agentId: "agent_hormozi_offer", role: "Offer & Growth", weight: 1.5 },
            { agentId: "agent_cfo_runway", role: "Finance & Cashflow", weight: 1.2 },
            { agentId: "agent_retention_core", role: "Churn & Retention", weight: 1.0 },
            { agentId: "agent_skeptic_ruin", role: "Risk & Governance", weight: 1.4 },
          ],
        }),
      });
      const data = await res.json();
      if (data.success && data.session) {
        setActiveSession(data.session);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDebateStarting(false);
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
              <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <IconScale className="size-5" />
              </span>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                Council / Roast-Room
              </h1>
              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                Swarm-v3
              </span>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Schonungslose Debatten, Anti-Groupthink-Checks und gewichtete Abstimmungen nach $100M Money Models.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={fetchHealth}
              disabled={loading}
              className="gap-1.5 text-xs h-9"
            >
              <IconRefresh className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Health prüfen
            </Button>
            <Button
              size="sm"
              onClick={startScaleStefanDebate}
              disabled={debateStarting}
              className="gap-1.5 text-xs h-9 bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              <IconFlame className="size-3.5 text-amber-200" />
              {debateStarting ? "Debatte startet…" : "„Scale Stefan“ Roast starten"}
            </Button>
          </div>
        </div>

        {/* Engine Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Status</span>
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-lg font-bold text-foreground capitalize">
              {health?.status === "ok" ? "Aktiv (Bereit)" : "Wird geprüft…"}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {health?.lane || "Lane 6 Roast-Room Council Engine"}
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Anti-Groupthink Wächter</span>
              <IconShieldCheck className="size-4 text-amber-400" />
            </div>
            <div className="text-lg font-bold text-foreground">
              Ruin-Cap 30%
            </div>
            <p className="text-[11px] text-muted-foreground">
              Automatischer Devil's Advocate bei Einmütigkeit
            </p>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Verbatim $100M Zitate</span>
              <IconSparkles className="size-4 text-cyan-400" />
            </div>
            <div className="text-lg font-bold text-foreground">
              17 Frameworks
            </div>
            <p className="text-[11px] text-muted-foreground">
              Hormozi Grounding mit Zero-Leak Garantie
            </p>
          </div>
        </div>

        {/* Active Session / Preset Card */}
        <div className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <IconGavel className="size-4 text-amber-500" />
              Standard-Debatte: Wie skaliert Stefan am besten?
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              Template: scale-stefan (4 Seats, Quick Mode)
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Untersucht die 3 Kern-Optionen für die CNT Computing & Connect Skalierung.
            Hormozi schlägt Decoy-Angebote vor, der CFO prüft Runway, der Retention-Sitz bewertet Churn und der Skeptiker deckelt Ruin-Risiken.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
            {[
              { role: "Growth & Offer", name: "Hormozi Offer Architect", quote: "Win Your Money Back & Decoy" },
              { role: "Finance & Runway", name: "CFO Liquidity Auditor", quote: "Pay Less Now or Pay More Later" },
              { role: "Churn & Retention", name: "Retention Core Architect", quote: "Continuity Discount & Rollover" },
              { role: "Risk & Governance", name: "Skeptic Ruin Auditor", quote: "Trial With Penalty & Worst-Case" },
            ].map((seat, idx) => (
              <div key={idx} className="rounded-xl border border-border/40 bg-secondary/30 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                  <IconUserCheck className="size-3" />
                  {seat.role}
                </div>
                <div className="text-xs font-bold text-foreground truncate">{seat.name}</div>
                <div className="text-[10px] text-muted-foreground truncate italic">„{seat.quote}“</div>
              </div>
            ))}
          </div>

          {activeSession && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2 mt-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <IconCheck className="size-4 text-emerald-400" />
                Debatte gestartet: {activeSession.id}
              </div>
              <p className="text-xs text-muted-foreground">
                Frage: {activeSession.question} · Status: {activeSession.status}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default CouncilRoute;
