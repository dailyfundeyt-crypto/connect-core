/**
 * Modales Dialogfenster für die T3-Nutzungsansicht (Lane A24).
 *
 * Kann von A39 (Benutzermenü / Sidebar) oder direkt per Tastenkürzel geöffnet werden.
 */
import React, { useEffect } from "react";
import { UsageT3View } from "./UsageT3View";

export interface UsageT3ModalProps {
  isOpen: boolean;
  onClose: () => void;
  mock?: boolean;
}

export function UsageT3Modal({ isOpen, onClose, mock }: UsageT3ModalProps) {
  // ESC-Taste schließt das Modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Modal Header mit Schließen-Kreuz */}
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground" id="usage-modal-title">
              Nutzung & Limits
            </span>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-400">
              T3
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            ✕
          </button>
        </div>

        {/* Modal Scroll-Body */}
        <div className="overflow-y-auto px-6 py-6">
          <UsageT3View mock={mock} />
        </div>
      </div>
    </div>
  );
}
