import * as React from "react";
import { CheckCircle2, Bot, Building2, Palette, Wrench, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompleteStepProps {
  theme: string;
  companyName?: string;
  agentName?: string;
  agentRole?: string;
  toolsCount: number;
  isSaving: boolean;
  onComplete: () => void;
  onBack: () => void;
}

export function CompleteStep({
  theme,
  companyName = "Standard-Unternehmen",
  agentName = "Nexus",
  agentRole = "Workspace Copilot",
  toolsCount,
  isSaving,
  onComplete,
  onBack,
}: CompleteStepProps) {
  return (
    <div className="w-full flex flex-col items-center justify-center max-w-xl mx-auto py-2 text-center">
      <div className="size-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mb-5 shadow-sm">
        <CheckCircle2 className="size-8" />
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Dein Workspace ist bereit!
      </h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-md">
        Alle Grundeinstellungen wurden erfolgreich konfiguriert. Du kannst jetzt direkt mit deinen Agents zusammenarbeiten.
      </p>

      {/* Workspace Summary Card */}
      <div className="w-full mt-6 p-4 rounded-xl border border-border/80 bg-card/60 divide-y divide-border/50 text-left">
        <div className="py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <Palette className="size-4 text-primary" />
            <span>Erscheinungsbild:</span>
          </div>
          <span className="text-xs font-semibold text-foreground capitalize">
            {theme === "dark" ? "Dark Mode" : theme === "light" ? "Light Mode" : "System"}
          </span>
        </div>

        <div className="py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <Building2 className="size-4 text-primary" />
            <span>Aktives Unternehmen:</span>
          </div>
          <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
            {companyName}
          </span>
        </div>

        <div className="py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <Bot className="size-4 text-primary" />
            <span>Erster Agent:</span>
          </div>
          <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
            {agentName} ({agentRole})
          </span>
        </div>

        <div className="py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <Wrench className="size-4 text-primary" />
            <span>Aktivierte Tools:</span>
          </div>
          <span className="text-xs font-semibold text-foreground">
            {toolsCount} Module aktiv
          </span>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between w-full max-w-xs gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          size="lg"
          disabled={isSaving}
          className="w-1/3"
        >
          <ArrowLeft className="size-4 mr-1" />
          Zurück
        </Button>
        <Button
          onClick={onComplete}
          disabled={isSaving}
          size="lg"
          className="w-2/3 shadow-sm font-medium"
        >
          {isSaving ? "Wird geladen…" : "Workspace betreten"}
          <ArrowRight className="size-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
