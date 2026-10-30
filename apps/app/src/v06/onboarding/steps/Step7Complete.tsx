/**
 * Schritt 7: Fertig → direkt in Messages mit dem neuen Bot (A25 / Wave 3)
 */

import * as React from "react";
import {
  CheckCircle2,
  Bot,
  Building2,
  Palette,
  Wrench,
  Smartphone,
  User,
  ArrowRight,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFlag } from "@/contracts/v06/flags";
import { Button as DesignButton } from "@/v06/design";
import "@/v06/design/tokens.css";
import type { OnboardingData } from "../types";

export interface Step7CompleteProps {
  data: OnboardingData;
  onComplete: () => Promise<void>;
  onBack: () => void;
  isSaving?: boolean;
}

export function Step7Complete({
  data,
  onComplete,
  onBack,
  isSaving = false,
}: Step7CompleteProps) {
  const [isFinishing, setIsFinishing] = React.useState(false);

  const handleFinish = async () => {
    setIsFinishing(true);
    try {
      await onComplete();
    } finally {
      setIsFinishing(false);
    }
  };

  const botName = data.botName || "Nexus";
  const botRole = data.botRole || "General Workspace Copilot";
  const companyName = data.companyName || "Standard-Unternehmen";
  const toolsCount = data.tools?.length ?? 4;
  const themeLabel =
    data.themePreference === "dark"
      ? "Dark Mode"
      : data.themePreference === "light"
        ? "Light Mode"
        : "System (Auto)";

  const isDesignV2 = getFlag("designV2");

  return (
    <div className="w-full flex flex-col items-center justify-center max-w-xl mx-auto py-2 text-center select-none">
      <div
        className={`size-16 rounded-2xl flex items-center justify-center mb-4 shadow-sm ${
          isDesignV2
            ? "bg-[var(--p-accent)]/15 border border-[var(--p-accent)]/30 text-[var(--p-accent)] shadow-[0_0_24px_rgba(56,189,248,0.2)]"
            : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
        }`}
      >
        <CheckCircle2 className="size-9" />
      </div>

      <h1
        className={`text-3xl font-bold tracking-tight ${
          isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
        }`}
      >
        Dein Connect-Workspace ist startklar!
      </h1>
      <p
        className={`text-sm mt-2 max-w-md ${
          isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground"
        }`}
      >
        Alle Grundeinstellungen wurden erfolgreich eingerichtet. Dein neuer Bot{" "}
        <strong className={isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"}>
          {botName}
        </strong>{" "}
        steht bereit.
      </p>

      {/* Summary Card */}
      <div
        className={`w-full mt-6 p-4 text-left shadow-xs ${
          isDesignV2
            ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] divide-y divide-[var(--p-border)] shadow-md"
            : "rounded-xl border border-border/80 bg-card/60 divide-y divide-border/50"
        }`}
      >
        {data.fullName && (
          <div className="py-2.5 flex items-center justify-between">
            <div
              className={`flex items-center gap-2.5 text-xs ${
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
              }`}
            >
              <User className={`size-4 ${isDesignV2 ? "text-[var(--p-accent)]" : "text-primary"}`} />
              <span>Dein Name:</span>
            </div>
            <span
              className={`text-xs font-semibold ${
                isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
              }`}
            >
              {data.fullName}
            </span>
          </div>
        )}

        <div className="py-2.5 flex items-center justify-between">
          <div
            className={`flex items-center gap-2.5 text-xs ${
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
            }`}
          >
            <Palette className={`size-4 ${isDesignV2 ? "text-[var(--p-accent)]" : "text-primary"}`} />
            <span>Darstellung:</span>
          </div>
          <span
            className={`text-xs font-semibold ${
              isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
            }`}
          >
            {themeLabel}
          </span>
        </div>

        <div className="py-2.5 flex items-center justify-between">
          <div
            className={`flex items-center gap-2.5 text-xs ${
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
            }`}
          >
            <Building2 className={`size-4 ${isDesignV2 ? "text-[var(--p-accent)]" : "text-primary"}`} />
            <span>Firma:</span>
          </div>
          <span
            className={`text-xs font-semibold truncate max-w-[200px] ${
              isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
            }`}
          >
            {companyName}
          </span>
        </div>

        <div className="py-2.5 flex items-center justify-between">
          <div
            className={`flex items-center gap-2.5 text-xs ${
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
            }`}
          >
            <Wrench className={`size-4 ${isDesignV2 ? "text-[var(--p-accent)]" : "text-primary"}`} />
            <span>Aktive Tools:</span>
          </div>
          <span
            className={`text-xs font-semibold ${
              isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
            }`}
          >
            {toolsCount} Module aktiviert
          </span>
        </div>

        <div className="py-2.5 flex items-center justify-between">
          <div
            className={`flex items-center gap-2.5 text-xs ${
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
            }`}
          >
            <Bot className={`size-4 ${isDesignV2 ? "text-[var(--p-accent)]" : "text-primary"}`} />
            <span>Erster Bot:</span>
          </div>
          <span
            className={`text-xs font-semibold truncate max-w-[200px] ${
              isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
            }`}
          >
            {botName} ({botRole})
          </span>
        </div>

        <div className="py-2.5 flex items-center justify-between">
          <div
            className={`flex items-center gap-2.5 text-xs ${
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
            }`}
          >
            <Smartphone className={`size-4 ${isDesignV2 ? "text-[var(--p-accent)]" : "text-primary"}`} />
            <span>Handy-Kopplung:</span>
          </div>
          <span
            className={`text-xs font-semibold ${
              isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
            }`}
          >
            {data.phoneConnected ? "Verbunden" : "Bereit für später"}
          </span>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between w-full max-w-md gap-3">
        {isDesignV2 ? (
          <>
            <DesignButton
              type="button"
              variant="secondary"
              onClick={onBack}
              disabled={isSaving || isFinishing}
              leftIcon={<ArrowLeft className="size-4" />}
              className="w-1/3"
            >
              Zurück
            </DesignButton>
            <DesignButton
              type="button"
              variant="primary"
              size="lg"
              onClick={handleFinish}
              loading={isSaving || isFinishing}
              leftIcon={<MessageSquare className="size-4" />}
              rightIcon={<ArrowRight className="size-4" />}
              className="w-2/3"
            >
              {isFinishing ? "Wird gestartet…" : `Chat mit ${botName} starten`}
            </DesignButton>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSaving || isFinishing}
              className="w-1/3 gap-1.5"
            >
              <ArrowLeft className="size-4" />
              Zurück
            </Button>
            <Button
              type="button"
              onClick={handleFinish}
              disabled={isSaving || isFinishing}
              className="w-2/3 gap-2 shadow-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <MessageSquare className="size-4" />
              {isFinishing ? "Wird gestartet…" : `Chat mit ${botName} starten`}
              <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
