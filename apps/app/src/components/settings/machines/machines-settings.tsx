/**
 * Cua-Maschinen-Einstellungen — Haupt-Panel
 *
 * Lane: A26 (Maschinen-Einstellungen & Onboarding)
 * Ersetzt später per A39 die alte ubuntu-machines-settings.tsx hinter Feature-Flag.
 *
 * AKZEPTANZKRITERIEN:
 * - Hinter Feature-Flag cuaMachines (A01); Flag aus = altes Verhalten.
 * - Standard-Maschine „Lokal (alle Bots)“ immer oben; „+ Maschine hinzufügen“.
 * - Zuweisung Bot → Maschine (Standard: geteilte lokale).
 * - Maschinen-Modus: Standard „Eine Maschine für alle Agenten“; Umschalten zeigt Vorschau ohne „löschen“.
 */

import * as React from "react";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Server, Shield, Cpu, RefreshCw, AlertCircle } from "lucide-react";
import { getT3Flag } from "@/lib/t3/contracts";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { PageEmpty, PageSection } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { UbuntuMachinesPanel as LegacyUbuntuMachinesPanel } from "@/components/settings/ubuntu-machines-settings";
import { agentListQueryOptions } from "@/lib/agents/queries";
import type { Machine, MachineMode, MachineStatus } from "./types";
import {
  getMachinesList,
  getMachineMode,
  fetchCuaDoctor,
} from "./machines-api";
import { MachineList } from "./machine-list";
import { MachineModeSetting } from "./machine-mode-setting";
import { AgentMachineAssignmentList } from "./agent-machine-assignment";

export interface MachinesSettingsPanelProps {
  /** Erzwingt Cua-Interface unabhängig vom Feature-Flag (z.B. für Tests oder Preview) */
  forceCua?: boolean;
  mock?: boolean;
}

export function MachinesSettingsPanel({ forceCua = false, mock = false }: MachinesSettingsPanelProps) {
  const queryClient = useQueryClient();
  const cuaFlagActive = forceCua || getT3Flag("cuaMachines");

  // Wenn Flag aus ist: altes Verhalten rendern (Regel: Flag aus = altes Verhalten)
  if (!cuaFlagActive) {
    return <LegacyUbuntuMachinesPanel />;
  }

  return <CuaMachinesView mock={mock} />;
}

function CuaMachinesView({ mock = false }: { mock?: boolean }) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [sharedDefaultId, setSharedDefaultId] = useState<string | null>(null);
  const [mode, setMode] = useState<MachineMode>("shared");
  const [doctorInfo, setDoctorInfo] = useState<{
    available: boolean;
    wsl2: boolean;
    virtualization: boolean;
    version?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Agenten abrufen (Connect-Standard-Query)
  const agentsQuery = useQuery({
    ...agentListQueryOptions(),
    retry: false,
  });

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [machinesData, modeData, doctorData] = await Promise.all([
        getMachinesList({ mock }),
        getMachineMode({ mock }),
        fetchCuaDoctor({ mock }),
      ]);

      setMachines(machinesData.machines);
      setSharedDefaultId(machinesData.sharedDefaultId);
      setMode(modeData);
      setDoctorInfo({
        available: doctorData.available,
        wsl2: doctorData.wsl2Available,
        virtualization: doctorData.virtualizationEnabled,
        version: doctorData.version,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden der Maschinen-Daten");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [mock]);

  const handleMachineAdded = (newMachine: Machine) => {
    setMachines((prev) => [...prev, newMachine]);
  };

  const handleStatusChanged = (machineId: string, newStatus: MachineStatus) => {
    setMachines((prev) =>
      prev.map((m) => (m.id === machineId ? { ...m, status: newStatus } : m)),
    );
  };

  const handleModeChanged = (newMode: MachineMode) => {
    setMode(newMode);
    // Bei Wechsel auf per_agent oder shared Maschinen neu laden
    void loadData();
  };

  const bots = (agentsQuery.data ?? []).map((agent) => ({
    id: agent.id,
    name: agent.name || agent.title || "Unbenannter Bot",
    title: agent.title,
  }));

  // Fallback-Bot für leere Listen / Offline-Tests
  const effectiveBots = bots.length > 0 ? bots : [
    { id: "agent-default", name: "Standard-Agent", title: "Allround-Assistent" },
  ];

  return (
    <>
      <SettingsSectionHeader
        title="Maschinen & Sandboxes"
        description="Lokale Cua-Sandboxes auf diesem Rechner. Ihre Bots führen Terminal-Befehle, Dateioperationen und Skripte in sicheren, isolierten Umgebungen aus."
      />

      <div className="space-y-6">
        {/* Preflight-Diagnose Banner */}
        {doctorInfo && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-primary" />
              <span>
                Cua-CLI:{" "}
                <strong className="font-medium text-foreground">
                  {doctorInfo.available ? `Bereit (v${doctorInfo.version || "1.0"})` : "Nicht verfügbar"}
                </strong>
                {" · "}
                WSL2/Hyper-V:{" "}
                <strong className="font-medium text-foreground">
                  {doctorInfo.wsl2 ? "Aktiv" : "Inaktiv"}
                </strong>
                {" · "}
                Virtualisierung:{" "}
                <strong className="font-medium text-foreground">
                  {doctorInfo.virtualization ? "Aktiviert" : "Deaktiviert"}
                </strong>
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadData()}
              className="h-6 gap-1 px-2 text-[11px]"
            >
              <RefreshCw className="size-3" />
              Aktualisieren
            </Button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        {isLoading ? (
          <PageEmpty>Maschinen werden geladen…</PageEmpty>
        ) : (
          <>
            {/* 1. Maschinen-Modus */}
            <MachineModeSetting
              currentMode={mode}
              agentCount={effectiveBots.length}
              onModeChanged={handleModeChanged}
              mock={mock}
            />

            {/* 2. Liste der Maschinen (Standard immer oben) */}
            <MachineList
              machines={machines}
              sharedDefaultId={sharedDefaultId}
              onMachineAdded={handleMachineAdded}
              onStatusChanged={handleStatusChanged}
              mock={mock}
            />

            {/* 3. Zuweisung Bot -> Maschine */}
            <AgentMachineAssignmentList
              bots={effectiveBots}
              machines={machines}
              sharedDefaultMachineId={sharedDefaultId}
              mock={mock}
            />
          </>
        )}
      </div>
    </>
  );
}
