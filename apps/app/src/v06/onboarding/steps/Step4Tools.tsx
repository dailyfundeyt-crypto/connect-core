/**
 * Schritt 4: Tools für die Firma aktivieren (A25 / Wave 3)
 */

import * as React from "react";
import {
  Wrench,
  Globe,
  Brain,
  Terminal,
  Cloud,
  ShoppingBag,
  Users,
  Check,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFlag } from "@/contracts/v06/flags";
import { Button as DesignButton } from "@/v06/design";
import "@/v06/design/tokens.css";
import type { OnboardingData } from "../types";

export interface Step4ToolsProps {
  data: OnboardingData;
  onUpdateData: (patch: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
  isSaving?: boolean;
}

interface ToolOption {
  id: string;
  name: string;
  badge?: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const AVAILABLE_TOOLS: ToolOption[] = [
  {
    id: "browser_use",
    name: "Chromium Browser-Automation",
    badge: "Empfohlen",
    description: "Autonomes Surfen, Klicks und Webseiten-Recherche ohne CORS-Einschränkungen.",
    icon: Globe,
  },
  {
    id: "brain_memory",
    name: "Spark Brain & Wissensspeicher",
    badge: "Kern-Modul",
    description: "Semantisches Langzeitgedächtnis, Dokumenten-Chunks und Knowledge-Graph.",
    icon: Brain,
  },
  {
    id: "cli_bridge",
    name: "Terminal & CLI-Runner",
    badge: "Empfohlen",
    description: "Sichere Ausführung lokaler Entwicklungswerkzeuge (Antigravity, Codex, Git).",
    icon: Terminal,
  },
  {
    id: "drive_backup",
    name: "Google Drive Synchronisation",
    description: "Automatisches Backup von Workspaces und Notizen in deinen Cloud-Speicher.",
    icon: Cloud,
  },
  {
    id: "store_extensions",
    name: "Connect Store Module",
    description: "Zugriff auf den Marktplatz für verifizierte MCP-Server, Skills und Bots.",
    icon: ShoppingBag,
  },
  {
    id: "connect_sozial",
    name: "Connect Sozial & Schwarm",
    description: "Zusammenarbeit mit anderen Bots, Research-Sharing und DAG-Projektkoordination.",
    icon: Users,
  },
];

export function Step4Tools({
  data,
  onUpdateData,
  onContinue,
  onBack,
  isSaving = false,
}: Step4ToolsProps) {
  const [selectedTools, setSelectedTools] = React.useState<string[]>(
    data.tools && data.tools.length > 0
      ? data.tools
      : ["browser_use", "brain_memory", "cli_bridge", "drive_backup"],
  );

  const toggleTool = (id: string) => {
    setSelectedTools((prev) => {
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      onUpdateData({ tools: next });
      return next;
    });
  };

  const handleProceed = () => {
    onUpdateData({ tools: selectedTools });
    onContinue();
  };

  const isDesignV2 = getFlag("designV2");

  return (
    <div className="w-full flex flex-col items-center justify-center max-w-2xl mx-auto py-2 text-center select-none">
      <div className="relative mb-6">
        <div
          className={`size-16 flex items-center justify-center shadow-md transition-transform duration-300 hover:scale-105 ${
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] border border-[var(--p-accent)]/30 bg-[var(--p-accent)]/15 text-[var(--p-accent)] shadow-[0_0_24px_rgba(56,189,248,0.18)]"
              : "rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-4 shadow-sm"
          }`}
        >
          <Wrench className={`size-8 ${isDesignV2 ? "text-[var(--p-accent)]" : ""}`} />
        </div>
      </div>

      <h1
        className={`text-2xl sm:text-3xl font-bold tracking-tight ${
          isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
        }`}
      >
        Tools für {data.companyName || "deine Firma"} aktivieren
      </h1>
      <p
        className={`text-sm mt-2 max-w-md ${
          isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground"
        }`}
      >
        Wähle die Fähigkeiten aus, die deinen AI-Mitarbeitern in diesem Workspace sofort zur Verfügung stehen sollen.
      </p>

      {/* Grid of Tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full mt-6 text-left">
        {AVAILABLE_TOOLS.map((tool) => {
          const isSelected = selectedTools.includes(tool.id);
          const Icon = tool.icon;

          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => toggleTool(tool.id)}
              className={`p-3.5 flex flex-col justify-between text-left transition-all duration-200 ${
                isDesignV2
                  ? isSelected
                    ? "rounded-[var(--p-radius-lg)] border border-[var(--p-accent)] bg-[var(--p-accent)]/10 ring-1 ring-[var(--p-accent)] shadow-[0_0_20px_rgba(56,189,248,0.15)]"
                    : "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] hover:border-[var(--p-accent)]/40 hover:bg-[var(--p-surface-hover)]"
                  : isSelected
                    ? "rounded-xl border border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                    : "rounded-xl border border-border/80 bg-card/60 hover:border-primary/40 hover:bg-accent/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2 w-full">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`size-9 flex items-center justify-center transition ${
                      isDesignV2
                        ? isSelected
                          ? "rounded-[var(--p-radius-md)] bg-[var(--p-accent)] text-[var(--p-text-on-accent)] font-bold shadow-xs"
                          : "rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] text-[var(--p-text-2)]"
                        : isSelected
                          ? "rounded-lg bg-primary text-primary-foreground"
                          : "rounded-lg bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <h3
                      className={`text-xs font-semibold flex items-center gap-1.5 ${
                        isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
                      }`}
                    >
                      {tool.name}
                      {tool.badge && (
                        <span
                          className={`text-[10px] font-normal px-1.5 py-0.2 rounded-full ${
                            isDesignV2
                              ? "bg-[var(--p-accent)]/20 text-[var(--p-accent)] border border-[var(--p-accent)]/30"
                              : "bg-primary/20 text-primary"
                          }`}
                        >
                          {tool.badge}
                        </span>
                      )}
                    </h3>
                  </div>
                </div>

                <div
                  className={`size-5 rounded-md border flex items-center justify-center shrink-0 ${
                    isDesignV2
                      ? isSelected
                        ? "border-[var(--p-accent)] bg-[var(--p-accent)] text-[var(--p-text-on-accent)]"
                        : "border-[var(--p-border-strong)] bg-transparent"
                      : isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected && <Check className="size-3.5 stroke-[2.5]" />}
                </div>
              </div>

              <p
                className={`text-[11px] mt-2 leading-relaxed ${
                  isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
                }`}
              >
                {tool.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between w-full max-w-md gap-3">
        {isDesignV2 ? (
          <>
            <DesignButton
              type="button"
              variant="secondary"
              onClick={onBack}
              disabled={isSaving}
              leftIcon={<ArrowLeft className="size-4" />}
              className="w-1/3"
            >
              Zurück
            </DesignButton>
            <DesignButton
              type="button"
              variant="primary"
              onClick={handleProceed}
              loading={isSaving}
              rightIcon={<ArrowRight className="size-4" />}
              className="w-2/3"
            >
              Ersten Bot konfigurieren
            </DesignButton>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSaving}
              className="w-1/3 gap-1.5"
            >
              <ArrowLeft className="size-4" />
              Zurück
            </Button>
            <Button
              type="button"
              onClick={handleProceed}
              disabled={isSaving}
              className="w-2/3 gap-2 shadow-sm font-medium"
            >
              Ersten Bot konfigurieren
              <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
