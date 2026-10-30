/**
 * Die Flotten-Ansicht (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Eine Seite, drei Dinge:
 *
 *  1. **Die Summen** — wie viele Agenten laufen, warten, schlafen, Fehler
 *     haben; wie viele Tokens heute verbraucht wurden.
 *  2. **Die PC-Last** — CPU, RAM, Platte, CLI-Prozesse (A09).
 *  3. **Die Agenten** — als Tabelle oder als Raster.
 *
 * Und ein Knopf: „Agenten anlegen“, der den Dialog mit der Backlog-Vorschau
 * öffnet.
 *
 * Das Feature-Flag `bridge` (A01) entscheidet, ob die Seite überhaupt
 * etwas zeigt. Flag aus = die Seite bleibt leer (kein „deaktiviert“-Kasten —
 * der wäre eine Anzeige für eine Funktion, die es nicht gibt).
 */

import {
  IconLayoutGrid,
  IconPlus,
  IconRefresh,
  IconTable,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getT3Flag } from "@/lib/t3/contracts";
import { cn } from "@/lib/utils";

import { FleetBatchCreateDialog } from "./fleet-batch-create-dialog";
import { fetchFleetOverview, type FleetAgentRow } from "./fleet-client";
import { FleetLoadCard } from "./fleet-load-card";
import {
  FLEET_STATUS_LABEL,
  FLEET_STATUS_ORDER,
  countByStatus,
  toFleetStatus,
} from "./fleet-status";
import { FleetGrid, FleetTable } from "./fleet-table";
import { formatFleetCost, formatFleetTokens } from "./fleet-format";

/** Die beiden Sichten auf dieselben Daten. */
type FleetViewMode = "table" | "grid";

/** Was gesucht wird. */
function matches(agent: FleetAgentRow, needle: string): boolean {
  if (!needle) return true;
  const lower = needle.toLowerCase();
  return (
    agent.name.toLowerCase().includes(lower) ||
    (agent.title ?? "").toLowerCase().includes(lower) ||
    (agent.cli ?? "").toLowerCase().includes(lower) ||
    FLEET_STATUS_LABEL[toFleetStatus(agent.state)].toLowerCase().includes(lower)
  );
}

export function FleetView({ className }: { className?: string }) {
  const enabled = getT3Flag("bridge");

  const [mode, setMode] = useState<FleetViewMode>("table");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useQuery({
    queryKey: ["t3", "fleet"],
    queryFn: fetchFleetOverview,
    enabled,
    refetchInterval: enabled ? 10000 : undefined,
  });

  const overview = query.data;
  const agents = useMemo(() => overview?.agents ?? [], [overview]);
  const filtered = useMemo(
    () => agents.filter((agent) => matches(agent, search.trim())),
    [agents, search],
  );
  const counts = useMemo(() => countByStatus(agents), [agents]);

  if (!enabled) return null;

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* ----------------- Summen ----------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <span className="text-muted-foreground text-xs">Agenten</span>
          <span className="block font-bold text-2xl tabular-nums">
            {overview?.summary.total ?? 0}
          </span>
          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {FLEET_STATUS_ORDER.map((status) => (
              <span className="text-muted-foreground" key={status}>
                {FLEET_STATUS_LABEL[status]}:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {counts[status]}
                </span>
              </span>
            ))}
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <span className="text-muted-foreground text-xs">Tokens heute</span>
          <span className="block font-bold text-2xl tabular-nums">
            {formatFleetTokens(overview?.summary.tokensToday ?? 0)}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatFleetCost(overview?.summary.costTodayUsd ?? 0)} im laufenden Tag
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <span className="text-muted-foreground text-xs">Gleichzeitig</span>
          <span className="block font-bold text-2xl tabular-nums">
            {overview?.summary.running ?? 0}
          </span>
          <span className="text-muted-foreground text-xs">
            von {overview?.limits.maxConcurrentTurns ?? "—"} erlaubten Turns
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <span className="text-muted-foreground text-xs">Warteschlange</span>
          <span className="block font-bold text-2xl tabular-nums">
            {overview?.summary.queued ?? 0}
          </span>
          <span className="text-muted-foreground text-xs">
            {overview?.summary.waitingApproval ?? 0} warten auf eine Freigabe
          </span>
        </div>
      </div>

      {/* ----------------- PC-Last ----------------- */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold text-sm">PC-Last</h2>
        <FleetLoadCard load={overview?.load ?? EMPTY_LOAD} />
      </section>

      {/* ----------------- Die Agenten ----------------- */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2">
            <Input
              aria-label="Agenten suchen"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nach Name, CLI oder Zustand suchen …"
              value={search}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              <button
                aria-label="Als Tabelle anzeigen"
                className={cn(
                  "rounded-md px-2 py-1 text-muted-foreground transition-colors",
                  mode === "table" && "bg-muted text-foreground",
                )}
                onClick={() => setMode("table")}
                type="button"
              >
                <IconTable className="size-4" />
              </button>
              <button
                aria-label="Als Raster anzeigen"
                className={cn(
                  "rounded-md px-2 py-1 text-muted-foreground transition-colors",
                  mode === "grid" && "bg-muted text-foreground",
                )}
                onClick={() => setMode("grid")}
                type="button"
              >
                <IconLayoutGrid className="size-4" />
              </button>
            </div>

            <Button
              disabled={query.isPending}
              onClick={() => void query.refetch()}
              size="icon"
              type="button"
              variant="outline"
            >
              <IconRefresh />
              <span className="sr-only">Neu laden</span>
            </Button>

            <Button onClick={() => setDialogOpen(true)} type="button">
              <IconPlus />
              Agenten anlegen
            </Button>
          </div>
        </div>

        {query.isError ? (
          <p className="mt-4 text-destructive text-sm" role="alert">
            Die Flotten-Ansicht konnte nicht geladen werden.
          </p>
        ) : null}

        {mode === "table" ? (
          <FleetTable agents={filtered} />
        ) : (
          <FleetGrid agents={filtered} />
        )}
      </section>

      <FleetBatchCreateDialog
        onCreated={() => void query.refetch()}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
      />
    </div>
  );
}

/** Die Last, wenn der Monitor noch keine Messung geliefert hat. */
const EMPTY_LOAD = {
  cpuPercent: 0,
  cpuAverage30sPercent: 0,
  ramFreeGb: 0,
  ramTotalGb: 0,
  diskFreeGb: 0,
  cliProcessCount: 0,
  throttled: false,
  reason: null,
};

export default FleetView;
