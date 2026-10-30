/**
 * Zuweisung Bot → Maschine
 *
 * Lane: A26 (Maschinen-Einstellungen & Onboarding)
 * Erlaubt die Zuweisung jedes Bots zu einer Maschine (Standard: geteilte lokale).
 */

import * as React from "react";
import { useState } from "react";
import { Bot, Check, Server, RefreshCw } from "lucide-react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import type { Machine } from "./types";
import { assignAgentToMachine } from "./machines-api";

export interface BotInfo {
  id: string;
  name: string;
  title?: string;
  assignedMachineId?: string | null;
}

export interface AgentMachineAssignmentProps {
  bots: BotInfo[];
  machines: Machine[];
  sharedDefaultMachineId?: string | null;
  onAssignmentChanged?: (agentId: string, machineId: string) => void;
  mock?: boolean;
}

export function AgentMachineAssignmentList({
  bots,
  machines,
  sharedDefaultMachineId,
  onAssignmentChanged,
  mock = false,
}: AgentMachineAssignmentProps) {
  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const b of bots) {
      initial[b.id] = b.assignedMachineId || sharedDefaultMachineId || machines[0]?.id || "";
    }
    return initial;
  });

  const [savingBotId, setSavingBotId] = useState<string | null>(null);
  const [savedSuccessId, setSavedSuccessId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<{ id: string; msg: string } | null>(null);

  // Aktualisiere Zuweisungen bei Bots/Default-Änderungen
  React.useEffect(() => {
    setAssignments((prev) => {
      const updated = { ...prev };
      for (const b of bots) {
        if (!updated[b.id]) {
          updated[b.id] = b.assignedMachineId || sharedDefaultMachineId || machines[0]?.id || "";
        }
      }
      return updated;
    });
  }, [bots, sharedDefaultMachineId, machines]);

  const handleMachineChange = async (agentId: string, newMachineId: string) => {
    setAssignments((prev) => ({ ...prev, [agentId]: newMachineId }));
    setSavingBotId(agentId);
    setErrorId(null);

    try {
      await assignAgentToMachine(agentId, newMachineId, { mock });
      setSavedSuccessId(agentId);
      onAssignmentChanged?.(agentId, newMachineId);

      setTimeout(() => {
        setSavedSuccessId((current) => (current === agentId ? null : current));
      }, 2500);
    } catch (err) {
      setErrorId({
        id: agentId,
        msg: err instanceof Error ? err.message : "Zuweisung fehlgeschlagen",
      });
    } finally {
      setSavingBotId(null);
    }
  };

  if (bots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        Noch keine Bots angelegt. Sobald Sie einen Agenten erstellen, können Sie ihn hier einer Maschine zuweisen.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Bot-Zuweisung
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Legen Sie fest, auf welcher Cua-Maschine jeder Bot seine Aktionen und Terminals ausführt.
        </p>
      </div>

      <div className="divide-y divide-border">
        {bots.map((bot) => {
          const currentMachineId = assignments[bot.id] || sharedDefaultMachineId || machines[0]?.id || "";
          const assignedMachine = machines.find((m) => m.id === currentMachineId);
          const isSaving = savingBotId === bot.id;
          const isSaved = savedSuccessId === bot.id;
          const hasError = errorId?.id === bot.id;

          return (
            <div key={bot.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bot className="size-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    {bot.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {bot.title || "Agent"}
                    {" · "}
                    Aktuell:{" "}
                    <span className="font-medium text-foreground">
                      {assignedMachine?.name || "Geteilte Standard-Maschine"}
                    </span>
                  </div>
                  {hasError && (
                    <div className="mt-1 text-[11px] text-destructive">
                      {errorId.msg}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {isSaved && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
                    <Check className="size-3.5" />
                    Gespeichert
                  </span>
                )}
                <select
                  aria-label={`Maschine für Bot ${bot.name}`}
                  value={currentMachineId}
                  onChange={(e) => handleMachineChange(bot.id, e.target.value)}
                  disabled={isSaving}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground shadow-xs transition focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.sharedDefault ? `⭐ ${m.name} (Standard)` : m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
