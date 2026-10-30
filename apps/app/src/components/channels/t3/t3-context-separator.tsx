/**
 * T3-Bridge — Kontext-Trenner (Lane A22).
 *
 * Implementiert die I5-Anforderung:
 * „Neues Kontextfenster · Zusammenfassung“ (aufklappbar, bearbeitbar).
 * Visualisiert den 100k-Token-Kontextwechsel mit Sub-Agent-Kompression.
 */

import { useState } from "react";
import type { ConnectChatContextSwitchItem } from "@/lib/t3";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Sparkles, Pencil, Check, X, Layers } from "lucide-react";

export type T3ContextSeparatorProps = {
  item: ConnectChatContextSwitchItem;
  onUpdateSummary?: (itemId: string, newSummary: string) => Promise<unknown> | void;
  className?: string;
  defaultExpanded?: boolean;
};

export function T3ContextSeparator({
  item,
  onUpdateSummary,
  className,
  defaultExpanded = false,
}: T3ContextSeparatorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isEditing, setIsEditing] = useState(false);
  const [summary, setSummary] = useState(item.summary);
  const [draftSummary, setDraftSummary] = useState(item.summary);
  const [isSaving, setIsSaving] = useState(false);
  const [editedManually, setEditedManually] = useState(false);

  const formattedTokens = item.tokensAtSwitch
    ? `${item.tokensAtSwitch.toLocaleString("de-DE")} Tokens`
    : "100.000 Tokens";

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftSummary(summary);
    setIsEditing(true);
    setIsExpanded(true);
  };

  const handleCancelEdit = () => {
    setDraftSummary(summary);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      if (onUpdateSummary) {
        await onUpdateSummary(item.id, draftSummary);
      }
      setSummary(draftSummary);
      setEditedManually(true);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={cn("my-6 w-full select-text", className)}
      role="separator"
      aria-label="Neues Kontextfenster"
    >
      {/* Horizontale Trennlinie mit zentrierter Schaltfläche */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-dashed border-border" />
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="relative inline-flex items-center gap-2 rounded-full border border-border/80 bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground"
          aria-expanded={isExpanded}
        >
          <Sparkles className="size-3.5 text-amber-500" />
          <span>Neues Kontextfenster · Zusammenfassung</span>
          <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground font-mono">
            {formattedTokens}
          </span>
          {isExpanded ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Aufklappbarer Bereich mit Zusammenfassung */}
      {isExpanded ? (
        <div className="mt-3 mx-auto max-w-2xl rounded-xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between pb-2 border-b border-border/40 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Layers className="size-3.5 text-primary" />
              <span>Komprimierter Kontext (I5)</span>
              {editedManually ? (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                  (manuell angepasst)
                </span>
              ) : null}
            </div>

            {!isEditing ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleStartEdit}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-3" />
                Bearbeiten
              </Button>
            ) : null}
          </div>

          {/* Anzeige- oder Bearbeitungsmodus */}
          {!isEditing ? (
            <div className="mt-2.5 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap font-sans">
              {summary || (
                <span className="italic text-muted-foreground">
                  Keine Zusammenfassung hinterlegt.
                </span>
              )}
            </div>
          ) : (
            <div className="mt-2.5 space-y-2">
              <Textarea
                value={draftSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
                rows={4}
                className="text-xs font-sans leading-relaxed"
                placeholder="Zusammenfassung des vorherigen Kontextfensters anpassen…"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="gap-1 text-xs"
                >
                  <X className="size-3" />
                  Abbrechen
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="gap-1 text-xs"
                >
                  <Check className="size-3" />
                  {isSaving ? "Speichert…" : "Speichern"}
                </Button>
              </div>
            </div>
          )}

          {/* Metadaten Fußzeile */}
          <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
            <span>Stand: {formattedTokens} komprimiert</span>
            {item.createdAt ? (
              <span>
                {new Date(item.createdAt).toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
