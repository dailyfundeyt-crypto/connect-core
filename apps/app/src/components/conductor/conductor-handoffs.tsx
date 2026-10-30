import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { Transfer, TransferStatus } from "./types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  IconArrowRight,
  IconArrowsExchange,
  IconCheck,
  IconClock,
  IconCpu,
  IconSparkles,
  IconAlertCircle,
  IconPlus,
} from "@tabler/icons-react";

export interface ConductorHandoffsProps {
  transfers: Transfer[];
  onTriggerHandoff?: (taskId: string, targetRuntime: string, reason: string) => Promise<void> | void;
  className?: string;
}

export function ConductorHandoffs({
  transfers,
  onTriggerHandoff,
  className,
}: ConductorHandoffsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [targetRuntime, setTargetRuntime] = useState("claude");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!taskId.trim() || !onTriggerHandoff) return;
    setSubmitting(true);
    try {
      await onTriggerHandoff(taskId.trim(), targetRuntime, reason.trim());
      setModalOpen(false);
      setTaskId("");
      setReason("");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: TransferStatus) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            <IconCheck className="size-2.5" />
            Abgeschlossen
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
            <IconClock className="size-2.5 animate-spin" />
            In Übertragung
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
            <IconAlertCircle className="size-2.5" />
            Fehlgeschlagen
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
            Ausstehend
          </span>
        );
    }
  };

  return (
    <>
      <div
        className={cn(
          "rounded-xl border border-white/[0.08] bg-[#121216] p-4 text-[#ededef] shadow-sm flex flex-col gap-3.5",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <IconArrowsExchange className="size-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-tight">
                Aktive & Letzte Handoffs
              </h3>
              <p className="text-xs text-zinc-400">
                Single-Owner Failover-Transfers (Dedupliziert via SHA-256 Key)
              </p>
            </div>
          </div>

          {onTriggerHandoff && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="text-xs gap-1.5"
            >
              <IconPlus className="size-3.5" />
              Manueller Handoff
            </Button>
          )}
        </div>

        {/* Transfers List */}
        {transfers.length === 0 ? (
          <div className="rounded-lg border border-white/[0.04] bg-[#0d0d11] p-6 text-center text-xs text-zinc-500">
            Keine Handoff-Transfers vorhanden. Der Primär-Agent läuft stabil.
          </div>
        ) : (
          <div className="space-y-2.5">
            {transfers.map((tr) => (
              <div
                key={tr.id}
                className="rounded-lg border border-white/[0.06] bg-[#16161d] p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-white/10 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-white">
                      {tr.swarmTaskId}
                    </span>
                    <span className="text-zinc-500">•</span>
                    <div className="flex items-center gap-1 font-mono text-[11px] text-zinc-300">
                      <span className="capitalize text-emerald-400">{tr.fromRuntime}</span>
                      <IconArrowRight className="size-3 text-zinc-500" />
                      <span className="capitalize text-amber-400">{tr.toRuntime}</span>
                    </div>
                    {getStatusBadge(tr.status)}
                  </div>

                  <p className="text-zinc-400 text-[11px] leading-relaxed">
                    {tr.reason}
                  </p>

                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                    <span>Key: {tr.transferKey.substring(0, 16)}...</span>
                    <span>•</span>
                    <span>{new Date(tr.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Handoff Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md bg-[#16161d] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <IconArrowsExchange className="size-5 text-sky-400" />
              Manuellen Task-Handoff anstoßen
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              Übertragen Sie einen laufenden Swarm-Task kontrolliert an die Standby-Runtime (Claude Code).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-2 text-xs">
            <div>
              <label className="font-medium text-zinc-300 block mb-1">
                Swarm Task-ID:
              </label>
              <input
                type="text"
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                placeholder="z. B. task_test_9001"
                className="w-full rounded-lg border border-white/10 bg-[#121216] px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="font-medium text-zinc-300 block mb-1">
                Ziel-Runtime:
              </label>
              <select
                value={targetRuntime}
                onChange={(e) => setTargetRuntime(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#121216] px-3 py-2 text-xs text-white outline-none focus:border-sky-500"
              >
                <option value="claude">Anthropic Claude Code (Standby)</option>
                <option value="codex">OpenAI Codex (Primär)</option>
              </select>
            </div>

            <div>
              <label className="font-medium text-zinc-300 block mb-1">
                Grund:
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z. B. Manueller Test des Failover-Routings"
                className="w-full rounded-lg border border-white/10 bg-[#121216] px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !taskId.trim()}
            >
              Handoff ausführen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
