import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ConductorRuntimeStatus } from "./types";
import {
  IconClock,
  IconAlertTriangle,
  IconCheck,
  IconHourglassEmpty,
} from "@tabler/icons-react";

export interface ConductorCooldownsProps {
  runtimes: ConductorRuntimeStatus[];
  cooldownMin?: number;
  className?: string;
}

function formatRemainingTime(cooldownUntil: string | null | undefined): string {
  if (!cooldownUntil) return "0s";
  const target = new Date(cooldownUntil).getTime();
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "Abgelaufen (Prüfung folgt)";
  const sec = Math.floor(diffMs / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export function ConductorCooldowns({
  runtimes,
  cooldownMin = 30,
  className,
}: ConductorCooldownsProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const runtimesWithCooldown = runtimes.filter(
    (r) => r.state === "cooldown" || r.cooldownUntil || r.state === "auth_error"
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] bg-[#121216] p-4 text-[#ededef] shadow-sm flex flex-col gap-3.5",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
            <IconHourglassEmpty className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">
              Cooldowns & Runtime-Sperren
            </h3>
            <p className="text-xs text-zinc-400">
              Automatische Wartezeiten bei Quota-/Auth-Überschreitung (Standard: {cooldownMin} Min.)
            </p>
          </div>
        </div>
      </div>

      {runtimesWithCooldown.length === 0 ? (
        <div className="rounded-lg border border-white/[0.04] bg-[#0d0d11] p-5 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
          <IconCheck className="size-4 text-emerald-400" />
          <span>Keine Runtimes im Cooldown. Alle konfigurierten Instanzen sind einsatzbereit.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {runtimesWithCooldown.map((rt) => (
            <div
              key={rt.runtimeId}
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white uppercase tracking-wider font-mono">
                  {rt.cliKind}
                </span>
                <span className="rounded bg-amber-500/20 text-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  {rt.state}
                </span>
              </div>

              <div className="text-[11px] text-zinc-400 space-y-1">
                <div>
                  Konto: <span className="font-mono text-zinc-200">{rt.accountId}</span>
                </div>
                <div>
                  Fehlerklasse:{" "}
                  <span className="font-semibold text-amber-400 uppercase">
                    {rt.lastFailureClass || "quota"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-amber-300 font-mono font-medium pt-1">
                  <IconClock className="size-3.5" />
                  <span>Verbleibend: {formatRemainingTime(rt.cooldownUntil)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
