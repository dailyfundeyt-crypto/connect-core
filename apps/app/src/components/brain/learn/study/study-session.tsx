/**
 * Interactive Active Recall & Spaced Repetition (FSRS) Study Session (Lane 4)
 *
 * Supports:
 * - QA, Cloze deletion, Multiple Choice quiz cards
 * - Clickable source citations with note inspection
 * - Dynamic FSRS interval preview badges (1: Nochmal, 2: Schwer, 3: Gut, 4: Einfach)
 * - Keyboard shortcuts (Space = reveal, 1-4 = rate)
 * - Session completion summary
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import type { Citation, StudyQueueItem, StudyRating } from "./types";

interface StudySessionProps {
  queue: StudyQueueItem[];
  onFinish: () => void;
  onOpenNote?: (notePath: string, line?: number) => void;
}

export function StudySession({ queue, onFinish, onOpenNote }: StudySessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [inspectCitation, setInspectCitation] = useState<Citation | null>(null);
  const [reviewedCards, setReviewedCards] = useState<
    Array<{ cardId: string; rating: StudyRating; card: StudyQueueItem }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentCard = queue[currentIndex];
  const isFinished = currentIndex >= queue.length;

  // Reset card state when index changes
  useEffect(() => {
    setIsRevealed(false);
    setSelectedOption(null);
    setStartTime(Date.now());
  }, [currentIndex]);

  const handleReveal = useCallback(() => {
    setIsRevealed(true);
  }, []);

  const handleRate = useCallback(
    async (rating: StudyRating) => {
      if (!currentCard || isSubmitting) return;
      setIsSubmitting(true);
      const elapsedMs = Date.now() - startTime;

      try {
        await fetch("/api/brain/learn/study/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardId: currentCard.id,
            rating,
            elapsedMs,
          }),
        });
      } catch (err) {
        console.warn("[StudySession] Review submission error:", err);
      }

      setReviewedCards((prev) => [...prev, { cardId: currentCard.id, rating, card: currentCard }]);
      setIsSubmitting(false);
      setCurrentIndex((prev) => prev + 1);
    },
    [currentCard, isSubmitting, startTime],
  );

  // Keyboard shortcut listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isFinished) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (!isRevealed) {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          handleReveal();
        }
      } else {
        if (e.key === "1") {
          e.preventDefault();
          handleRate(1);
        } else if (e.key === "2") {
          e.preventDefault();
          handleRate(2);
        } else if (e.key === "3") {
          e.preventDefault();
          handleRate(3);
        } else if (e.key === "4") {
          e.preventDefault();
          handleRate(4);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRevealed, isFinished, handleReveal, handleRate]);

  // Handle Multiple Choice Option Selection
  const handleSelectOption = (index: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(index);
    setIsRevealed(true);
  };

  /* ======================================================================== */
  /* Completed Session View                                                   */
  /* ======================================================================== */

  if (isFinished || queue.length === 0) {
    const total = reviewedCards.length;
    const goodOrEasy = reviewedCards.filter((r) => r.rating >= 3).length;
    const percentage = total > 0 ? Math.round((goodOrEasy / total) * 100) : 100;

    return (
      <div className="flex flex-col items-center justify-center p-8 max-w-xl mx-auto text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          <Trophy className="w-8 h-8" />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-foreground">Lern-Session abgeschlossen!</h2>
          <p className="text-muted-foreground mt-1">
            Du hast alle {total} fälligen Lernkarten für diese Runde wiederholt.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
          <div className="bg-muted/40 rounded-xl p-3 border border-border/40 text-center">
            <span className="text-2xl font-extrabold text-foreground">{total}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">Wiederholt</span>
          </div>
          <div className="bg-muted/40 rounded-xl p-3 border border-border/40 text-center">
            <span className="text-2xl font-extrabold text-emerald-400">{goodOrEasy}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">Erfolgreich</span>
          </div>
          <div className="bg-muted/40 rounded-xl p-3 border border-border/40 text-center">
            <span className="text-2xl font-extrabold text-cyan-400">{percentage}%</span>
            <span className="block text-xs text-muted-foreground mt-0.5">Genauigkeit</span>
          </div>
        </div>

        <button
          onClick={onFinish}
          className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  /* ======================================================================== */
  /* Active Card View                                                         */
  /* ======================================================================== */

  const progressPercent = Math.round(((currentIndex + 1) / queue.length) * 100);

  // Format Cloze text: {{c1::term}} -> blank or highlighted
  const renderClozeText = (text: string) => {
    const parts = text.split(/(\{\{c\d+::[^{}]+\}\})/g);
    return parts.map((part, i) => {
      const match = part.match(/\{\{c\d+::([^{}]+)\}\}/);
      if (!match) return <span key={i}>{part}</span>;
      const hiddenTerm = match[1];

      if (!isRevealed) {
        return (
          <span
            key={i}
            className="inline-block px-2.5 py-0.5 mx-1 rounded bg-amber-500/15 border border-amber-500/30 font-semibold text-amber-300 animate-pulse"
          >
            [ ... ]
          </span>
        );
      }
      return (
        <span
          key={i}
          className="inline-block px-2 py-0.5 mx-1 rounded bg-emerald-500/20 border border-emerald-500/40 font-bold text-emerald-300"
        >
          {hiddenTerm}
        </span>
      );
    });
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full p-4 md:p-6 space-y-4">
      {/* Session Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onFinish}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Session beenden"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lern-Session
            </span>
            <h3 className="text-sm font-medium text-foreground">
              Karte {currentIndex + 1} von {queue.length}
            </h3>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-32 md:w-48 flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground font-mono">{progressPercent}%</span>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Flashcard Container */}
      <div className="flex-1 flex flex-col bg-card border border-border/50 rounded-2xl p-6 md:p-8 shadow-sm justify-between min-h-[420px]">
        {/* Card Metadata & Clickable Citation Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-4">
          <div className="flex items-center gap-2">
            {/* Type badge */}
            <span
              className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                currentCard.cardType === "qa"
                  ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                  : currentCard.cardType === "cloze"
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              }`}
            >
              {currentCard.cardType === "qa"
                ? "Frage & Antwort"
                : currentCard.cardType === "cloze"
                ? "Lückentext"
                : "Multiple Choice"}
            </span>

            {/* State badge */}
            <span className="px-2 py-0.5 text-[11px] rounded bg-muted/60 text-muted-foreground capitalize">
              {currentCard.state === "new"
                ? "Neu"
                : currentCard.state === "learning"
                ? "Lernen"
                : currentCard.state === "review"
                ? "Wiederholen"
                : "Auffrischen"}
            </span>
          </div>

          {/* Clickable Source Citation */}
          {currentCard.source && (
            <button
              onClick={() => setInspectCitation(currentCard.source)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors bg-muted/40 hover:bg-muted/80 px-2.5 py-1 rounded-md border border-border/40"
              title="Klick zum Anzeigen der Notizquelle im Brain"
            >
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span className="max-w-[200px] truncate">{currentCard.source.notePath}</span>
              {currentCard.source.lineStart && (
                <span className="text-[10px] opacity-75">Z. {currentCard.source.lineStart}</span>
              )}
              <ExternalLink className="w-3 h-3 opacity-60" />
            </button>
          )}
        </div>

        {/* Card Body */}
        <div className="my-auto py-6 space-y-6">
          {/* Front / Question */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {currentCard.cardType === "qa" ? "Frage" : currentCard.cardType === "cloze" ? "Lückentext" : "Aufgabe"}
            </span>
            <div className="text-lg md:text-xl font-medium text-foreground leading-relaxed">
              {currentCard.cardType === "cloze"
                ? renderClozeText(currentCard.front)
                : currentCard.front}
            </div>
          </div>

          {/* Multiple Choice Options if cardType === 'mc' */}
          {currentCard.cardType === "mc" && currentCard.options && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2">
              {currentCard.options.map((opt, i) => {
                const isSelected = selectedOption === i;
                const isCorrect = isRevealed && currentCard.back.toLowerCase().includes(opt.slice(0, 5).toLowerCase());

                let optClass = "border-border/60 bg-muted/20 hover:bg-muted/50 text-foreground";
                if (isRevealed) {
                  if (isCorrect) {
                    optClass = "border-emerald-500 bg-emerald-500/10 text-emerald-300 font-medium";
                  } else if (isSelected) {
                    optClass = "border-red-500 bg-red-500/10 text-red-300";
                  } else {
                    optClass = "border-border/40 opacity-60";
                  }
                }

                return (
                  <button
                    key={i}
                    onClick={() => handleSelectOption(i)}
                    disabled={isRevealed}
                    className={`text-left p-3.5 rounded-xl border text-sm transition-all duration-150 flex items-start gap-2.5 ${optClass}`}
                  >
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono bg-muted/60 shrink-0">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1">{opt.replace(/^[A-D]\)\s*/, "")}</span>
                    {isRevealed && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Back / Answer (Revealed) */}
          {isRevealed && (
            <div className="border-t border-border/40 pt-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Antwort / Erklärung
              </span>
              <div className="text-base md:text-lg text-foreground/95 bg-muted/30 p-4 rounded-xl border border-border/40 leading-relaxed whitespace-pre-wrap">
                {currentCard.back}
              </div>
            </div>
          )}
        </div>

        {/* Footer Rating Action Bar */}
        <div className="border-t border-border/30 pt-4">
          {!isRevealed ? (
            <button
              onClick={handleReveal}
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-sm cursor-pointer"
            >
              <span>Antwort aufdecken</span>
              <span className="text-xs px-2 py-0.5 rounded bg-primary-foreground/20 font-mono">Leertaste</span>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>Wie gut wusstest du die Antwort?</span>
                <span className="font-mono">Tasten: 1, 2, 3, 4</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {/* 1: Again */}
                <button
                  onClick={() => handleRate(1)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-medium transition-all group"
                >
                  <span className="text-sm font-bold">1 - Nochmal</span>
                  <span className="text-[11px] opacity-75 group-hover:opacity-100 font-mono">
                    {currentCard.intervals?.[1]?.intervalHuman || "5m"}
                  </span>
                </button>

                {/* 2: Hard */}
                <button
                  onClick={() => handleRate(2)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium transition-all group"
                >
                  <span className="text-sm font-bold">2 - Schwer</span>
                  <span className="text-[11px] opacity-75 group-hover:opacity-100 font-mono">
                    {currentCard.intervals?.[2]?.intervalHuman || "1 Tag"}
                  </span>
                </button>

                {/* 3: Good */}
                <button
                  onClick={() => handleRate(3)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-medium transition-all group"
                >
                  <span className="text-sm font-bold">3 - Gut</span>
                  <span className="text-[11px] opacity-75 group-hover:opacity-100 font-mono">
                    {currentCard.intervals?.[3]?.intervalHuman || "4 Tage"}
                  </span>
                </button>

                {/* 4: Easy */}
                <button
                  onClick={() => handleRate(4)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-medium transition-all group"
                >
                  <span className="text-sm font-bold">4 - Einfach</span>
                  <span className="text-[11px] opacity-75 group-hover:opacity-100 font-mono">
                    {currentCard.intervals?.[4]?.intervalHuman || "12 Tage"}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Citation Inspector Modal */}
      {inspectCitation && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <FileText className="w-5 h-5 text-primary" />
                <span>Quellen-Referenz</span>
              </div>
              <button
                onClick={() => setInspectCitation(null)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block">Notiz-Pfad im Spark Vault:</span>
                <span className="font-mono text-foreground font-medium">{inspectCitation.notePath}</span>
              </div>
              {inspectCitation.heading && (
                <div>
                  <span className="text-xs text-muted-foreground block">Abschnitt / Überschrift:</span>
                  <span className="text-foreground">{inspectCitation.heading}</span>
                </div>
              )}
              {inspectCitation.lineStart && (
                <div>
                  <span className="text-xs text-muted-foreground block">Zeilenbereich:</span>
                  <span className="font-mono text-foreground">
                    Zeile {inspectCitation.lineStart}
                    {inspectCitation.lineEnd ? ` bis ${inspectCitation.lineEnd}` : ""}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              {onOpenNote && (
                <button
                  onClick={() => {
                    onOpenNote(inspectCitation.notePath, inspectCitation.lineStart);
                    setInspectCitation(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  In Connect Notizleser öffnen
                </button>
              )}
              <button
                onClick={() => setInspectCitation(null)}
                className="px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-sm"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StudySession;
