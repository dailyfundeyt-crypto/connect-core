/**
 * Status-Punkte für das Agenten-Raster (Lane A28).
 *
 * EIGENTÜMER: A28.
 *
 * Die Zustände kommen aus dem Scheduler (A21: `useSchedulerStatus` →
 * `FleetAgentState.state`, Vertragstyp `AgentRuntimeState` aus A01). Das Raster
 * kennt genau fünf sichtbare Zustände; „idle" (der Agent ist da, tut aber
 * nichts) und „queued" (wartet in der Scheduler-Warteschlange) werden beide
 * als „wartet" gezeigt, damit der Nutzer nicht sechs Farben lesen muss.
 */

import type { AgentRuntimeState } from "@/lib/t3/contracts";

/** Die im Raster sichtbaren Zustände. */
export type GridAgentStatus =
  | "running"
  | "waiting"
  | "sleeping"
  | "idle"
  | "error";

/** Zustand des Schedulers → sichtbarer Raster-Zustand. */
export function toGridStatus(
  state: AgentRuntimeState | undefined | null,
): GridAgentStatus {
  switch (state) {
    case "running":
      return "running";
    case "queued":
    case "waiting_approval":
      return "waiting";
    case "sleeping":
      return "sleeping";
    case "error":
      return "error";
    case "idle":
    default:
      return "idle";
  }
}

/** Tooltip-Text je Zustand. */
export const STATUS_LABEL: Record<GridAgentStatus, string> = {
  running: "läuft",
  waiting: "wartet",
  sleeping: "schläft",
  idle: "bereit",
  error: "Fehler",
};

/** Farbe des Status-Punkts (Tailwind-Klassen). */
export const STATUS_DOT_CLASS: Record<GridAgentStatus, string> = {
  running: "bg-emerald-500",
  waiting: "bg-amber-500",
  sleeping: "bg-slate-400 dark:bg-slate-500",
  idle: "bg-sky-400",
  error: "bg-destructive",
};

/** Ring-Farbe des Status-Punkts, passend zum Avatar-Hintergrund. */
export const STATUS_DOT_RING_CLASS: Record<GridAgentStatus, string> = {
  running: "ring-sidebar",
  waiting: "ring-sidebar",
  sleeping: "ring-sidebar",
  idle: "ring-sidebar",
  error: "ring-sidebar",
};
