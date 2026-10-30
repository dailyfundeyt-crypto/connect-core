/**
 * Project Task Tree & DAG Explorer (Lane 6)
 *
 * Visualisiert den rekursiven Directed Acyclic Graph (DAG) der Forschungsaufgaben:
 * - Anzeige der Hierarchie nach Tiefe (Level 0, 1, 2...)
 * - Farbcodierte Status-Badges (open, claimed, submitted, approved, rejected)
 * - Interaktives Claiming mit atomarem Lease
 * - Einreichen von Ergebnissen & Peer-Review
 * - Selbstaufträge (proposeTask) mit Tiefenprüfung
 */

import React, { useEffect, useState } from "react";
import {
  IconCheck,
  IconClock,
  IconCpu,
  IconGitBranch,
  IconListCheck,
  IconPlus,
  IconRefresh,
  IconShieldCheck,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";

type TaskItem = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: "proposed" | "open" | "claimed" | "in_progress" | "submitted" | "approved" | "rejected";
  depth: number;
  parentTaskId?: string | null;
  assignedTo?: string;
  leaseExpiresAt?: string;
  resultSummary?: string;
  reviewerId?: string;
  reviewComment?: string;
};

export function ProjectTaskTreeModal({
  projectId,
  projectTitle,
  onClose,
  onUpdate,
}: {
  projectId: string;
  projectTitle: string;
  onClose: () => void;
  onUpdate?: () => void;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [proposingParentId, setProposingParentId] = useState<string | null>(null);
  const [proposalTitle, setProposalTitle] = useState("");

  const loadTasks = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/tasks`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
      }
    } catch (err: any) {
      setError(err.message || "Fehler beim Laden der Aufgaben");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [projectId]);

  // Task claimen
  const handleClaim = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      const res = await fetch("/api/swarm/tasks/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          taskId,
          botId: `manual-worker-${Date.now()}`,
          leaseDurationMs: 600000,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || data.error || "Claim fehlgeschlagen");
      }
      await loadTasks();
      onUpdate?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusyTaskId(null);
    }
  };

  // Ergebnis einreichen
  const handleSubmitResult = async (taskId: string, botId: string) => {
    setBusyTaskId(taskId);
    try {
      const summary = prompt(
        "Ergebnis-Zusammenfassung eingeben:",
        "Bindungsaffinität validiert (Kd = 4.2 nM). Keine allosterische Abstoßung festgestellt.",
      );
      if (!summary) return;

      const res = await fetch("/api/swarm/tasks/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          botId,
          resultSummary: summary,
          tokensUsed: 1250,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Einreichen fehlgeschlagen");
      }
      await loadTasks();
      onUpdate?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusyTaskId(null);
    }
  };

  // Peer-Review durchführen
  const handleReview = async (taskId: string, approved: boolean) => {
    setBusyTaskId(taskId);
    try {
      const comment = approved
        ? "Wissenschaftliche Methodik und Docking-Parameter verifiziert."
        : "Format unvollständig. Bitte PDB-Referenzen nachreichen.";

      const res = await fetch("/api/swarm/tasks/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          reviewerId: "reviewer-bot-consortium",
          approved,
          comment,
          score: approved ? 96 : 45,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Review fehlgeschlagen");
      }
      await loadTasks();
      onUpdate?.();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusyTaskId(null);
    }
  };

  // Selbstauftrag vorschlagen (proposeTask)
  const handleProposeFollowUp = async (parentTaskId: string) => {
    if (!proposalTitle.trim()) return;
    try {
      const res = await fetch("/api/swarm/tasks/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          parentTaskId,
          title: proposalTitle.trim(),
          description: "Vom Worker autonom identifizierte Teilaufgabe.",
          proposedByBotId: "bot-autonomous-explorer",
          estimatedTokens: 20000,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Vorschlag abgelehnt");
      }
      setProposingParentId(null);
      setProposalTitle("");
      await loadTasks();
      onUpdate?.();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getStatusBadge = (status: TaskItem["status"]) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-2xs font-semibold text-emerald-600 dark:text-emerald-400">
            <IconCheck className="size-3" /> Approved
          </span>
        );
      case "submitted":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-2xs font-semibold text-sky-600 dark:text-sky-400">
            <IconClock className="size-3" /> Submitted (Review pending)
          </span>
        );
      case "claimed":
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-semibold text-amber-600 dark:text-amber-400">
            <IconCpu className="size-3" /> Claimed (Active Lease)
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-2xs font-semibold text-destructive">
            <IconX className="size-3" /> Rejected
          </span>
        );
      case "proposed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-2xs font-semibold text-purple-600 dark:text-purple-400">
            <IconSparkles className="size-3" /> Proposed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground">
            Open
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative flex flex-col max-h-[85vh] w-full max-w-3xl rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 pb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 text-primary">
              <IconGitBranch className="size-5" />
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Aufgabenbaum & DAG-Explorer
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Projekt: <strong className="text-foreground">{projectTitle}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadTasks}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Aktualisieren"
            >
              <IconRefresh className="size-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <IconX className="size-5" />
            </button>
          </div>
        </div>

        {/* Task List / Tree */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {loading && (
            <div className="flex justify-center py-8 text-xs text-muted-foreground">
              Aufgaben werden geladen...
            </div>
          )}

          {!loading && tasks.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Keine Aufgaben vorhanden.
            </div>
          )}

          {!loading &&
            tasks.map((task) => {
              const isBusy = busyTaskId === task.id;
              const indent = task.depth * 20;

              return (
                <div
                  key={task.id}
                  style={{ marginLeft: `${indent}px` }}
                  className="rounded-xl border border-border/60 bg-muted/20 p-3.5 transition hover:bg-muted/30"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
                        L{task.depth}
                      </span>
                      <h4 className="text-sm font-medium text-foreground">
                        {task.title}
                      </h4>
                    </div>
                    {getStatusBadge(task.status)}
                  </div>

                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {task.description}
                  </p>

                  {/* Result & Review Info */}
                  {task.resultSummary && (
                    <div className="mt-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-2 text-xs text-emerald-800 dark:text-emerald-300">
                      <strong>Ergebnis: </strong> {task.resultSummary}
                    </div>
                  )}

                  {task.reviewComment && (
                    <div className="mt-1.5 rounded-lg bg-sky-500/5 border border-sky-500/20 p-2 text-xs text-sky-800 dark:text-sky-300">
                      <strong>Review: </strong> {task.reviewComment}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-2 text-2xs">
                    <div className="text-muted-foreground">
                      {task.assignedTo ? (
                        <span>Zugewiesen an: <strong className="text-foreground">{task.assignedTo}</strong></span>
                      ) : (
                        <span>Frei für Claiming</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {task.status === "open" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleClaim(task.id)}
                          className="rounded-md bg-primary px-2.5 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Task claimen (Lease)
                        </button>
                      )}

                      {task.status === "claimed" && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleSubmitResult(task.id, task.assignedTo || "bot-worker")
                          }
                          className="rounded-md bg-sky-600 px-2.5 py-1 text-2xs font-medium text-white hover:bg-sky-500"
                        >
                          Ergebnis einreichen
                        </button>
                      )}

                      {task.status === "submitted" && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleReview(task.id, true)}
                            className="rounded-md bg-emerald-600 px-2.5 py-1 text-2xs font-medium text-white hover:bg-emerald-500"
                          >
                            Freigeben
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleReview(task.id, false)}
                            className="rounded-md bg-destructive px-2 py-1 text-2xs font-medium text-destructive-foreground hover:bg-destructive/90"
                          >
                            Ablehnen
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setProposingParentId(
                            proposingParentId === task.id ? null : task.id,
                          )
                        }
                        className="rounded-md border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-muted"
                      >
                        <IconPlus className="size-3 inline mr-1" />
                        Folge-Task
                      </button>
                    </div>
                  </div>

                  {/* Inline Formular für Selbstauftrag */}
                  {proposingParentId === task.id && (
                    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">
                      <span className="font-medium text-foreground block mb-1">
                        Autonomen Folge-Task vorschlagen (Selbstauftrag):
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={proposalTitle}
                          onChange={(e) => setProposalTitle(e.target.value)}
                          placeholder="z.B. Molekül-Stabilitätsanalyse an P2..."
                          className="flex-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => handleProposeFollowUp(task.id)}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                        >
                          Hinzufügen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
