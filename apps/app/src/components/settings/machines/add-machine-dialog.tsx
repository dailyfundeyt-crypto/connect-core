/**
 * Dialog „+ Maschine hinzufügen“
 *
 * Lane: A26 (Maschinen-Einstellungen & Onboarding)
 * Erlaubt das Anlegen von Linux-Sandboxes (klein/mittel/groß) und bereitet Windows vor.
 */

import * as React from "react";
import { useState } from "react";
import { Plus, Server, Cpu, HardDrive, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Machine, MachineSize, MachineOs } from "./types";
import { createMachine } from "./machines-api";

export interface AddMachineDialogProps {
  onMachineCreated?: (machine: Machine) => void;
  triggerButton?: React.ReactNode;
  mock?: boolean;
}

export function AddMachineDialog({
  onMachineCreated,
  triggerButton,
  mock = false,
}: AddMachineDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [size, setSize] = useState<MachineSize>("small");
  const [os, setOs] = useState<MachineOs>("linux");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Bitte geben Sie einen Namen für die Maschine ein.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newMachine = await createMachine(
        {
          name: trimmedName,
          kind: "sandbox",
          size,
          os,
        },
        { mock },
      );

      onMachineCreated?.(newMachine);
      setOpen(false);
      setName("");
      setSize("small");
      setOs("linux");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Erstellen der Maschine");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {triggerButton ? (
        <span onClick={() => setOpen(true)} onKeyDown={() => setOpen(true)}>
          {triggerButton}
        </span>
      ) : (
        <Button
          className="gap-1.5"
          onClick={() => setOpen(true)}
          size="sm"
          type="button"
        >
          <Plus className="size-4" />
          Maschine hinzufügen
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="size-5 text-primary" />
              Neue Cua-Maschine anlegen
            </DialogTitle>
            <DialogDescription>
              Erstellen Sie eine neue isolierte Sandbox für Ihre Bots. Neue Maschinen starten
              ressourcenschonend im Ruhezustand.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive"
              >
                {error}
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="machine-name">Maschinen-Name</Label>
              <Input
                id="machine-name"
                placeholder="z. B. Python-Build-Sandbox"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Größe */}
            <div className="space-y-2">
              <Label>Größe & Leistung</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSize("small")}
                  className={`flex flex-col items-center justify-between rounded-lg border p-2.5 text-left transition hover:border-primary/50 ${
                    size === "small"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs font-semibold">Klein</span>
                    {size === "small" && <Check className="size-3.5 text-primary" />}
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    1 vCPU
                    <br />2 GB RAM
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSize("medium")}
                  className={`flex flex-col items-center justify-between rounded-lg border p-2.5 text-left transition hover:border-primary/50 ${
                    size === "medium"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs font-semibold">Mittel</span>
                    {size === "medium" && <Check className="size-3.5 text-primary" />}
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    2 vCPU
                    <br />4 GB RAM
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSize("large")}
                  className={`flex flex-col items-center justify-between rounded-lg border p-2.5 text-left transition hover:border-primary/50 ${
                    size === "large"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs font-semibold">Groß</span>
                    {size === "large" && <Check className="size-3.5 text-primary" />}
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    4 vCPU
                    <br />8 GB RAM
                  </div>
                </button>
              </div>
            </div>

            {/* Betriebssystem */}
            <div className="space-y-2">
              <Label>Betriebssystem</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOs("linux")}
                  className={`flex items-center justify-between rounded-lg border p-2.5 text-left transition ${
                    os === "linux"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card"
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold">Linux (Ubuntu 24.04)</div>
                    <div className="text-[11px] text-muted-foreground">Standard & sofort bereit</div>
                  </div>
                  {os === "linux" && <Check className="size-3.5 text-primary" />}
                </button>

                <div className="relative rounded-lg border border-dashed border-border/80 bg-muted/40 p-2.5 text-left opacity-75">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-foreground">Windows</div>
                      <div className="text-[11px] text-muted-foreground">WSL2 / In Vorbereitung</div>
                    </div>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground uppercase">
                      Später
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "Wird erstellt…" : "Maschine anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
