/**
 * T3-Einstellungen — Kontext-Rotation (Lane A25).
 *
 * Verwaltet die automatische Kontext-Rotation (Idee I5 & Lane A15):
 *  - Standard-Schwelle: 100 000 Tokens
 *  - Sichtbarkeit des Trenners „Neues Kontextfenster · Zusammenfassung“ im Chat
 *  - Handoff-Zusammenfassung durch Sub-Agenten (A16, max. 8 000 Tokens)
 *  - Turn-Ende Garantie (niemals mitten im Turn rotieren)
 */

import {
  IconCheck,
  IconFlame,
  IconHistory,
  IconInfoCircle,
  IconLayersLinked,
  IconSparkles,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { T3ContextSettings } from "./types";

interface T3ContextSectionProps {
  settings: T3ContextSettings;
  onChange: (patch: Partial<T3ContextSettings>) => void;
  className?: string;
}

const THRESHOLD_PRESETS = [
  { value: 25_000, label: "25 000", desc: "Sparsam" },
  { value: 50_000, label: "50 000", desc: "Kompakt" },
  { value: 100_000, label: "100 000", desc: "Empfohlen (I5)", badge: "Standard" },
  { value: 150_000, label: "150 000", desc: "Erweitert" },
  { value: 200_000, label: "200 000", desc: "Maximum" },
];

export function T3ContextSection({
  settings,
  onChange,
  className,
}: T3ContextSectionProps) {
  return (
    <div className={cn("space-y-4", className)} data-testid="t3-context-section">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-white">Kontext-Rotation (100k)</h3>
        <p className="text-xs text-[#888]">
          Automatischer Wechsel in ein frisches Kontextfenster bei Erreichen des Token-Limits (Idee I5 / A15).
        </p>
      </div>

      {/* Erklärungskarte (Idee I5) */}
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-3.5 text-xs text-sky-200/90 space-y-2">
        <div className="flex items-center gap-2 font-medium text-sky-100">
          <IconLayersLinked className="size-4 text-sky-400" />
          <span>Das Prinzip: Immer im selben Gespräch bleiben</span>
        </div>
        <p className="text-[11px] leading-relaxed text-sky-200/80">
          Statt lange Chats langsamer und teurer werden zu lassen, überwacht Connect den
          Token-Verbrauch. Bei Erreichen der Schwelle fasst ein Sub-Agent den bisherigen
          Verlauf kompakt zusammen (≤ 8 000 Tokens) und startet nahtlos einen frischen T3-Thread.
          Dein Gesprächsverlauf bleibt vollständig erhalten und lesbar.
        </p>
      </div>

      {/* Schwellenwert-Auswahl */}
      <div className="rounded-xl border border-white/[0.06] bg-[#141413] p-4 text-xs space-y-3">
        <div>
          <h4 className="font-medium text-white">Rotations-Schwelle</h4>
          <p className="text-[11px] text-[#777]">
            Kumulierte Tokens des Threads, ab denen die Handoff-Zusammenfassung ausgelöst wird.
          </p>
        </div>

        {/* Preset Buttons */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="threshold-presets">
          {THRESHOLD_PRESETS.map((p) => {
            const isSelected = settings.thresholdTokens === p.value;
            return (
              <button
                key={p.value}
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all",
                  isSelected
                    ? "border-sky-500 bg-sky-500/10 text-white font-medium shadow-sm"
                    : "border-white/[0.06] bg-white/[0.02] text-[#888] hover:border-white/10 hover:text-white",
                )}
                onClick={() => onChange({ thresholdTokens: p.value })}
                type="button"
                data-testid={`preset-${p.value}`}
              >
                {p.badge ? (
                  <span className="absolute -top-2 rounded-full bg-sky-500 px-1.5 py-0.2 text-[9px] font-semibold text-black uppercase">
                    {p.badge}
                  </span>
                ) : null}
                <span className="font-mono text-sm">{p.label}</span>
                <span className="text-[10px] text-[#777]">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Optionen & Schalter */}
      <div className="rounded-xl border border-white/[0.06] bg-[#141413] p-4 text-xs space-y-4">
        {/* Schalter: Trenner im Chat sichtbar */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="font-medium text-white">
              Zusammenfassung & Trenner im Chat sichtbar anzeigen
            </p>
            <p className="text-[11px] text-[#777]">
              Rendert die Karte „Neues Kontextfenster · Zusammenfassung“ als sichtbaren Trenner
            </p>
          </div>
          <Switch
            aria-label="Trenner im Chat anzeigen"
            checked={settings.showContextSwitchBadge}
            onCheckedChange={(checked) => onChange({ showContextSwitchBadge: checked })}
          />
        </div>

        {/* Schalter: Automatische Zusammenfassung */}
        <div className="flex items-center justify-between border-t border-white/[0.04] pt-3">
          <div className="space-y-0.5">
            <p className="font-medium text-white">Automatische Handoff-Zusammenfassung</p>
            <p className="text-[11px] text-[#777]">
              Erstellt die strukturierte 7-Punkte-Übergabe via Sub-Agent (A16) vor dem Wechsel
            </p>
          </div>
          <Switch
            aria-label="Automatische Handoff-Zusammenfassung"
            checked={settings.autoSummarize}
            onCheckedChange={(checked) => onChange({ autoSummarize: checked })}
          />
        </div>

        {/* Schalter: Nur am Turn-Ende */}
        <div className="flex items-center justify-between border-t border-white/[0.04] pt-3">
          <div className="space-y-0.5">
            <p className="font-medium text-white">Turn-Ende Schutzgarantie</p>
            <p className="text-[11px] text-[#777]">
              Rotiert ausschließlich nach vollständigem Abschluss des aktuellen Turns (niemals mitten im Satz)
            </p>
          </div>
          <Switch
            aria-label="Turn-Ende Schutzgarantie"
            checked={settings.rotateOnlyAtTurnEnd}
            disabled
          />
        </div>
      </div>
    </div>
  );
}
