/**
 * A27 – Bot-Panel: Computer-Tab
 *
 * Zeigt die Live-Screenshot-Karte der Cua-Maschine.
 *
 * Implementierung:
 *  - Aktiver Tab: Polling auf GET /api/machines/:machineId/screen?tabOpen=true
 *    (gedrosselt via useMachines / useInterval, min 333 ms ≈ 3 fps)
 *  - Schlafzustand: grauer Avatar + "Der Computer schläft"; Klick weckt.
 *  - Unterschrift: "Bildschirm von <Bot>"
 *  - Tab-Wechsel stoppt Polling (active prop wird false).
 *
 * Abhängigkeiten:
 *  - A19: /api/machines/:id/screen – vorhanden (Bericht A19 grün)
 *  - A21: useMachines – vorhanden (Bericht A21 grün)
 *  - A29: BotAvatar – fehlt → BotAvatarFallback wird genutzt
 *
 * Kein direkter Eingriff in computer-view-panel.tsx (nur import).
 */
import { IconDeviceDesktop, IconLoader2, IconPlayerPlay } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMachines } from "@/lib/t3/hooks";
import { cn } from "@/lib/utils";
import { BotAvatarFallback } from "./bot-avatar-fallback";

/** Minimales Polling-Intervall (ms). Max ≈ 3 fps, wie von A19 empfohlen. */
const POLL_INTERVAL_MS = 350;

/**
 * Holt einen Screenshot der Maschine als data-URL.
 * Nutzt den A19-Endpunkt GET /api/machines/:machineId/screen
 */
async function fetchMachineScreen(
  machineId: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/machines/${encodeURIComponent(machineId)}/screen?tabOpen=true`,
      { signal, credentials: "include" },
    );
    if (!res.ok) return null;
    const sleeping = res.headers.get("x-cua-sleeping");
    if (sleeping === "1") return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

interface ComputerTabProps {
  agentId: string;
  name: string;
  /** Wenn false: Polling gestoppt (Tab-Wechsel). */
  active: boolean;
}

/**
 * Computer-Tab des Bot-Panels.
 * Rein lesend – kein Schreiben außerhalb der Lane.
 */
export function ComputerTab({ agentId, name, active }: ComputerTabProps) {
  const { machines, sharedDefaultId, wake, loading: machinesLoading } = useMachines({
    refetchInterval: 8000,
  });

  /**
   * Maschine für diesen Agenten ermitteln:
   * Bevorzuge per-Agent-Maschine (owner === agentId), dann geteilte Standard-Maschine.
   */
  const machine =
    machines.find((m) => m.owner === agentId) ??
    machines.find((m) => m.id === sharedDefaultId) ??
    null;

  const machineId = machine?.id ?? null;
  const isSleeping =
    machine?.status === "sleeping" || machine?.status === "stopped";
  const isStarting = machine?.status === "starting";

  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  /** Für sauberes Cleanup von Object-URLs. */
  const prevUrlRef = useRef<string | null>(null);

  /** Polling-Loop – stoppt wenn !active oder Maschine schläft. */
  useEffect(() => {
    if (!active || !machineId || isSleeping || isStarting) {
      setScreenUrl(null);
      return;
    }

    let cancelled = false;
    let controller = new AbortController();

    const poll = async () => {
      while (!cancelled) {
        const before = Date.now();
        const url = await fetchMachineScreen(machineId, controller.signal);
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          break;
        }
        if (url) {
          setScreenUrl((prev) => {
            if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
            return url;
          });
        }
        // Trottle
        const elapsed = Date.now() - before;
        const wait = Math.max(0, POLL_INTERVAL_MS - elapsed);
        await new Promise<void>((r) => setTimeout(r, wait));
      }
    };

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      controller = new AbortController();
    };
  }, [active, machineId, isSleeping, isStarting]);

  // Cleanup Object-URL beim Unmount
  useEffect(
    () => () => {
      if (prevUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(prevUrlRef.current);
      }
    },
    [],
  );

  const handleWake = useCallback(async () => {
    if (!machineId || waking) return;
    setWaking(true);
    try {
      await wake(machineId);
    } finally {
      setWaking(false);
    }
  }, [machineId, wake, waking]);

  // Ladezustand: Maschinen noch nicht geladen
  if (machinesLoading && !machine) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <IconLoader2 className="size-7 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Computer wird gesucht…</p>
      </div>
    );
  }

  // Keine Maschine konfiguriert
  if (!machine) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center px-4">
        <IconDeviceDesktop className="size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">Kein Computer zugewiesen</p>
        <p className="max-w-[14rem] text-xs leading-relaxed text-muted-foreground">
          Öffne die Maschinen-Einstellungen, um diesem Bot einen Computer
          zuzuweisen.
        </p>
      </div>
    );
  }

  // Schlafzustand – grauer Avatar + Weck-Button
  if (isSleeping) {
    return (
      <SleepCard
        name={name}
        agentId={agentId}
        onWake={handleWake}
        waking={waking}
      />
    );
  }

  // Startet
  if (isStarting) {
    return (
      <figure className="overflow-hidden rounded-[18px] border border-border/80 bg-card">
        <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 p-6 text-center">
          <IconLoader2 className="size-7 animate-spin text-muted-foreground" />
          <p className="text-sm font-medium">Computer startet…</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Der Desktop erscheint sobald er bereit ist.
          </p>
        </div>
        <figcaption className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground text-center">
          Bildschirm von {name}
        </figcaption>
      </figure>
    );
  }

  // Live-Screenshot
  return (
    <figure className="overflow-hidden rounded-[18px] border border-border/80 bg-card">
      <div className="relative aspect-[16/10] w-full bg-black/5">
        {screenUrl ? (
          <img
            src={screenUrl}
            alt={`Live-Bildschirm von ${name}`}
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
            <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Bildschirm wird geladen…
            </p>
          </div>
        )}
      </div>
      <figcaption className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground text-center">
        Bildschirm von {name}
      </figcaption>
    </figure>
  );
}

/** Karte für schlafende Maschine: grauer Avatar + Weck-Button. */
function SleepCard({
  name,
  agentId,
  onWake,
  waking,
}: {
  name: string;
  agentId: string;
  onWake: () => void;
  waking: boolean;
}) {
  return (
    <figure className="overflow-hidden rounded-[18px] border border-border/80 bg-card">
      <button
        type="button"
        onClick={onWake}
        disabled={waking}
        className={cn(
          "flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 p-6 text-center",
          "transition-colors hover:bg-muted/30",
          waking && "cursor-wait",
        )}
        aria-label={`${name} wecken`}
        title="Klicken zum Wecken"
      >
        {waking ? (
          <IconLoader2 className="size-7 animate-spin text-muted-foreground" />
        ) : (
          <BotAvatarFallback
            agentId={agentId}
            name={name}
            size={56}
            sleeping
          />
        )}
        <p className="text-sm font-medium">Der Computer schläft</p>
        <p className="max-w-[14rem] text-xs leading-relaxed text-muted-foreground">
          {waking ? "Wird geweckt…" : "Klicken zum Wecken"}
        </p>
        {!waking && (
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            <IconPlayerPlay className="size-3" />
            Wecken
          </span>
        )}
      </button>
      <figcaption className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground text-center">
        Bildschirm von {name}
      </figcaption>
    </figure>
  );
}
