/**
 * Guided Tour Viewer Component (Lane 3)
 *
 * Provides a dedicated, accessible interface for didactic learning tours:
 * - Step-by-step sequential navigation through a cluster
 * - Progress indicator & didactic guidance per concept
 * - Direct deep-link to source notes in the Brain reader
 * - Tour selection gallery with estimated duration & step count
 */

import React, { useState } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCompass,
  IconExternalLink,
  IconListDetails,
  IconPlayerPlay,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export interface TourStepItem {
  stepIdx: number;
  conceptId?: string;
  notePath: string;
  heading?: string;
  description: string;
}

export interface TourItem {
  id: string;
  title: string;
  clusterId?: string;
  description?: string;
  steps: TourStepItem[];
  createdAt?: string;
}

export interface TourViewProps {
  tours: TourItem[];
  activeTourId?: string | null;
  currentStepIdx?: number;
  onSelectTour?: (tour: TourItem) => void;
  onStepChange?: (stepIdx: number) => void;
  onCloseTour?: () => void;
  onOpenNote?: (notePath: string) => void;
  className?: string;
}

export function TourView({
  tours,
  activeTourId,
  currentStepIdx = 0,
  onSelectTour,
  onStepChange,
  onCloseTour,
  onOpenNote,
  className,
}: TourViewProps) {
  const [selectedTourId, setSelectedTourId] = useState<string | null>(
    activeTourId || (tours.length > 0 ? tours[0].id : null),
  );

  const activeTour = tours.find((t) => t.id === (activeTourId || selectedTourId));
  const currentStep: TourStepItem | undefined = activeTour?.steps[currentStepIdx];
  const totalSteps = activeTour?.steps.length ?? 0;
  const progressPercent = totalSteps > 0 ? Math.round(((currentStepIdx + 1) / totalSteps) * 100) : 0;

  const handleNext = () => {
    if (activeTour && currentStepIdx < totalSteps - 1) {
      onStepChange?.(currentStepIdx + 1);
    }
  };

  const handlePrev = () => {
    if (activeTour && currentStepIdx > 0) {
      onStepChange?.(currentStepIdx - 1);
    }
  };

  if (!activeTour) {
    return (
      <div className={cn("p-6 text-center text-sm text-muted-foreground", className)}>
        <IconCompass className="mx-auto mb-3 h-8 w-8 opacity-40 text-primary" />
        <p className="font-medium text-foreground">Keine geführten Lernpfade vorhanden</p>
        <p className="mt-1 text-xs">Führe eine Wissensgraph-Extraktion durch, um Touren zu erzeugen.</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col bg-card/95 backdrop-blur border border-border rounded-xl shadow-xl overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <IconCompass className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate text-foreground">{activeTour.title}</h3>
            <p className="text-[11px] text-muted-foreground truncate">
              Station {currentStepIdx + 1} von {totalSteps} ({progressPercent}%)
            </p>
          </div>
        </div>

        {onCloseTour && (
          <button
            type="button"
            onClick={onCloseTour}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            title="Tour beenden"
          >
            <IconX className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted h-1 overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Active Step Content */}
      {currentStep ? (
        <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[360px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                Schritt {currentStep.stepIdx + 1}
              </span>
              {currentStep.heading && (
                <h4 className="mt-1 text-base font-semibold text-foreground">
                  {currentStep.heading}
                </h4>
              )}
            </div>
            {onOpenNote && (
              <button
                type="button"
                onClick={() => onOpenNote(currentStep.notePath)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors shrink-0"
              >
                <span>Notiz öffnen</span>
                <IconExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="text-xs leading-relaxed text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/50">
            {currentStep.description}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
            <span className="font-medium text-foreground/80">Quelle:</span>
            <span className="truncate">{currentStep.notePath}</span>
          </div>

          {/* Step Timeline dots */}
          <div className="pt-2 flex items-center justify-center gap-1.5">
            {activeTour.steps.map((st, i) => (
              <button
                key={st.stepIdx}
                type="button"
                onClick={() => onStepChange?.(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-200",
                  i === currentStepIdx
                    ? "w-6 bg-primary"
                    : i < currentStepIdx
                      ? "w-2 bg-primary/40 hover:bg-primary/60"
                      : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                )}
                title={`Schritt ${i + 1}: ${st.heading || st.notePath}`}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Keine weiteren Schritte in dieser Tour.
        </div>
      )}

      {/* Footer Navigation Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentStepIdx === 0}
          className={cn(
            "inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            currentStepIdx === 0
              ? "text-muted-foreground/40 cursor-not-allowed"
              : "text-foreground hover:bg-muted",
          )}
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          <span>Zurück</span>
        </button>

        <span className="text-[11px] text-muted-foreground">
          {currentStepIdx + 1} / {totalSteps}
        </span>

        {currentStepIdx < totalSteps - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <span>Weiter</span>
            <IconArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onCloseTour}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-sm"
          >
            <IconCheck className="h-3.5 w-3.5" />
            <span>Abschließen</span>
          </button>
        )}
      </div>

      {/* Tour Selector List (if multiple tours) */}
      {tours.length > 1 && (
        <div className="px-4 py-2 border-t border-border/50 bg-muted/10">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
            <span className="flex items-center gap-1 font-medium">
              <IconListDetails className="h-3 w-3" />
              Verfügbare Lernpfade
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {tours.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSelectedTourId(t.id);
                  onSelectTour?.(t);
                  onStepChange?.(0);
                }}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-colors border",
                  t.id === activeTour.id
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                )}
              >
                {t.title.replace(/^Lernpfad:\s*/, "")} ({t.steps.length})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TourView;
