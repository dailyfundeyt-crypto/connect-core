import * as React from "react";
import { Sparkles, Bot, Globe, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WelcomeStepProps {
  onContinue: () => void;
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
  return (
    <div className="w-full flex flex-col items-center justify-center text-center max-w-xl mx-auto py-2">
      <div className="relative mb-6">
        <div className="size-20 rounded-3xl bg-gradient-to-tr from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center shadow-lg">
          <img
            src="/brand/connect-logo.png"
            alt="Connect Logo"
            className="size-12 rounded-xl shadow-xs"
            onError={(e) => {
              // Fallback to Icon if image is not loaded
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
          <Sparkles className="size-8 text-primary absolute" />
        </div>
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
        Willkommen bei Connect
      </h1>
      <p className="text-sm sm:text-base text-muted-foreground mt-3 max-w-md leading-relaxed">
        Dein selbst gehosteter AI-Coworker-Workspace mit echter Browser-Automatisierung, Multi-Modell-Unterstützung und sicherer Swarm-Architektur.
      </p>

      {/* Feature highlights grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mt-8 text-left">
        <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex flex-col gap-2">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Bot className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-foreground">
              Autonome Agents
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Erstelle spezialisierte AI-Mitarbeiter für jede Aufgabe.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex flex-col gap-2">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Globe className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-foreground">
              Echter Browser
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Echtes Chromium-Surfen ohne iFrame- oder CORS-Sperren.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border/80 bg-card/60 backdrop-blur-xs flex flex-col gap-2">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Shield className="size-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-foreground">
              Lokal & Sicher
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Deine Daten bleiben lokal auf deinem System in Postgres.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-10 w-full max-w-xs">
        <Button
          size="lg"
          onClick={onContinue}
          className="w-full gap-2 shadow-sm text-sm font-medium"
        >
          Einrichtung starten
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
