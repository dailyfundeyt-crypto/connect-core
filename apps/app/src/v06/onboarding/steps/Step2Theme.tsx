/**
 * Schritt 2: Darstellung / ThemeChoiceStep (A25 / Wave 3)
 * Bindet die fertige A03-Komponente ThemeChoiceStep ein.
 */

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeChoiceStep } from "@/v06/theme/ThemeChoiceStep";
import { getFlag } from "@/contracts/v06/flags";
import { Button as DesignButton } from "@/v06/design";
import "@/v06/design/tokens.css";
import type { ThemePreference } from "@/contracts/v06/theme";
import type { OnboardingData } from "../types";

export interface Step2ThemeProps {
  data: OnboardingData;
  onUpdateData: (patch: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
  isSaving?: boolean;
}

export function Step2Theme({
  data,
  onUpdateData,
  onContinue,
  onBack,
  isSaving = false,
}: Step2ThemeProps) {
  const currentTheme = (data.themePreference as ThemePreference) || "dark";

  const handleThemeChange = (selected: ThemePreference) => {
    onUpdateData({ themePreference: selected });
  };

  return (
    <div className="w-full flex flex-col items-center justify-center max-w-2xl mx-auto py-2">
      {/* Theme Choice Step Component von Agent A03 */}
      <ThemeChoiceStep
        value={currentTheme}
        onChange={handleThemeChange}
        showContinueButton={false}
        className="p-0 max-w-full"
      />

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between w-full max-w-md gap-3">
        {getFlag("designV2") ? (
          <>
            <DesignButton
              type="button"
              variant="secondary"
              onClick={onBack}
              disabled={isSaving}
              leftIcon={<ArrowLeft className="size-4" />}
              className="w-1/3"
            >
              Zurück
            </DesignButton>
            <DesignButton
              type="button"
              variant="primary"
              onClick={onContinue}
              loading={isSaving}
              rightIcon={<ArrowRight className="size-4" />}
              className="w-2/3"
            >
              Firma wählen
            </DesignButton>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSaving}
              className="w-1/3 gap-1.5"
            >
              <ArrowLeft className="size-4" />
              Zurück
            </Button>
            <Button
              type="button"
              onClick={onContinue}
              disabled={isSaving}
              className="w-2/3 gap-2 shadow-sm font-medium"
            >
              Firma wählen
              <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
