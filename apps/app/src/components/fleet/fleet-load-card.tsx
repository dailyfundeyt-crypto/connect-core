/**
 * Die PC-Last (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Zeigt die Messungen des Ressourcen-Monitors (A09): CPU, Arbeitsspeicher,
 * Festplatte und die Zahl der laufenden CLI-Prozesse.
 *
 * Warum das in der Flotte steht: bei 40 Agenten ist die Frage „wird der PC
 * das noch tragen?" die erste Frage. Der Scheduler bremst zwar automatisch
 * (A09 drosselt bei > 85 % CPU seit 30 s), aber eine gedrosselte Flotte
 * sieht man erst, wenn nichts mehr passiert. Der Monitor sagt es vorher.
 *
 * Die Anzeige ist **kein** Dashboard mit Torten: vier Balken und eine
 * Drosselungszeile. Alles andere wäre eine Konfigurationsseite, die ihre
 * Gestalt erfunden hat.
 */

import { IconCpu, IconDatabase, IconDeviceDesktop } from "@tabler/icons-react";
import type { FleetLoad } from "./fleet-client";
import {
  formatFleetGb,
  formatFleetPercent,
} from "./fleet-format";
import { cn } from "@/lib/utils";

/** Ein Balken: Bezeichnung, Wert, Anteil (0–100) und Farbe. */
function LoadBar({
  label,
  value,
  percent,
  tone,
  hint,
}: {
  label: string;
  value: string;
  percent: number;
  tone: "ok" | "warn" | "bad";
  hint?: string;
}) {
  const toneClass =
    tone === "bad"
      ? "bg-destructive"
      : tone === "warn"
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div
        aria-hidden
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        title={hint}
      >
        <div
          className={cn("h-full rounded-full", toneClass)}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Wie viel Prozent des Speicherplatzes sind belegt?
 *
 * Die Karte zeigt den **freien** Platz als Zahl, aber der Balken muss den
 * belegten Anteil zeigen — ein Balken, der „12 GB frei" darstellen soll,
 * wäre genau dann voll, wenn nichts mehr frei ist. Das ist verwirrend.
 */
export function FleetLoadCard({ load }: { load: FleetLoad }) {
  const ramUsedPercent =
    load.ramTotalGb > 0
      ? ((load.ramTotalGb - load.ramFreeGb) / load.ramTotalGb) * 100
      : 0;

  const cpuTone: "ok" | "warn" | "bad" =
    load.cpuPercent >= 85 ? "bad" : load.cpuPercent >= 65 ? "warn" : "ok";
  const ramTone: "ok" | "warn" | "bad" =
    load.ramFreeGb <= 0
      ? "bad"
      : load.ramFreeGb < 4
        ? "bad"
        : load.ramFreeGb < 8
          ? "warn"
          : "ok";
  const diskTone: "ok" | "warn" | "bad" =
    load.diskFreeGb <= 0
      ? "bad"
      : load.diskFreeGb < 20
        ? "bad"
        : load.diskFreeGb < 50
          ? "warn"
          : "ok";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <LoadBar
          hint={`${formatFleetPercent(load.cpuAverage30sPercent)} im 30-Sekunden-Mittel`}
          label="CPU"
          percent={load.cpuPercent}
          tone={cpuTone}
          value={formatFleetPercent(load.cpuPercent)}
        />
        <LoadBar
          hint={`${formatFleetGb(load.ramFreeGb)} von ${formatFleetGb(load.ramTotalGb)} frei`}
          label="Arbeitsspeicher"
          percent={ramUsedPercent}
          tone={ramTone}
          value={`${formatFleetGb(load.ramFreeGb)} frei`}
        />
        <LoadBar
          hint="Freier Platz auf dem Systemlaufwerk"
          label="Festplatte"
          percent={0}
          tone={diskTone}
          value={`${formatFleetGb(load.diskFreeGb)} frei`}
        />
        <LoadBar
          hint="Laufende CLI-Prozesse (Codex, Claude, Antigravity …)"
          label="CLI-Prozesse"
          percent={0}
          tone={load.cliProcessCount > 12 ? "warn" : "ok"}
          value={String(load.cliProcessCount)}
        />
      </div>

      {load.throttled ? (
        <p
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-xs"
          role="status"
        >
          <IconDeviceDesktop className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-medium">Drosselung aktiv.</strong>{" "}
            {load.reason ??
              "Der Scheduler startet keine neuen Turns, bis die Last sinkt."}
          </span>
        </p>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground text-xs">
          <IconDatabase className="size-4" />
          Keine Drosselung — der Scheduler darf neue Turns starten.
        </p>
      )}

      <p className="flex items-center gap-2 text-muted-foreground text-xs">
        <IconCpu className="size-4" />
        Die Messung läuft alle 5 Sekunden und kommt aus dem Ressourcen-Monitor.
      </p>
    </div>
  );
}
