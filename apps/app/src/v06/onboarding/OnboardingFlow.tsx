/**
 * OnboardingFlow v06 (A25 / Wave 3)
 * Hauptkomponente für den 7-stufigen Onboarding-Ablauf.
 */

import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFlag } from "@/contracts/v06/flags";
import "@/v06/design/tokens.css";
import {
  Button as DesignButton,
  ParticlesBackground,
} from "@/v06/design";
import { ONBOARDING_STEPS_V06 } from "./types";
import { useOnboarding } from "./useOnboarding";
import { Step1Welcome } from "./steps/Step1Welcome";
import { Step2Theme } from "./steps/Step2Theme";
import { Step3Company } from "./steps/Step3Company";
import { Step4Tools } from "./steps/Step4Tools";
import { Step5Bot } from "./steps/Step5Bot";
import { Step6PhoneConnect } from "./steps/Step6PhoneConnect";
import { Step7Complete } from "./steps/Step7Complete";

export interface OnboardingFlowProps {
  onFinished?: () => void;
  className?: string;
}

export function OnboardingFlow({ onFinished, className }: OnboardingFlowProps) {
  const navigate = useNavigate();
  const {
    state,
    isLoading,
    isSaving,
    currentStepIndex,
    currentStep,
    canSkip,
    goToStep,
    nextStep,
    prevStep,
    skipStep,
    updateData,
    completeOnboarding,
  } = useOnboarding();

  const [direction, setDirection] = React.useState<number>(1);
  const [isExiting, setIsExiting] = React.useState<boolean>(false);

  // Schritt-Wechsel mit Richtungs-Animation
  const handleGoTo = (targetIdx: number) => {
    setDirection(targetIdx > currentStepIndex ? 1 : -1);
    goToStep(targetIdx);
  };

  const handleNext = async () => {
    setDirection(1);
    await nextStep();
  };

  const handlePrev = () => {
    setDirection(-1);
    prevStep();
  };

  const handleSkip = async () => {
    setDirection(1);
    await skipStep();
  };

  const handleFinish = async () => {
    await completeOnboarding();
    setIsExiting(true);
    if (onFinished) {
      onFinished();
    } else {
      // Wenn ein Bot angelegt wurde, navigieren wir direkt mit Bot-Fokus
      navigate({ to: "/" });
    }
  };

  const progressPercent = Math.round(
    ((currentStepIndex + 1) / ONBOARDING_STEPS_V06.length) * 100,
  );
  const isDesignV2 = getFlag("designV2");

  return (
    <div
      className={`min-h-screen relative flex flex-col items-center justify-center w-full py-8 px-4 sm:px-6 transition-opacity duration-300 ${
        isDesignV2
          ? "bg-[var(--p-bg)] text-[var(--p-text-1)] overflow-hidden"
          : "text-foreground"
      } ${
        isExiting ? "opacity-0 pointer-events-none" : "opacity-100"
      } ${className || ""}`}
    >
      {/* Grok-Bot Ambient Canvas Background bei designV2 */}
      {isDesignV2 && (
        <div className="absolute inset-0 pointer-events-none z-0 opacity-60">
          <ParticlesBackground density={22} speed={0.25} interactive />
        </div>
      )}

      <div className="w-full max-w-2xl mx-auto relative z-10">
        {/* Progress Header */}
        <div className="w-full mb-8 px-2 select-none">
          <div className="flex items-center justify-between text-xs mb-3">
            <span
              className={`font-medium tracking-wide uppercase ${
                isDesignV2
                  ? "text-[var(--p-text-3)] text-[11px]"
                  : "text-muted-foreground"
              }`}
            >
              Schritt {currentStepIndex + 1} von {ONBOARDING_STEPS_V06.length}:{" "}
              <strong
                className={
                  isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
                }
              >
                {currentStep.title}
              </strong>
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold ${
                  isDesignV2
                    ? "text-[var(--p-accent)]"
                    : "text-primary"
                }`}
              >
                {progressPercent}%
              </span>
              {canSkip && (
                isDesignV2 ? (
                  <DesignButton
                    variant="ghost"
                    size="sm"
                    onClick={handleSkip}
                    rightIcon={<ChevronRight className="size-3.5" />}
                  >
                    Überspringen
                  </DesignButton>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSkip}
                    className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    Überspringen
                    <ChevronRight className="size-3.5 ml-1" />
                  </Button>
                )
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div
            className={`w-full h-1.5 rounded-full overflow-hidden relative mb-6 ${
              isDesignV2 ? "bg-[var(--p-surface-2)]" : "bg-muted"
            }`}
          >
            <div
              className={`h-full transition-all duration-300 ease-out rounded-full ${
                isDesignV2 ? "bg-[var(--p-accent)] shadow-xs" : "bg-primary"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Stepper Pills */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {ONBOARDING_STEPS_V06.map((s, idx) => {
              const isCurrent = idx === currentStepIndex;
              const isCompleted = state.completedSteps.includes(s.id);
              const isClickable = isCompleted || idx < currentStepIndex;

              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!isClickable && !isCurrent}
                  onClick={() => isClickable && handleGoTo(idx)}
                  className={`flex flex-col items-center gap-1 p-1 rounded-lg text-center transition ${
                    isDesignV2
                      ? isCurrent
                        ? "bg-[var(--p-surface-2)] text-[var(--p-text-1)] font-semibold shadow-xs border border-[var(--p-border-strong)]"
                        : isCompleted
                          ? "text-[var(--p-text-2)] hover:text-[var(--p-text-1)] cursor-pointer"
                          : "text-[var(--p-text-3)]/60 cursor-default"
                      : isCurrent
                        ? "bg-accent/80 text-foreground font-semibold shadow-xs"
                        : isCompleted
                          ? "text-muted-foreground hover:text-foreground cursor-pointer"
                          : "text-muted-foreground/40 cursor-default"
                  }`}
                >
                  <div
                    className={`size-6 rounded-full flex items-center justify-center text-xs font-medium transition ${
                      isDesignV2
                        ? isCurrent
                          ? "bg-[var(--p-accent)] text-[var(--p-text-on-accent)] shadow-xs ring-2 ring-[var(--p-accent)]/30 font-bold"
                          : isCompleted
                            ? "bg-[var(--p-accent)]/20 text-[var(--p-accent)] border border-[var(--p-accent)]/30"
                            : "bg-[var(--p-surface-3)] text-[var(--p-text-3)] border border-[var(--p-border)]"
                        : isCurrent
                          ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/30"
                          : isCompleted
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground/60"
                    }`}
                  >
                    {isCompleted ? <Check className="size-3.5 stroke-[2.5]" /> : idx + 1}
                  </div>
                  <span className="text-[10px] leading-tight line-clamp-1 hidden sm:block">
                    {s.shortTitle}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Step Content */}
        <div
          className={`relative overflow-hidden w-full ${
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-1)]/90 backdrop-blur-md p-6 sm:p-8 shadow-2xl"
              : ""
          }`}
        >
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={currentStepIndex}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="w-full"
            >
              {currentStepIndex === 0 && (
                <Step1Welcome
                  data={state.data}
                  onUpdateData={updateData}
                  onContinue={handleNext}
                  isSaving={isSaving}
                />
              )}

              {currentStepIndex === 1 && (
                <Step2Theme
                  data={state.data}
                  onUpdateData={updateData}
                  onContinue={handleNext}
                  onBack={handlePrev}
                  isSaving={isSaving}
                />
              )}

              {currentStepIndex === 2 && (
                <Step3Company
                  data={state.data}
                  onUpdateData={updateData}
                  onContinue={handleNext}
                  onBack={handlePrev}
                  isSaving={isSaving}
                />
              )}

              {currentStepIndex === 3 && (
                <Step4Tools
                  data={state.data}
                  onUpdateData={updateData}
                  onContinue={handleNext}
                  onBack={handlePrev}
                  isSaving={isSaving}
                />
              )}

              {currentStepIndex === 4 && (
                <Step5Bot
                  data={state.data}
                  onUpdateData={updateData}
                  onContinue={handleNext}
                  onBack={handlePrev}
                  isSaving={isSaving}
                />
              )}

              {currentStepIndex === 5 && (
                <Step6PhoneConnect
                  data={state.data}
                  onUpdateData={updateData}
                  onContinue={handleNext}
                  onBack={handlePrev}
                  onSkip={handleSkip}
                  isSaving={isSaving}
                />
              )}

              {currentStepIndex === 6 && (
                <Step7Complete
                  data={state.data}
                  onComplete={handleFinish}
                  onBack={handlePrev}
                  isSaving={isSaving}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default OnboardingFlow;
