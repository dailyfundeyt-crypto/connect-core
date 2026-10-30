/**
 * T3-Einstellungen — Sidecar-Status-Karte (Lane A25).
 *
 * Zeigt den Verbindungs- und Laufzeitstatus des lokalen T3-Sidecars an:
 * - Loopback-Bindung (127.0.0.1:3773)
 * - Version & Contract-Kompatibilität
 * - Separates T3-Home (%LOCALAPPDATA%\ConnectAgents\t3-home)
 * - Auto-Start-Option
 *
 * REGELN:
 *  - Keine Server-Neustarts durchführen (nur Status abfragen).
 *  - Stefans T3-Home (~/.t3, ~/.t3-hermes) wird niemals berührt.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IconCheck,
  IconClock,
  IconCpu,
  IconInfoCircle,
  IconRefresh,
  IconServer,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { fetchT3Status } from "@/lib/t3";
import type { T3StatusResponse } from "@/lib/t3/contracts";
import type { T3SidecarSettings } from "./types";

interface T3SidecarCardProps {
  settings: T3SidecarSettings;
  onChange: (patch: Partial<T3SidecarSettings>) => void;
  className?: string;
}

export function T3SidecarCard({
  settings,
  onChange,
  className,
}: T3SidecarCardProps) {
  const [manualRefreshCount, setManualRefreshCount] = useState(0);

  const {
    data: status,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery<T3StatusResponse>({
    queryKey: ["t3", "sidecar-status", manualRefreshCount],
    queryFn: () => fetchT3Status(),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const isRunning = status?.running ?? false;
  const isCompatible = status?.contractCompatible ?? true;

  const handleRefresh = async () => {
    setManualRefreshCount((c) => c + 1);
    await refetch();
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] bg-[#141413] p-4 text-[#e0deda] shadow-sm",
        className,
      )}
      data-testid="t3-sidecar-card"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg border",
              isRunning
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/30 bg-amber-500/10 text-amber-400",
            )}
          >
            <IconServer className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">T3 Sidecar-Dienst</h3>
            <p className="text-xs text-[#888]">
              Lokaler Node/Effect-Sidecar für Treiber & WS-RPC
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border",
              isRunning && isCompatible
                ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400"
                : isRunning && !isCompatible
                  ? "border-amber-500/30 bg-amber-950/40 text-amber-300"
                  : "border-red-500/30 bg-red-950/40 text-red-400",
            )}
            data-testid="sidecar-status-badge"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                isRunning ? "bg-emerald-400 animate-pulse" : "bg-red-400",
              )}
            />
            <span>
              {isRunning
                ? isCompatible
                  ? "Aktiv & Verbunden"
                  : "Inkompatibler Vertrag"
                : "Nicht erreichbar"}
            </span>
          </div>

          {/* Refresh Button */}
          <Button
            aria-label="Sidecar-Status aktualisieren"
            className="border-white/10 text-[#aaa] hover:text-white"
            disabled={isLoading || isRefetching}
            onClick={() => void handleRefresh()}
            size="sm"
            type="button"
            variant="ghost"
          >
            <IconRefresh
              className={cn("size-3.5", (isLoading || isRefetching) && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {/* Details Grid */}
      <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
        {/* Endpunkt & Port */}
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
          <span className="text-[11px] text-[#777]">Schnittstelle & Port</span>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-[#ddd]">
            <IconShieldCheck className="size-3.5 text-sky-400 shrink-0" />
            <span>
              {settings.host}:{status?.port ?? settings.port}
            </span>
            <span className="rounded bg-sky-500/10 px-1 py-0.2 text-[10px] text-sky-300">
              Nur Loopback
            </span>
          </div>
        </div>

        {/* Version & Verträge */}
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
          <span className="text-[11px] text-[#777]">Version & Verträge</span>
          <div className="mt-1 flex items-center gap-2 text-[#ddd]">
            <IconCpu className="size-3.5 text-purple-400 shrink-0" />
            <span>v{status?.version ?? "2.0.0-t3"}</span>
            <span className="text-[10px] text-[#888]">
              (Vertrag {status?.contractVersion ?? "A01"}
              {isCompatible ? " ✓" : " ⚠"})
            </span>
          </div>
        </div>

        {/* T3 Home Verzeichnis */}
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5 sm:col-span-2">
          <span className="text-[11px] text-[#777]">Isoliertes T3-Home (Connect-Sicherheit)</span>
          <div className="mt-1 font-mono text-[11px] text-[#bbb] truncate">
            {status?.home ?? settings.homePathHint}
          </div>
        </div>
      </div>

      {/* Auto-Start Switch */}
      <div className="mt-3.5 flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
        <div>
          <p className="font-medium text-white">Sidecar automatisch starten</p>
          <p className="text-[#777] text-[11px]">
            Startet den Hintergrunddienst bei Connect-Start auf Loopback 127.0.0.1
          </p>
        </div>
        <Switch
          aria-label="Sidecar automatisch starten"
          checked={settings.autoStart}
          onCheckedChange={(checked) => onChange({ autoStart: checked })}
        />
      </div>

      {/* Sicherheitshinweis */}
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-sky-500/[0.06] border border-sky-500/20 p-2.5 text-[11px] text-sky-200/90">
        <IconInfoCircle className="size-4 shrink-0 text-sky-400 mt-0.5" />
        <div>
          <strong>Sicherheits-Garantie:</strong> Der Sidecar lauscht ausschließlich auf der
          lokalen Loopback-Adresse (127.0.0.1). Er ist von außen nicht erreichbar und nutzt ein
          völlig isoliertes Profilverzeichnis. Stefans privates T3-Home bleibt unangetastet.
        </div>
      </div>

      {error ? (
        <div className="mt-2 text-xs text-red-400">
          Fehler beim Abruf des Sidecar-Status: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}
    </div>
  );
}
