/**
 * T3-Einstellungen — Haupt-Panel (Lane A25).
 *
 * Führt alle 5 Bereiche der T3-Integration in den Connect-Settings zusammen:
 *  1. Sidecar-Status & Loopback-Bindung
 *  2. CLIs & Provider (Status, In-T3-anmelden-Hinweis, keine Key-Felder)
 *  3. Gleichzeitigkeit (gesamt/pro CLI) & Scheduler
 *  4. Kontext-Rotation (Schwelle 100 000, Zusammenfassung sichtbar)
 *  5. Token-Sparen (5 Regeln an/aus, Invarianz-Garantie)
 *
 * REGELN:
 *  - Hinter dem Feature-Flag `bridge` (A01). Flag aus = defensives Verhalten.
 *  - Reines Connect-Design (Karten, Headers, Tabler-Icons).
 *  - Keine Secrets / Key-Eingaben.
 */

import { useState } from "react";
import {
  IconActivity,
  IconCheck,
  IconCoins,
  IconCpu,
  IconFlame,
  IconLayersLinked,
  IconRefresh,
  IconRotate,
  IconServer,
  IconShieldLock,
  IconTerminal2,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getT3Flag } from "@/lib/t3/contracts";
import { T3SidecarCard } from "./t3-sidecar-card";
import { T3ClisSection } from "./t3-clis-section";
import { T3ConcurrencySection } from "./t3-concurrency-section";
import { T3ContextSection } from "./t3-context-section";
import { T3TokenSavingSection } from "./t3-token-saving-section";
import { useT3UnifiedSettings } from "./storage";
import type {
  T3ConcurrencySettings,
  T3ContextSettings,
  T3SidecarSettings,
  T3TokenSavingSettings,
} from "./types";

export type T3SettingsTab =
  | "all"
  | "sidecar"
  | "clis"
  | "concurrency"
  | "context"
  | "token-saving";

interface T3SettingsPanelProps {
  className?: string;
  defaultTab?: T3SettingsTab;
}

export function T3SettingsPanel({
  className,
  defaultTab = "all",
}: T3SettingsPanelProps) {
  const isFlagActive = getT3Flag("bridge");
  const { settings, updateSettings, resetSettings } = useT3UnifiedSettings();
  const [activeTab, setActiveTab] = useState<T3SettingsTab>(defaultTab);
  const [justSaved, setJustSaved] = useState(false);

  const handleSidecarChange = (patch: Partial<T3SidecarSettings>) => {
    updateSettings({ sidecar: patch });
    triggerSaved();
  };

  const handleConcurrencyChange = (patch: Partial<T3ConcurrencySettings>) => {
    updateSettings({ concurrency: patch });
    triggerSaved();
  };

  const handleContextChange = (patch: Partial<T3ContextSettings>) => {
    updateSettings({ context: patch });
    triggerSaved();
  };

  const handleTokenSavingChange = (patch: Partial<T3TokenSavingSettings>) => {
    updateSettings({ tokenSaving: patch });
    triggerSaved();
  };

  const triggerSaved = () => {
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  // Feature-Flag Guard: Wenn Flag bridge aus ist, altes Verhalten bzw. dezenter Hinweis
  if (!isFlagActive) {
    return (
      <div
        className={cn(
          "rounded-xl border border-white/[0.08] bg-[#141413] p-6 text-center text-xs",
          className,
        )}
        data-testid="t3-flag-disabled"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-white/[0.04] text-[#888]">
          <IconShieldLock className="size-6 text-[#777]" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-white">T3-Integration inaktiv</h3>
        <p className="mt-1 max-w-md mx-auto text-[#888] leading-relaxed">
          Das Feature-Flag <code className="font-mono text-sky-400">bridge</code> ist derzeit
          deaktiviert. Die T3-Erweiterungen (CLIs, Concurrency, 100k-Kontext-Rotation und
          Token-Sparen) verbleiben im Ruhezustand.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn("space-y-6 text-[#e0deda]", className)}
      data-testid="t3-settings-panel"
    >
      {/* Oberer Titelbereich */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">T3 Backend-Einstellungen</h2>
            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400 border border-sky-500/20">
              I1 Integration
            </span>
            {justSaved ? (
              <span
                className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 animate-fade-in"
                data-testid="saved-indicator"
              >
                <IconCheck className="size-3.5" /> Gespeichert
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-[#888]">
            Sidecar-Status, Anbieter-CLIs, Gleichzeitigkeit, automatische 100k-Kontext-Rotation und
            Token-Spar-Regeln.
          </p>
        </div>

        {/* Aktionen */}
        <div className="flex items-center gap-2">
          <Button
            className="border-white/10 text-xs text-[#888] hover:text-white"
            onClick={() => {
              resetSettings();
              triggerSaved();
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <IconRotate className="mr-1.5 size-3.5" />
            Standardwerte
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-white/[0.03] p-1 border border-white/[0.04]">
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
            activeTab === "all"
              ? "bg-white/10 text-white font-medium"
              : "text-[#888] hover:text-white",
          )}
          onClick={() => setActiveTab("all")}
          type="button"
        >
          Alle Bereiche
        </button>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
            activeTab === "sidecar"
              ? "bg-white/10 text-white font-medium"
              : "text-[#888] hover:text-white",
          )}
          onClick={() => setActiveTab("sidecar")}
          type="button"
        >
          <IconServer className="size-3.5 text-emerald-400" />
          Sidecar
        </button>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
            activeTab === "clis"
              ? "bg-white/10 text-white font-medium"
              : "text-[#888] hover:text-white",
          )}
          onClick={() => setActiveTab("clis")}
          type="button"
        >
          <IconTerminal2 className="size-3.5 text-sky-400" />
          CLIs & Provider
        </button>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
            activeTab === "concurrency"
              ? "bg-white/10 text-white font-medium"
              : "text-[#888] hover:text-white",
          )}
          onClick={() => setActiveTab("concurrency")}
          type="button"
        >
          <IconActivity className="size-3.5 text-amber-400" />
          Gleichzeitigkeit
        </button>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
            activeTab === "context"
              ? "bg-white/10 text-white font-medium"
              : "text-[#888] hover:text-white",
          )}
          onClick={() => setActiveTab("context")}
          type="button"
        >
          <IconLayersLinked className="size-3.5 text-purple-400" />
          Kontext (100k)
        </button>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
            activeTab === "token-saving"
              ? "bg-white/10 text-white font-medium"
              : "text-[#888] hover:text-white",
          )}
          onClick={() => setActiveTab("token-saving")}
          type="button"
        >
          <IconCoins className="size-3.5 text-emerald-400" />
          Token-Sparen
        </button>
      </div>

      {/* Inhalt je nach gewähltem Tab */}
      <div className="space-y-6">
        {/* 1. Sidecar */}
        {(activeTab === "all" || activeTab === "sidecar") && (
          <section className="space-y-3">
            <T3SidecarCard
              onChange={handleSidecarChange}
              settings={settings.sidecar}
            />
          </section>
        )}

        {/* 2. CLIs & Provider */}
        {(activeTab === "all" || activeTab === "clis") && (
          <section className="space-y-3">
            <T3ClisSection />
          </section>
        )}

        {/* 3. Gleichzeitigkeit */}
        {(activeTab === "all" || activeTab === "concurrency") && (
          <section className="space-y-3">
            <T3ConcurrencySection
              onChange={handleConcurrencyChange}
              settings={settings.concurrency}
            />
          </section>
        )}

        {/* 4. Kontext-Rotation */}
        {(activeTab === "all" || activeTab === "context") && (
          <section className="space-y-3">
            <T3ContextSection
              onChange={handleContextChange}
              settings={settings.context}
            />
          </section>
        )}

        {/* 5. Token-Sparen */}
        {(activeTab === "all" || activeTab === "token-saving") && (
          <section className="space-y-3">
            <T3TokenSavingSection
              onChange={handleTokenSavingChange}
              settings={settings.tokenSaving}
            />
          </section>
        )}
      </div>
    </div>
  );
}
