/**
 * OnboardingRestartButton (A25 / Wave 3)
 * Drop-in Komponente fuer die Einstellungen zum erneuten Starten des Onboardings.
 * Wiring durch Integrations-Agent A33.
 */

import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFlag } from "@/contracts/v06/flags";
import { Button as DesignButton } from "@/v06/design";
import "@/v06/design/tokens.css";

export interface OnboardingRestartButtonProps {
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  onBeforeRestart?: () => void;
}

export function OnboardingRestartButton({
  className,
  variant = "outline",
  size = "sm",
  onBeforeRestart,
}: OnboardingRestartButtonProps) {
  const navigate = useNavigate();
  const [isRestarting, setIsRestarting] = React.useState(false);

  const handleRestart = async () => {
    if (onBeforeRestart) onBeforeRestart();
    setIsRestarting(true);

    try {
      // 1. Reset-Kommando an v06 Backend senden
      await fetch("/api/v06/onboarding/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      }).catch(() => {
        /* Fallback */
      });

      // 2. Lokalen Cache bereinigen
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("connect.v06.onboarding.cache");
        window.sessionStorage.removeItem("connect.onboarding.v2.stepIndex");
      }

      // 3. Navigiere zum Onboarding
      navigate({ to: "/onboarding" });
    } catch (err) {
      console.warn("Fehler beim Zurücksetzen des Onboardings:", err);
      navigate({ to: "/onboarding" });
    } finally {
      setIsRestarting(false);
    }
  };

  if (getFlag("designV2")) {
    return (
      <DesignButton
        type="button"
        variant="secondary"
        size="sm"
        loading={isRestarting}
        leftIcon={<RotateCcw className="size-3.5" />}
        onClick={handleRestart}
        className={className}
        title="Startet das Onboarding erneut mit deinen aktuellen Daten als Vorgabe"
      >
        Onboarding erneut starten
      </DesignButton>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={isRestarting}
      onClick={handleRestart}
      className={`gap-2 text-xs font-medium ${className || ""}`}
      title="Startet das Onboarding erneut mit deinen aktuellen Daten als Vorgabe"
    >
      <RotateCcw className={`size-3.5 ${isRestarting ? "animate-spin" : ""}`} />
      <span>{isRestarting ? "Wird gestartet…" : "Onboarding erneut starten"}</span>
    </Button>
  );
}

export default OnboardingRestartButton;
