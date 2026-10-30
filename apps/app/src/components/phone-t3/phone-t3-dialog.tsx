/**
 * Handy-Kopplung — Dialog für das Benutzer-Menü (Lane A34).
 *
 * Der Menüpunkt „Handy verbinden“ gehört A39 (`user-avatar.tsx`). Diese
 * Komponente ist der fertige Inhalt: öffnen, schließen, fertig.
 */

import { useEffect } from "react";
import { PhoneT3Panel } from "./phone-t3-panel";

export type PhoneT3DialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Nur für Vorschau/Tests. */
  forceEnabled?: boolean;
};

export function PhoneT3Dialog({
  isOpen,
  onClose,
  forceEnabled,
}: PhoneT3DialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      aria-labelledby="phone-t3-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
    >
      <button
        aria-label="Schließen"
        className="fixed inset-0 cursor-default bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4">
          <span
            className="text-lg font-bold text-foreground"
            id="phone-t3-dialog-title"
          >
            Handy verbinden
          </span>
          <button
            aria-label="Schließen"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <PhoneT3Panel forceEnabled={forceEnabled} />
        </div>
      </div>
    </div>
  );
}
