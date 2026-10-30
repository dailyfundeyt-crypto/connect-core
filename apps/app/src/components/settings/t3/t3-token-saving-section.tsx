/**
 * T3-Einstellungen — Token-Sparen (Lane A25).
 *
 * Verwaltet die 5 Token-Spar-Regeln (Lane A14):
 *  - Master-Schalter für Token-Sparen
 *  - Regel 1: Befehlsausgaben kürzen (Head + Tail erhalten)
 *  - Regel 2: Doppelte Tool-Ausgaben deduplizieren (Hash-Referenz)
 *  - Regel 3: Dateianhänge nur als Pfad übergeben
 *  - Regel 4: Redundante System-Prompts verdichten
 *  - Regel 5: Günstige Economy-Modelle für Hilfsaufgaben
 *
 * STRIKTE INVARIANZ-GARANTIE:
 *  Keine Regel modifiziert jemals Nutzer-Text! Der Original-Prompt bleibt byte-exakt erhalten.
 */

import {
  IconCheck,
  IconCoins,
  IconCommand,
  IconFileCode,
  IconFilter,
  IconInfoCircle,
  IconScissors,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { T3TokenSavingSettings } from "./types";

interface T3TokenSavingSectionProps {
  settings: T3TokenSavingSettings;
  onChange: (patch: Partial<T3TokenSavingSettings>) => void;
  className?: string;
}

export function T3TokenSavingSection({
  settings,
  onChange,
  className,
}: T3TokenSavingSectionProps) {
  const isMasterEnabled = settings.enabled;

  return (
    <div className={cn("space-y-4", className)} data-testid="t3-token-saving-section">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-white">Token-Spar-Regeln (A14)</h3>
        <p className="text-xs text-[#888]">
          Stefans Spar-Prinzip: So wenig Tokens wie möglich verbrauchen, ohne Qualität zu verlieren.
        </p>
      </div>

      {/* Strikte Invarianz-Garantie (WICHTIG) */}
      <div
        className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3.5 text-xs text-emerald-200/90"
        data-testid="invariance-guarantee-box"
      >
        <div className="flex items-start gap-2.5">
          <IconShieldCheck className="size-4 shrink-0 text-emerald-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-emerald-100">
              Strikte Invarianz-Garantie für Nutzer-Text
            </p>
            <p className="text-[11px] leading-relaxed text-emerald-200/80">
              Keine Spar-Regel darf jemals deine eingegebene Nachricht verändern. Dein Prompt bleibt
              immer byte- und zeichen-exakt erhalten. Optimierungen betreffen ausschließlich
              Tool-Ausgaben, Datei-Anhänge, System-Instruktionen und Hilfsaufgaben.
            </p>
          </div>
        </div>
      </div>

      {/* Master-Schalter */}
      <div className="rounded-xl border border-white/[0.08] bg-[#141413] p-4 text-xs">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <IconCoins className="size-4 text-amber-400" />
              <h4 className="font-medium text-white">Token-Sparen aktiv (Global)</h4>
            </div>
            <p className="text-[11px] text-[#777]">
              Aktiviert die automatische Optimierung und Analyse von Einsparungen
            </p>
          </div>
          <Switch
            aria-label="Token-Sparen aktiv"
            checked={settings.enabled}
            onCheckedChange={(checked) => onChange({ enabled: checked })}
          />
        </div>
      </div>

      {/* Die 5 Kernregeln */}
      <div
        className={cn(
          "rounded-xl border border-white/[0.06] bg-[#141413] p-4 text-xs space-y-4 transition-opacity",
          !isMasterEnabled && "opacity-50 pointer-events-none",
        )}
      >
        <h4 className="font-medium text-white">5 Kernregeln einzeln steuern</h4>

        {/* Regel 1: Befehlsausgaben kürzen */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-medium text-white">
              <IconScissors className="size-3.5 text-sky-400" />
              <span>Regel 1: Lange Befehlsausgaben kürzen</span>
            </div>
            <p className="text-[11px] text-[#777]">
              Lange Terminal- und Tool-Outputs über 25 Zeilen behalten Kopf (10) und Fuß (10). Der
              Mittelteil wird durch einen Auslassungshinweis ersetzt.
            </p>
          </div>
          <Switch
            aria-label="Befehlsausgaben kürzen"
            checked={settings.truncateCommandOutputs}
            onCheckedChange={(checked) => onChange({ truncateCommandOutputs: checked })}
          />
        </div>

        {/* Regel 2: Doppelte Tool-Ausgaben deduplizieren */}
        <div className="flex items-start justify-between gap-3 border-t border-white/[0.04] pt-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-medium text-white">
              <IconFilter className="size-3.5 text-purple-400" />
              <span>Regel 2: Doppelte Tool-Ausgaben deduplizieren</span>
            </div>
            <p className="text-[11px] text-[#777]">
              Wiederholte identische Ausgaben desselben Befehls (z. B. wiederholtes git status) werden
              beim 2. Mal durch eine SHA-256 Hash-Referenz ersetzt.
            </p>
          </div>
          <Switch
            aria-label="Doppelte Tool-Ausgaben deduplizieren"
            checked={settings.deduplicateToolOutputs}
            onCheckedChange={(checked) => onChange({ deduplicateToolOutputs: checked })}
          />
        </div>

        {/* Regel 3: Anhänge als Pfad */}
        <div className="flex items-start justify-between gap-3 border-t border-white/[0.04] pt-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-medium text-white">
              <IconFileCode className="size-3.5 text-emerald-400" />
              <span>Regel 3: Große Anhänge nur als Pfad</span>
            </div>
            <p className="text-[11px] text-[#777]">
              Wenn die CLI lokalen Dateizugriff auf das Arbeitsverzeichnis hat, wird der Dateipfad
              übergeben statt der gesamte Dateiinhalt im Prompt.
            </p>
          </div>
          <Switch
            aria-label="Anhänge nur als Pfad"
            checked={settings.attachmentsAsPath}
            onCheckedChange={(checked) => onChange({ attachmentsAsPath: checked })}
          />
        </div>

        {/* Regel 4: System-Prompts verdichten */}
        <div className="flex items-start justify-between gap-3 border-t border-white/[0.04] pt-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-medium text-white">
              <IconSparkles className="size-3.5 text-amber-400" />
              <span>Regel 4: Redundante System-Prompts verdichten</span>
            </div>
            <p className="text-[11px] text-[#777]">
              Entfernt geschwätzige Höflichkeitsfloskeln, redundante Füllwörter und überflüssige
              Leerzeilen aus internen System-Prompts.
            </p>
          </div>
          <Switch
            aria-label="System-Prompts verdichten"
            checked={settings.compactSystemInstructions}
            onCheckedChange={(checked) => onChange({ compactSystemInstructions: checked })}
          />
        </div>

        {/* Regel 5: Economy-Modelle */}
        <div className="flex items-start justify-between gap-3 border-t border-white/[0.04] pt-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-medium text-white">
              <IconCoins className="size-3.5 text-rose-400" />
              <span>Regel 5: Kostengünstige Economy-Modelle für Hilfsaufgaben</span>
            </div>
            <p className="text-[11px] text-[#777]">
              Automatische Zuweisung günstiger Modelle (Claude Haiku, GPT-4o-mini, Gemini Flash) für
              Zusammenfassungen und Thread-Titel.
            </p>
          </div>
          <Switch
            aria-label="Economy-Modelle für Hilfsaufgaben"
            checked={settings.economyModelForAuxiliary}
            onCheckedChange={(checked) => onChange({ economyModelForAuxiliary: checked })}
          />
        </div>
      </div>

      {/* T3 Prompt-Caching & Slash-Befehl Info */}
      <div className="rounded-xl border border-white/[0.06] bg-[#141413] p-4 text-xs space-y-3">
        <h4 className="font-medium text-white">T3-Mechanismen im Hintergrund</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
            <span className="font-medium text-white">Prompt-Caching (bis 90 % Rabatt)</span>
            <p className="mt-1 text-[11px] text-[#777]">
              T3 setzt bestehende Sessions fort statt neu zu starten. Bei Claude, OpenAI und Gemini
              greift das serverseitige Prompt-Caching mit bis zu 90 % Kostenersparnis.
            </p>
          </div>

          <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-2.5">
            <span className="font-medium text-white">Slash-Befehl: /compact</span>
            <p className="mt-1 text-[11px] text-[#777]">
              Mit <code className="font-mono text-sky-400">/compact</code> im Chat kannst du eine
              Kompaktierung des Verlaufs jederzeit manuell anfordern, ohne Tokens zu verschwenden.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
