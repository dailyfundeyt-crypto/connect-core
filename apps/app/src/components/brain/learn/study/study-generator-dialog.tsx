/**
 * Flashcard Generator Modal Dialog (Lane 4)
 *
 * Allows generating QA, Cloze, and MC cards from notes, folders, or custom text
 * using the backend CliRunner. Includes preview and edit before saving.
 */

import React, { useState } from "react";
import { Check, Edit2, FileText, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { StudyCard, StudyCardType } from "./types";

interface StudyGeneratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFolder?: string;
  onCardsCreated?: (cards: StudyCard[]) => void;
}

export function StudyGeneratorDialog({
  isOpen,
  onClose,
  defaultFolder = "",
  onCardsCreated,
}: StudyGeneratorDialogProps) {
  const [notePath, setNotePath] = useState(defaultFolder ? `${defaultFolder}/Notiz.md` : "");
  const [customText, setCustomText] = useState("");
  const [count, setCount] = useState(3);
  const [cardTypes, setCardTypes] = useState<StudyCardType[]>(["qa", "cloze", "mc"]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<StudyCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleType = (t: StudyCardType) => {
    if (cardTypes.includes(t)) {
      if (cardTypes.length > 1) {
        setCardTypes(cardTypes.filter((type) => type !== t));
      }
    } else {
      setCardTypes([...cardTypes, t]);
    }
  };

  const handleGenerate = async () => {
    if (!notePath.trim() && !customText.trim()) {
      setError("Bitte gib einen Notizpfad oder Text ein.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/brain/learn/study/cards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notePath: notePath.trim() || undefined,
          text: customText.trim() || undefined,
          count,
          types: cardTypes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Kartengenerierung fehlgeschlagen.");
      }

      setGeneratedCards(data.generatedCards || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveDraft = (idx: number) => {
    setGeneratedCards((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveAll = () => {
    if (onCardsCreated && generatedCards.length > 0) {
      onCardsCreated(generatedCards);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">KI-Lernkarten generieren</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}

          {generatedCards.length === 0 ? (
            <div className="space-y-4">
              {/* Note Path */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Notiz-Pfad im Obsidian-Vault
                </label>
                <input
                  type="text"
                  value={notePath}
                  onChange={(e) => setNotePath(e.target.value)}
                  placeholder="z. B. Architektur/Spark-Learn.md"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border/60 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {/* Or Direct Text */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Oder Textauszug direkt einfügen (optional)
                </label>
                <textarea
                  rows={4}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Inhalt oder Notizabschnitt hier einfügen..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-muted/40 border border-border/60 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
                />
              </div>

              {/* Card Types Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Kartentypen auswählen
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleType("qa")}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      cardTypes.includes("qa")
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground bg-muted/20"
                    }`}
                  >
                    <span>Frage & Antwort</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleType("cloze")}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      cardTypes.includes("cloze")
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground bg-muted/20"
                    }`}
                  >
                    <span>Lückentext (Cloze)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleType("mc")}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      cardTypes.includes("mc")
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground bg-muted/20"
                    }`}
                  >
                    <span>Multiple Choice</span>
                  </button>
                </div>
              </div>

              {/* Count Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Anzahl Karten: {count}
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>
          ) : (
            /* Preview Generated Cards */
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{generatedCards.length} Karten erfolgreich generiert</span>
                <span>Überprüfe und passe die Karten vor dem Speichern an</span>
              </div>

              <div className="space-y-3">
                {generatedCards.map((card, i) => (
                  <div key={card.id || i} className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-2 relative group">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold uppercase tracking-wider text-primary">
                        {card.cardType === "qa" ? "Q&A" : card.cardType === "cloze" ? "Lückentext" : "Multiple Choice"}
                      </span>
                      <button
                        onClick={() => handleRemoveDraft(i)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive opacity-70 hover:opacity-100"
                        title="Karte verwerfen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-sm font-medium text-foreground">{card.front}</div>
                    <div className="text-xs text-muted-foreground bg-card p-2 rounded-lg border border-border/40">
                      <span className="font-semibold text-foreground/80 block mb-0.5">Lösung:</span>
                      {card.back}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center pt-3 border-t border-border/40">
          {generatedCards.length > 0 ? (
            <>
              <button
                onClick={() => setGeneratedCards([])}
                className="px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-sm font-medium"
              >
                Zurück zur Eingabe
              </button>
              <button
                onClick={handleSaveAll}
                className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{generatedCards.length} Karten ins Deck übernehmen</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground text-sm font-medium"
              >
                Abbrechen
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>CliRunner analysiert...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Lernkarten generieren</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudyGeneratorDialog;
