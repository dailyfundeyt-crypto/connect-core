import * as React from "react";
import { Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface StepItem {
  id: string;
  title: string;
  description: string;
}

interface OnboardingStepperProps {
  steps: StepItem[];
  currentStepIndex: number;
  completedStepIndices: number[];
  onSelectStep?: (index: number) => void;
  onSkip?: () => void;
  canSkip?: boolean;
}

export function OnboardingStepper({
  steps,
  currentStepIndex,
  completedStepIndices,
  onSelectStep,
  onSkip,
  canSkip = true,
}: OnboardingStepperProps) {
  const progressPercent = Math.round(
    ((currentStepIndex + 1) / steps.length) * 100,
  );

  return (
    <div className="w-full max-w-2xl mx-auto mb-8 px-2 select-none">
      {/* Top Header with step counter and optional skip */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <span className="font-medium tracking-wide uppercase">
          Schritt {currentStepIndex + 1} von {steps.length}:{" "}
          <strong className="text-foreground">
            {steps[currentStepIndex]?.title}
          </strong>
        </span>
        {canSkip && onSkip && currentStepIndex < steps.length - 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
          >
            Überspringen
            <ChevronRight className="size-3.5 ml-1" />
          </Button>
        )}
      </div>

      {/* Animated Progress Bar */}
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden relative mb-6">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Stepper Pills (Desktop + Tablet) */}
      <div className="hidden sm:grid grid-cols-6 gap-2">
        {steps.map((step, idx) => {
          const isCurrent = idx === currentStepIndex;
          const isCompleted = completedStepIndices.includes(idx);
          const isClickable = isCompleted || idx < currentStepIndex;

          return (
            <button
              key={step.id}
              type="button"
              disabled={!isClickable && !isCurrent}
              onClick={() => isClickable && onSelectStep?.(idx)}
              className={`flex flex-col items-center gap-1.5 p-1.5 rounded-lg text-center transition ${
                isCurrent
                  ? "bg-accent/80 text-foreground font-semibold shadow-xs"
                  : isCompleted
                    ? "text-muted-foreground hover:text-foreground cursor-pointer"
                    : "text-muted-foreground/40 cursor-default"
              }`}
            >
              <div
                className={`size-6 rounded-full flex items-center justify-center text-xs font-medium transition ${
                  isCurrent
                    ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/30"
                    : isCompleted
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground/60"
                }`}
              >
                {isCompleted ? <Check className="size-3.5 stroke-[2.5]" /> : idx + 1}
              </div>
              <span className="text-[11px] leading-tight line-clamp-1">
                {step.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
