import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  IconAlertTriangle,
  IconPower,
  IconShieldCheck,
  IconCheck,
} from "@tabler/icons-react";

export interface ConductorKillSwitchProps {
  killSwitchActive: boolean;
  onToggle: (activate: boolean, reason?: string) => Promise<void> | void;
  isLoading?: boolean;
  className?: string;
}

export function ConductorKillSwitch({
  killSwitchActive,
  onToggle,
  isLoading = false,
  className,
}: ConductorKillSwitchProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingState, setPendingState] = useState<boolean>(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSwitchClick = () => {
    // When clicking switch, open confirmation dialog
    setPendingState(!killSwitchActive);
    setReason("");
    setDialogOpen(true);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onToggle(pendingState, reason.trim() || undefined);
      setDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "rounded-xl border p-4 transition-all duration-200",
          killSwitchActive
            ? "border-rose-500/50 bg-rose-950/20 shadow-[0_0_24px_rgba(244,63,94,0.15)]"
            : "border-white/[0.08] bg-[#121216]",
          className
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                killSwitchActive
                  ? "border-rose-500/40 bg-rose-500/20 text-rose-300"
                  : "border-white/10 bg-white/[0.05] text-zinc-400"
              )}
            >
              <IconPower className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-white tracking-tight">
                  Conductor Not-Aus (Kill-Switch)
                </h4>
                {killSwitchActive && (
                  <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-[10px] font-bold text-rose-300 uppercase tracking-wider animate-pulse">
                    Aktiviert
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                {killSwitchActive
                  ? "Alle neuen Claims und automatischen Handoffs sind gestoppt."
                  : "Stoppt sofort alle neuen Claims & Failovers (laufende Prozesse bleiben unberührt)."}
              </p>
            </div>
          </div>

          {/* Interactive Switch with Confirmation trigger */}
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={killSwitchActive}
              onCheckedChange={handleSwitchClick}
              disabled={isLoading || isSubmitting}
              className={cn(
                killSwitchActive &&
                  "data-checked:bg-rose-500 data-checked:border-rose-400/60 data-checked:shadow-[0_0_12px_rgba(244,63,94,0.4)]"
              )}
            />
          </div>
        </div>

        {/* Warning Banner if Kill-Switch is Active */}
        {killSwitchActive && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 flex items-center gap-2.5 text-xs text-rose-200">
            <IconAlertTriangle className="size-4 shrink-0 text-rose-400" />
            <div className="flex-1">
              <strong>Achtung:</strong> Der Conductor nimmt keine neuen Swarm-Tasks an. Bestehende Tasks laufen weiter.
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-[#16161d] border-white/10 text-white">
          <DialogHeader>
            <div className="flex items-center gap-2.5 text-base font-semibold">
              {pendingState ? (
                <>
                  <IconAlertTriangle className="size-5 text-rose-400" />
                  <DialogTitle className="text-white">Kill-Switch aktivieren?</DialogTitle>
                </>
              ) : (
                <>
                  <IconShieldCheck className="size-5 text-emerald-400" />
                  <DialogTitle className="text-white">Conductor wieder aktivieren?</DialogTitle>
                </>
              )}
            </div>
            <DialogDescription className="text-zinc-400 text-xs mt-1.5 leading-relaxed">
              {pendingState
                ? "Wenn Sie den Kill-Switch aktivieren, werden sofort alle neuen Task-Claims und Handoffs blockiert. Laufende Terminal-Prozesse werden nicht abgebrochen."
                : "Der normale Conductor-Betrieb wird fortgesetzt. Neue Claims und Handoffs (Codex → Claude) werden wieder verarbeitet."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Grund / Notiz (optional):
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  pendingState
                    ? "z. B. Manuelle Wartung oder OpenAI-Ausfall"
                    : "z. B. Wartung abgeschlossen"
                }
                className="w-full rounded-lg border border-white/10 bg-[#121216] px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
              disabled={isSubmitting}
            >
              Abbrechen
            </Button>
            <Button
              variant={pendingState ? "destructive" : "default"}
              size="sm"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              {pendingState ? (
                <>
                  <IconPower className="size-3.5" />
                  Not-Aus aktivieren
                </>
              ) : (
                <>
                  <IconCheck className="size-3.5" />
                  Betrieb fortsetzen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
