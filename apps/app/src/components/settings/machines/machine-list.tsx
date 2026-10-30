/**
 * Liste der Cua-Maschinen
 *
 * Lane: A26 (Maschinen-Einstellungen & Onboarding)
 * Anforderungen:
 * - Standard-Maschine „Lokal (alle Bots)“ immer oben
 * - „+ Maschine hinzufügen“ (Sandbox klein/mittel, Linux; später Windows)
 * - Lifecycle-Steuerung (Aufwecken / Schlafen legen)
 */

import * as React from "react";
import { useState } from "react";
import {
  Server,
  Power,
  Moon,
  Sparkles,
  Shield,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Machine, MachineStatus } from "./types";
import { controlMachine } from "./machines-api";
import { AddMachineDialog } from "./add-machine-dialog";

export interface MachineListProps {
  machines: Machine[];
  sharedDefaultId?: string | null;
  onMachineAdded?: (machine: Machine) => void;
  onStatusChanged?: (machineId: string, newStatus: MachineStatus) => void;
  mock?: boolean;
}

export function MachineList({
  machines,
  sharedDefaultId,
  onMachineAdded,
  onStatusChanged,
  mock = false,
}: MachineListProps) {
  const [busyMachineId, setBusyMachineId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<{ id: string; msg: string } | null>(null);

  // Sortierung: Standard-Maschine („Lokal (alle Bots)“) IMMER ganz oben an Position 1!
  const sortedMachines = React.useMemo(() => {
    const list = [...machines];
    return list.sort((a, b) => {
      const aIsDefault = a.sharedDefault || a.id === sharedDefaultId;
      const bIsDefault = b.sharedDefault || b.id === sharedDefaultId;
      if (aIsDefault && !bIsDefault) return -1;
      if (!aIsDefault && bIsDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [machines, sharedDefaultId]);

  const handleTogglePower = async (machine: Machine) => {
    const targetAction = machine.status === "running" ? "sleep" : "wake";
    setBusyMachineId(machine.id);
    setErrorId(null);

    try {
      const updated = await controlMachine(machine.id, targetAction, { mock });
      onStatusChanged?.(machine.id, updated.status);
    } catch (err) {
      setErrorId({
        id: machine.id,
        msg: err instanceof Error ? err.message : "Aktion fehlgeschlagen",
      });
    } finally {
      setBusyMachineId(null);
    }
  };

  const renderStatusBadge = (status: MachineStatus) => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Läuft
          </span>
        );
      case "sleeping":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Moon className="size-2.5" />
            Schläft
          </span>
        );
      case "starting":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <Activity className="size-2.5 animate-spin" />
            Startet…
          </span>
        );
      case "stopped":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Gestoppt
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
            <AlertTriangle className="size-2.5" />
            Fehler
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Verfügbare Maschinen
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cua-Sandboxes auf diesem Rechner. Die geteilte Standard-Maschine steht allen Bots zur Verfügung.
          </p>
        </div>
        <AddMachineDialog mock={mock} onMachineCreated={onMachineAdded} />
      </div>

      <div className="divide-y divide-border">
        {sortedMachines.map((machine) => {
          const isDefault = machine.sharedDefault || machine.id === sharedDefaultId;
          const isBusy = busyMachineId === machine.id;
          const isRunning = machine.status === "running";
          const hasError = errorId?.id === machine.id;

          return (
            <div
              key={machine.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 transition-colors ${
                isDefault ? "bg-muted/15" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                    isDefault
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Server className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {isDefault && machine.name !== "Lokal (alle Bots)"
                        ? `Lokal (alle Bots) · ${machine.name}`
                        : machine.name}
                    </span>
                    {isDefault && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-medium text-primary">
                        Standard (alle Bots)
                      </span>
                    )}
                    {renderStatusBadge(machine.status)}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>Linux Ubuntu (Cua Sandbox)</span>
                    <span>•</span>
                    <span>{machine.width && machine.height ? `${machine.width}×${machine.height}` : "1280×800"}</span>
                    {machine.cuaRef && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-[10px] opacity-75">{machine.cuaRef}</span>
                      </>
                    )}
                  </div>

                  {hasError && (
                    <div className="mt-1 text-[11px] text-destructive">
                      {errorId.msg}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <Button
                  size="sm"
                  variant={isRunning ? "outline" : "default"}
                  onClick={() => handleTogglePower(machine)}
                  disabled={isBusy}
                  className="h-8 gap-1.5 text-xs"
                >
                  {isRunning ? (
                    <>
                      <Moon className="size-3.5" />
                      Schlafen legen
                    </>
                  ) : (
                    <>
                      <Power className="size-3.5" />
                      Aufwecken
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}

        {sortedMachines.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Keine Maschinen vorhanden. Klicken Sie oben auf „Maschine hinzufügen“, um eine neue Sandbox anzulegen.
          </div>
        )}
      </div>
    </div>
  );
}
