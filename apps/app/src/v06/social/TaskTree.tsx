/**
 * Connect-Sozial: TaskTree (v06 / A24)
 *
 * Hierarchischer Aufgabenbaum (DAG) für kollaborative Forschungsprojekte.
 * Visualisiert Aufgaben und Unteraufgaben mit Status, Akzeptanzkriterien
 * und Bot-Zuweisung.
 */

import React, { useState } from "react";
import {
  IconCheck,
  IconRobot,
  IconPlus,
  IconChevronRight,
  IconChevronDown,
  IconClock,
  IconAlertCircle,
  IconCircleDot,
  IconChecklist,
  IconX,
} from "@tabler/icons-react";
import type { ProjectTask, CreateTaskInput } from "./types";
import { getFlag } from "@/contracts/v06/flags";
import { EmptyState } from "@/v06/design";

export interface TaskTreeProps {
  projectId: string;
  tasks: ProjectTask[];
  canEdit?: boolean;
  availableBots?: Array<{ id: string; name: string }>;
  onUpdateStatus?: (taskId: string, status: "todo" | "claimed" | "done" | "blocked") => void;
  onCreateTask?: (task: CreateTaskInput) => Promise<any>;
  className?: string;
}

interface TreeNode {
  task: ProjectTask;
  children: TreeNode[];
}

export function buildTaskHierarchy(tasks: ProjectTask[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Initialize nodes
  for (const t of tasks) {
    map.set(t.id, { task: t, children: [] });
  }

  // Build tree
  for (const t of tasks) {
    const node = map.get(t.id)!;
    if (t.parentId && map.has(t.parentId)) {
      map.get(t.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function TaskTree({
  projectId,
  tasks,
  canEdit = true,
  availableBots = [
    { id: "researcher-bot", name: "Deep Research Agent" },
    { id: "coder-bot", name: "Fullstack Coder" },
    { id: "evaluator-bot", name: "Task Evaluator" },
  ],
  onUpdateStatus,
  onCreateTask,
  className = "",
}: TaskTreeProps) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isAddingRoot, setIsAddingRoot] = useState(false);
  const [activeParentForChild, setActiveParentForChild] = useState<string | null>(null);

  // New task form state
  const [newTitle, setNewTitle] = useState("");
  const [newAcceptance, setNewAcceptance] = useState("");
  const [newBotId, setNewBotId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredTasks =
    filterStatus === "all" ? tasks : tasks.filter((t) => t.status === filterStatus);

  const treeRoots = buildTaskHierarchy(filteredTasks);

  const handleCreate = async (parentId?: string) => {
    if (!newTitle.trim() || !onCreateTask) return;
    setIsSubmitting(true);
    try {
      await onCreateTask({
        parentId,
        title: newTitle.trim(),
        acceptance: newAcceptance.trim() || "Erfolgreiche Verifikation und Ausgabe im Schwarm.",
        status: "todo",
        assigneeBotId: newBotId || undefined,
      });

      setNewTitle("");
      setNewAcceptance("");
      setNewBotId("");
      setIsAddingRoot(false);
      setActiveParentForChild(null);
    } catch (err) {
      console.error("Fehler beim Anlegen der Aufgabe", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDesignV2 = getFlag("designV2");

  const getStatusBadge = (status: ProjectTask["status"]) => {
    if (isDesignV2) {
      switch (status) {
        case "done":
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--p-success)]/15 border border-[var(--p-success)]/30 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--p-success)]">
              <IconCheck className="size-3" /> Erledigt
            </span>
          );
        case "claimed":
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--p-accent)]/15 border border-[var(--p-accent)]/30 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--p-accent)]">
              <IconClock className="size-3" /> In Bearbeitung
            </span>
          );
        case "blocked":
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--p-danger)]/15 border border-[var(--p-danger)]/30 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--p-danger)]">
              <IconAlertCircle className="size-3" /> Blockiert
            </span>
          );
        case "todo":
        default:
          return (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--p-surface-3)] border border-[var(--p-border)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--p-text-3)]">
              <IconCircleDot className="size-3" /> Offen
            </span>
          );
      }
    }
    switch (status) {
      case "done":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
            <IconCheck className="size-3" /> Erledigt
          </span>
        );
      case "claimed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 border border-sky-500/25 px-2 py-0.5 text-[11px] font-semibold text-sky-400">
            <IconClock className="size-3" /> In Bearbeitung
          </span>
        );
      case "blocked":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 text-[11px] font-semibold text-rose-400">
            <IconAlertCircle className="size-3" /> Blockiert
          </span>
        );
      case "todo":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 border border-zinc-500/25 px-2 py-0.5 text-[11px] font-semibold text-zinc-400">
            <IconCircleDot className="size-3" /> Offen
          </span>
        );
    }
  };

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const { task, children } = node;
    const isAddingChildHere = activeParentForChild === task.id;

    return (
      <div key={task.id} className="space-y-2">
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isDesignV2
              ? "rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-1)] p-3.5 transition-all hover:border-[var(--p-border-strong)]"
              : "rounded-xl border border-white/10 bg-[#0e101f] p-3.5 transition-all hover:border-white/20"
          } ${
            depth > 0 ? (isDesignV2 ? "ml-4 sm:ml-7 border-l-2 border-l-[var(--p-accent)]" : "ml-4 sm:ml-7 border-l-2 border-l-indigo-500/50") : ""
          }`}
          data-testid={`task-tree-node-${task.id}`}
        >
          {/* Left: Title & Acceptance */}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[13px] font-bold ${isDesignV2 ? "text-[var(--p-text-1)]" : "text-white"}`}>
                {task.title}
              </span>
              {getStatusBadge(task.status)}

              {task.assigneeBotId && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  isDesignV2
                    ? "bg-[var(--p-accent)]/10 border border-[var(--p-accent)]/25 text-[var(--p-accent)]"
                    : "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
                }`}>
                  <IconRobot className="size-3" /> {task.assigneeBotId}
                </span>
              )}
            </div>

            {task.acceptance && (
              <p className={`text-[12px] leading-relaxed ${isDesignV2 ? "text-[var(--p-text-3)]" : "text-white/50"}`}>
                <span className={`font-medium ${isDesignV2 ? "text-[var(--p-text-2)]" : "text-white/70"}`}>Kriterium:</span> {task.acceptance}
              </p>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {canEdit && onUpdateStatus && (
              <select
                value={task.status}
                onChange={(e) => onUpdateStatus(task.id, e.target.value as any)}
                className={
                  isDesignV2
                    ? "min-h-[44px] rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--p-text-1)] outline-none hover:border-[var(--p-border-strong)]"
                    : "rounded-lg border border-white/10 bg-[#16192d] px-2 py-1 text-[11px] font-medium text-white/80 outline-none hover:border-white/20"
                }
                data-testid={`task-status-select-${task.id}`}
              >
                <option value="todo">Status: Offen</option>
                <option value="claimed">Status: Beansprucht</option>
                <option value="done">Status: Erledigt</option>
                <option value="blocked">Status: Blockiert</option>
              </select>
            )}

            {canEdit && onCreateTask && (
              <button
                type="button"
                onClick={() => {
                  setActiveParentForChild(isAddingChildHere ? null : task.id);
                  setIsAddingRoot(false);
                }}
                className={
                  isDesignV2
                    ? "min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-[var(--p-radius-md)] p-2 text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] transition-colors"
                    : "rounded-lg bg-white/5 hover:bg-white/10 p-1.5 text-white/70 hover:text-white transition-colors"
                }
                title="Unteraufgabe hinzufügen"
                data-testid={`task-add-child-${task.id}`}
              >
                <IconPlus className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Inline Add Child Form */}
        {isAddingChildHere && (
          <div className="ml-4 sm:ml-7 rounded-xl border border-indigo-500/30 bg-[#121428] p-3 space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between text-[12px] font-bold text-indigo-300">
              <span>Neue Unteraufgabe für: {task.title}</span>
              <button
                type="button"
                onClick={() => setActiveParentForChild(null)}
                className="text-white/40 hover:text-white"
              >
                <IconX className="size-4" />
              </button>
            </div>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Titel der Unteraufgabe..."
              className="w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-indigo-400"
            />
            <input
              type="text"
              value={newAcceptance}
              onChange={(e) => setNewAcceptance(e.target.value)}
              placeholder="Akzeptanzkriterium (Definition of Done)..."
              className="w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-indigo-400"
            />
            <div className="flex items-center justify-between pt-1">
              <select
                value={newBotId}
                onChange={(e) => setNewBotId(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#16192d] px-2 py-1 text-[11px] text-white/70"
              >
                <option value="">Bot zuweisen (optional)</option>
                {availableBots.map((b) => (
                  <option key={b.id} value={b.id}>
                    🤖 {b.name}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveParentForChild(null)}
                  className="rounded-lg px-3 py-1 text-[12px] text-white/50 hover:bg-white/5"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={!newTitle.trim() || isSubmitting}
                  onClick={() => handleCreate(task.id)}
                  className="rounded-lg bg-indigo-500 px-3 py-1 text-[12px] font-bold text-white hover:bg-indigo-400 disabled:opacity-50"
                >
                  Hinzufügen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Render Children Recursively */}
        {children.length > 0 && (
          <div className="space-y-2">
            {children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isDesignV2) {
    return (
      <div
        className={`rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] p-5 text-[var(--p-text-1)] ${className}`}
        data-testid="project-task-tree"
      >
        {/* Task Tree Header & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--p-border)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-[var(--p-radius-md)] bg-[var(--p-accent)]/15 text-[var(--p-accent)]">
              <IconChecklist className="size-4" />
            </div>
            <div>
              <h4 className="text-[14px] font-bold text-[var(--p-text-1)]">Aufgabenbaum (DAG)</h4>
              <p className="text-[11px] text-[var(--p-text-3)]">
                {tasks.length} Aufgaben insgesamt · {tasks.filter((t) => t.status === "done").length}{" "}
                abgeschlossen
              </p>
            </div>
          </div>

          {/* Filter Pills & Add Root Button */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-[var(--p-radius-md)] bg-[var(--p-surface-3)] p-0.5 border border-[var(--p-border)] text-[11px]">
              {["all", "todo", "claimed", "done", "blocked"].map((st) => (
                <button
                  type="button"
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`min-h-[32px] rounded-[var(--p-radius-sm)] px-2.5 py-1 font-semibold transition-all ${
                    filterStatus === st
                      ? "bg-[var(--p-surface-1)] text-[var(--p-text-1)] shadow-xs"
                      : "text-[var(--p-text-3)] hover:text-[var(--p-text-1)]"
                  }`}
                >
                  {st === "all"
                    ? "Alle"
                    : st === "todo"
                    ? "Offen"
                    : st === "claimed"
                    ? "Beansprucht"
                    : st === "done"
                    ? "Erledigt"
                    : "Blockiert"}
                </button>
              ))}
            </div>

            {canEdit && onCreateTask && (
              <button
                type="button"
                onClick={() => {
                  setIsAddingRoot(!isAddingRoot);
                  setActiveParentForChild(null);
                }}
                className="flex min-h-[44px] items-center gap-1.5 rounded-full bg-[var(--p-accent)] px-4 py-2 text-[12px] font-bold text-zinc-950 hover:bg-[var(--p-accent)]/90 transition-colors shadow-sm"
                data-testid="task-tree-add-root-button"
              >
                <IconPlus className="size-3.5" />
                <span>Aufgabe</span>
              </button>
            )}
          </div>
        </div>

        {/* Add Root Task Form */}
        {isAddingRoot && (
          <div className="mt-4 rounded-[var(--p-radius-md)] border border-[var(--p-accent)]/30 bg-[var(--p-surface-1)] p-4 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between text-[13px] font-bold text-[var(--p-accent)]">
              <span>Neue Hauptaufgabe anlegen</span>
              <button
                type="button"
                onClick={() => setIsAddingRoot(false)}
                className="text-[var(--p-text-3)] hover:text-[var(--p-text-1)]"
              >
                <IconX className="size-4" />
              </button>
            </div>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Titel der Hauptaufgabe..."
              className="w-full rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] px-3 py-2 text-[13px] text-[var(--p-text-1)] outline-none focus:border-[var(--p-accent)]"
              data-testid="task-root-title-input"
            />
            <input
              type="text"
              value={newAcceptance}
              onChange={(e) => setNewAcceptance(e.target.value)}
              placeholder="Akzeptanzkriterium (Definition of Done)..."
              className="w-full rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] px-3 py-2 text-[13px] text-[var(--p-text-1)] outline-none focus:border-[var(--p-accent)]"
              data-testid="task-root-acceptance-input"
            />
            <div className="flex items-center justify-between pt-1">
              <select
                value={newBotId}
                onChange={(e) => setNewBotId(e.target.value)}
                className="rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] px-3 py-1.5 text-[12px] text-[var(--p-text-2)] outline-none"
              >
                <option value="">Bot zuweisen (optional)</option>
                {availableBots.map((b) => (
                  <option key={b.id} value={b.id}>
                    🤖 {b.name}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingRoot(false)}
                  className="rounded-[var(--p-radius-md)] px-3 py-1.5 text-[12px] text-[var(--p-text-3)] hover:bg-[var(--p-surface-3)]"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={!newTitle.trim() || isSubmitting}
                  onClick={() => handleCreate()}
                  className="min-h-[44px] rounded-full bg-[var(--p-accent)] px-4 py-2 text-[12px] font-bold text-zinc-950 hover:bg-[var(--p-accent)]/90 disabled:opacity-50"
                  data-testid="task-root-submit-button"
                >
                  Aufgabe erstellen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Task List / Tree Hierarchy */}
        <div className="mt-4 space-y-2.5">
          {treeRoots.length > 0 ? (
            treeRoots.map((root) => renderTreeNode(root, 0))
          ) : (
            <div className="py-6">
              <EmptyState
                compact
                icon={<IconChecklist className="size-6 text-[var(--p-accent)]" />}
                title="Keine Aufgaben vorhanden"
                description="Erstelle die erste Projektaufgabe für dieses Forschungsprojekt!"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[#0a0b16] p-5 text-white ${className}`}
      data-testid="project-task-tree"
    >
      {/* Task Tree Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
            <IconChecklist className="size-4" />
          </div>
          <div>
            <h4 className="text-[14px] font-bold text-white">Aufgabenbaum (DAG)</h4>
            <p className="text-[11px] text-white/50">
              {tasks.length} Aufgaben insgesamt · {tasks.filter((t) => t.status === "done").length}{" "}
              abgeschlossen
            </p>
          </div>
        </div>

        {/* Filter Pills & Add Root Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl bg-white/5 p-0.5 border border-white/10 text-[11px]">
            {["all", "todo", "claimed", "done", "blocked"].map((st) => (
              <button
                type="button"
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
                  filterStatus === st
                    ? "bg-white/20 text-white"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {st === "all"
                  ? "Alle"
                  : st === "todo"
                  ? "Offen"
                  : st === "claimed"
                  ? "Beansprucht"
                  : st === "done"
                  ? "Erledigt"
                  : "Blockiert"}
              </button>
            ))}
          </div>

          {canEdit && onCreateTask && (
            <button
              type="button"
              onClick={() => {
                setIsAddingRoot(!isAddingRoot);
                setActiveParentForChild(null);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-sky-400 transition-colors shadow-sm"
              data-testid="task-tree-add-root-button"
            >
              <IconPlus className="size-3.5" />
              <span>Aufgabe</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Root Task Form */}
      {isAddingRoot && (
        <div className="mt-4 rounded-xl border border-sky-500/30 bg-[#121428] p-4 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between text-[13px] font-bold text-sky-300">
            <span>Neue Hauptaufgabe anlegen</span>
            <button
              type="button"
              onClick={() => setIsAddingRoot(false)}
              className="text-white/40 hover:text-white"
            >
              <IconX className="size-4" />
            </button>
          </div>
          <input
            type="text"
            required
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Titel der Hauptaufgabe..."
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[13px] text-white outline-none focus:border-sky-400"
            data-testid="task-root-title-input"
          />
          <input
            type="text"
            value={newAcceptance}
            onChange={(e) => setNewAcceptance(e.target.value)}
            placeholder="Akzeptanzkriterium (Definition of Done)..."
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[13px] text-white outline-none focus:border-sky-400"
            data-testid="task-root-acceptance-input"
          />
          <div className="flex items-center justify-between pt-1">
            <select
              value={newBotId}
              onChange={(e) => setNewBotId(e.target.value)}
              className="rounded-xl border border-white/15 bg-[#16192d] px-3 py-1.5 text-[12px] text-white/70 outline-none"
            >
              <option value="">Bot zuweisen (optional)</option>
              {availableBots.map((b) => (
                <option key={b.id} value={b.id}>
                  🤖 {b.name}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsAddingRoot(false)}
                className="rounded-xl px-3 py-1.5 text-[12px] text-white/50 hover:bg-white/5"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={!newTitle.trim() || isSubmitting}
                onClick={() => handleCreate()}
                className="rounded-xl bg-sky-500 px-4 py-1.5 text-[12px] font-bold text-white hover:bg-sky-400 disabled:opacity-50"
                data-testid="task-root-submit-button"
              >
                Aufgabe erstellen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task List / Tree Hierarchy */}
      <div className="mt-4 space-y-2.5">
        {treeRoots.length > 0 ? (
          treeRoots.map((root) => renderTreeNode(root, 0))
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-white/40 text-[13px]">
            Keine Aufgaben vorhanden. Erstelle die erste Projektaufgabe!
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskTree;
