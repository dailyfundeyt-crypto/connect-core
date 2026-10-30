/**
 * Die Flotten-Tabelle (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Eine Tabelle, kein Raster aus Karten. Der Grund: die Flotte ist eine
 * **Liste zum Abgleichen** — man sucht den einen Agenten, der wartet, und
 * sieht daneben, wie viele Tokens er heute verbraucht hat und wann er zuletzt
 * gelaufen ist. Das ist eine Tabelle, und das ist die einzige Tabelle in
 * Connect (`admin/audit.tsx` ist die andere).
 *
 * Aus demselben Grund ist die Ansicht `wide`: eine Tabelle, die man scannt,
 * darf nicht in die Prosa-Spalte gezwungen werden.
 *
 * Die Spalten: Agent · Status · CLI · Tokens heute · Kosten · Warteschlange ·
 * Letzte Aktivität · Arbeitsordner. Keine Spalte ist verzichtbar — jede
 * beantwortet eine Frage, die Stefan in dieser Ansicht stellt.
 */

import { IconAlertTriangle } from "@tabler/icons-react";
import {
  FLEET_STATUS_DOT_CLASS,
  FLEET_STATUS_LABEL,
  toFleetStatus,
} from "./fleet-status";
import {
  formatFleetActivity,
  formatFleetCost,
  formatFleetTokens,
  formatQueuePosition,
} from "./fleet-format";
import type { FleetAgentRow, FleetCliId } from "./fleet-client";
import { FLEET_CLI_LABELS } from "./fleet-client";
import { cn } from "@/lib/utils";

/** Die CLI-Anzeige; unbekannte CLIs kommen roh zurück. */
export function cliLabel(cli: string | null): string {
  if (!cli) return "—";
  if (cli in FLEET_CLI_LABELS) {
    return FLEET_CLI_LABELS[cli as FleetCliId];
  }
  return cli;
}

export function FleetTable({
  agents,
  onOpenAgent,
}: {
  agents: readonly FleetAgentRow[];
  /** Wird beim Klick auf den Namen aufgerufen (Chat öffnen). */
  onOpenAgent?: (agent: FleetAgentRow) => void;
}) {
  if (agents.length === 0) {
    return (
      <p className="mt-4 text-muted-foreground text-sm">
        Keine Agenten entsprechen diesem Filter.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground text-xs uppercase">
          <tr className="border-border border-b">
            <th className="px-4 py-2 font-medium">Agent</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">CLI</th>
            <th className="px-4 py-2 font-medium text-right">Tokens heute</th>
            <th className="px-4 py-2 font-medium text-right">Kosten</th>
            <th className="px-4 py-2 font-medium">Warteschlange</th>
            <th className="px-4 py-2 font-medium">Letzte Aktivität</th>
            <th className="px-4 py-2 font-medium">Arbeitsordner</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => {
            const status = toFleetStatus(agent.state);
            return (
              <tr
                className="border-border border-t align-middle hover:bg-muted/40"
                key={agent.agentId}
              >
                <td className="px-4 py-2">
                  {onOpenAgent ? (
                    <button
                      className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() => onOpenAgent(agent)}
                      type="button"
                    >
                      {agent.name}
                    </button>
                  ) : (
                    <span className="font-medium">{agent.name}</span>
                  )}
                  {agent.title ? (
                    <div className="text-muted-foreground text-xs">{agent.title}</div>
                  ) : null}
                </td>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full",
                        FLEET_STATUS_DOT_CLASS[status],
                      )}
                    />
                    {FLEET_STATUS_LABEL[status]}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {cliLabel(agent.cli)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatFleetTokens(agent.tokensToday)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {formatFleetCost(agent.costTodayUsd)}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatQueuePosition(agent.queuePosition)}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {formatFleetActivity(agent.lastActivityAt)}
                </td>
                <td className="max-w-[18rem] px-4 py-2">
                  {agent.workspacePath ? (
                    <span
                      className="block truncate font-mono text-muted-foreground text-xs"
                      title={agent.workspacePath}
                    >
                      {agent.workspacePath}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Die Raster-Ansicht: eine Kachel je Agent.
 *
 * Das ist die zweite Sicht auf dieselben Daten, kein zweiter Datensatz. Wer
 * 40 Agenten im Kopf haben will, liest sie als Kacheln; wer den einen
 * wartenden Agenten sucht, braucht die Tabelle.
 */
export function FleetGrid({
  agents,
  onOpenAgent,
}: {
  agents: readonly FleetAgentRow[];
  onOpenAgent?: (agent: FleetAgentRow) => void;
}) {
  if (agents.length === 0) {
    return (
      <p className="mt-4 text-muted-foreground text-sm">
        Keine Agenten entsprechen diesem Filter.
      </p>
    );
  }

  return (
    <div
      className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      data-testid="fleet-grid"
    >
      {agents.map((agent) => {
        const status = toFleetStatus(agent.state);
        return (
          <button
            className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            key={agent.agentId}
            onClick={() => onOpenAgent?.(agent)}
            type="button"
          >
            <span className="flex items-center gap-2">
              <span
                aria-label={FLEET_STATUS_LABEL[status]}
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  FLEET_STATUS_DOT_CLASS[status],
                )}
                role="img"
              />
              <span className="truncate font-medium">{agent.name}</span>
            </span>
            <span className="text-muted-foreground text-xs">
              {cliLabel(agent.cli)} · {formatFleetTokens(agent.tokensToday)} Tokens ·{" "}
              {formatFleetActivity(agent.lastActivityAt)}
            </span>
            {agent.state === "error" ? (
              <span className="inline-flex items-center gap-1 text-destructive text-xs">
                <IconAlertTriangle className="size-3.5" />
                {FLEET_STATUS_LABEL.error}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
