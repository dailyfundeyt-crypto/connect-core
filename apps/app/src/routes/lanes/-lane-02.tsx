import React from "react";
import { IconBuilding, IconArrowLeft } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Lane 02 Frontend Route Component:
 * Focus-Modus, Grok-Bot, Firmenprofil & Firmenverwaltung Fallback
 */
export function Lane02Route() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center text-foreground">
      <div className="max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <IconBuilding className="size-6" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Firmenbereich & Verwaltung</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Dieser Bereich (Firmenprofil in Connect Sozial & Firmenverwaltung) wird geladen bzw. steht bereit.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => void navigate({ to: "/" })}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
            type="button"
          >
            <IconArrowLeft className="size-4" />
            Zurück zur Übersicht
          </button>
        </div>
      </div>
    </div>
  );
}

export default Lane02Route;
