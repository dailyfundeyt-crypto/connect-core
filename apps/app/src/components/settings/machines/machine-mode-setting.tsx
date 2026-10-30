/**
 * Einstellung „Maschinen-Modus“
 *
 * Lane: A26 (Maschinen-Einstellungen & Onboarding)
 * Auswahl:
 * - „Eine Maschine für alle Agenten“ (Standard: shared)
 * - „Eigene Maschine pro Agent“ (per_agent)
 *
 * AKZEPTANZKRITERIUM:
 * - Standard ist „Eine Maschine für alle Agenten“
 * - Umschalten zeigt Vorschau, nennt nie „löschen“
 * - Nach Bestätigung ruft es PUT /api/machines/mode auf
 */

import * as React from "react";
import { useState } from "react";
import { Users, Bot, ShieldCheck, AlertCircle, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { MachineMode } from "./types";
import { setMachineMode } from "./machines-api";

export interface MachineModeSettingProps {
  currentMode: MachineMode;
  agentCount?: number;
  onModeChanged?: (newMode: MachineMode) => void;
  mock?: boolean;
}

export function MachineModeSetting({
  currentMode = "shared",
  agentCount = 1,
  onModeChanged,
  mock = false,
}: MachineModeSettingProps) {
  const [selectedMode, setSelectedMode] = useState<MachineMode>(currentMode);
  const [pendingMode, setPendingMode] = useState<MachineMode | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync bei Prop-Änderung
  React.useEffect(() => {
    setSelectedMode(currentMode);
  }, [currentMode]);

  const handleModeSelect = (mode: MachineMode) => {
    if (mode === selectedMode) return;
    setPendingMode(mode);
    setIsConfirmOpen(true);
    setError(null);
  };

  const handleConfirmModeChange = async () => {
    if (!pendingMode) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await setMachineMode(pendingMode, { mock });
      setSelectedMode(pendingMode);
      onModeChanged?.(pendingMode);
      setIsConfirmOpen(false);
      setPendingMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Wechseln des Modus");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Maschinen-Modus
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Bestimmt, ob Agenten eine gemeinsame Sandbox teilen oder jeweils eine eigene isolierte Maschine erhalten.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Modus 1: Shared (Standard) */}
        <button
          type="button"
          onClick={() => handleModeSelect("shared")}
          className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
            selectedMode === "shared"
              ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
              : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  Eine Maschine für alle Agenten
                </span>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                Standard
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Alle Bots teilen sich eine geteilte lokale Cua-Sandbox. Spart Systemressourcen und hält den Speicherbedarf minimal.
            </p>
          </div>
          <div className="mt-3 flex items-center text-[11px] font-medium text-primary">
            {selectedMode === "shared" ? "✓ Aktiv" : "Auswählen"}
          </div>
        </button>

        {/* Modus 2: Per Agent */}
        <button
          type="button"
          onClick={() => handleModeSelect("per_agent")}
          className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
            selectedMode === "per_agent"
              ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
              : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  Eigene Maschine pro Agent
                </span>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Isoliert
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Jeder Bot erhält eine eigene dedizierte Sandbox. Höchste Trennung bei parallelen Aufgaben; ungenutzte Maschinen schlafen automatisch.
            </p>
          </div>
          <div className="mt-3 flex items-center text-[11px] font-medium text-primary">
            {selectedMode === "per_agent" ? "✓ Aktiv" : "Auswählen"}
          </div>
        </button>
      </div>

      {/* Bestätigungsdialog mit genauer Vorschau (Akzeptanzkriterium: nennt nie „löschen“) */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              Moduswechsel bestätigen
            </DialogTitle>
            <DialogDescription>
              {pendingMode === "per_agent"
                ? "Wechsel zum Modus „Eigene Maschine pro Agent“"
                : "Wechsel zum Modus „Eine Maschine für alle Agenten“"}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive"
            >
              {error}
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/40 p-3.5 text-xs">
            <div className="font-semibold text-foreground">Vorschau der Änderungen:</div>
            {pendingMode === "per_agent" ? (
              <div className="mt-2 space-y-2 text-muted-foreground">
                <p>
                  • Legt {agentCount} neue Maschinen an (eine dedizierte Sandbox für jeden Agenten).
                </p>
                <p>
                  • Bestehende Maschinen und Daten bleiben vollständig erhalten; es werden keine Maschinen entfernt.
                </p>
                <p>
                  • Neue Maschinen starten stromsparend im Ruhezustand und werden erst bei Bot-Aktivität aufgeweckt.
                </p>
              </div>
            ) : (
              <div className="mt-2 space-y-2 text-muted-foreground">
                <p>
                  • Alle Agenten werden wieder der geteilten Standard-Maschine zugewiesen.
                </p>
                <p>
                  • Bisherige Agenten-Sandboxes werden in den Ruhezustand versetzt und bleiben dauerhaft gespeichert.
                </p>
                <p>
                  • Keine Maschinen werden entfernt; bei späterem erneuten Wechsel werden sie nahtlos wiederverwendet.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsConfirmOpen(false);
                setPendingMode(null);
              }}
              disabled={isSubmitting}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={handleConfirmModeChange}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Wird umgeschaltet…" : "Modus anwenden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
