/**
 * Status-Zustände der Flotten-Ansicht (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Die Zustände kommen vom Scheduler (A08) und werden hier auf das gebündelt,
 * was die Flotte zeigt. Sechs Scheduler-Zustände werden zu **fünf** sichtbaren:
 * `queued` und `waiting_approval` heißen beide „wartet" — wer 40 Agenten
 * überwacht, will nicht sechs Farben lesen, sondern fünf.
 *
 * Das ist bewusst getrennt von `app-sidebar/agent-grid/status.ts` (A28): dort
 * sind es fünf Zustände für die Sidebar, hier sind es fünf für die Tabelle.
 * Beide nutzen dieselbe Grundidee, aber sie sind getrennte Flächen mit
 * getrennten Anforderungen — die Sidebar hat keinen Raum für eine Legende.
 */

import type { FleetAgentStateName } from "./fleet-client";

/** Die sichtbaren Zustände der Flotte. */
export type FleetStatus = "running" | "waiting" | "sleeping" | "idle" | "error";

/** Der Scheduler-Zustand → der sichtbare Zustand. */
export function toFleetStatus(
  state: FleetAgentStateName | undefined | null,
): FleetStatus {
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

/** Das deutsche Label je Zustand. */
export const FLEET_STATUS_LABEL: Record<FleetStatus, string> = {
  running: "läuft",
  waiting: "wartet",
  sleeping: "schläft",
  idle: "bereit",
  error: "Fehler",
};

/** Die Farbe des Zustandspunkts (Tailwind-Klassen). */
export const FLEET_STATUS_DOT_CLASS: Record<FleetStatus, string> = {
  running: "bg-emerald-500",
  waiting: "bg-amber-500",
  sleeping: "bg-slate-400 dark:bg-slate-500",
  idle: "bg-sky-400",
  error: "bg-destructive",
};

/** Die Textfarbe des Zustands in der Tabelle. */
export const FLEET_STATUS_TEXT_CLASS: Record<FleetStatus, string> = {
  running: "text-emerald-600 dark:text-emerald-400",
  waiting: "text-amber-600 dark:text-amber-400",
  sleeping: "text-muted-foreground",
  idle: "text-sky-600 dark:text-sky-400",
  error: "text-destructive",
};

/** Die Reihenfolge der Zustände in der Legende. */
export const FLEET_STATUS_ORDER: FleetStatus[] = [
  "running",
  "waiting",
  "sleeping",
  "idle",
  "error",
];

/**
 * Zählt die Zeilen je Zustand.
 *
 * Die Zähler stehen über der Tabelle, damit Stefan sieht, ob die Flotte
 * gerade läuft oder schläft, ohne die Zeilen zu zählen.
 */
export function countByStatus(
  rows: readonly { state: FleetAgentStateName }[],
): Record<FleetStatus, number> {
  const counts: Record<FleetStatus, number> = {
    running: 0,
    waiting: 0,
    sleeping: 0,
    idle: 0,
    error: 0,
  };
  for (const row of rows) {
    counts[toFleetStatus(row.state)] += 1;
  }
  return counts;
}
