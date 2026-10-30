/**
 * Schritt 5: Ersten Bot anlegen oder aus Vorlage (A25 / Wave 3)
 */

import * as React from "react";
import {
  Bot,
  Sparkles,
  Compass,
  Code,
  Check,
  Edit2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { createAgentMutationOptions } from "@/lib/agents/mutations";
import { queryClient } from "@/query-client";
import { getFlag } from "@/contracts/v06/flags";
import { Button as DesignButton } from "@/v06/design";
import "@/v06/design/tokens.css";
import type { OnboardingData } from "../types";

export interface Step5BotProps {
  data: OnboardingData;
  onUpdateData: (patch: Partial<OnboardingData>) => void;
  onContinue: () => void;
  onBack: () => void;
  isSaving?: boolean;
}

interface BotPreset {
  id: string;
  name: string;
  title: string;
  role: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  engine: "antigravity" | "claude" | "codex" | "freebuff";
}

const PRESETS: BotPreset[] = [
  {
    id: "nexus",
    name: "Nexus",
    title: "Allrounder Assistant",
    role: "General Workspace Copilot",
    description: "Unterstützt bei täglichen Aufgaben, Textentwürfen, Zusammenfassungen und Planung.",
    icon: Sparkles,
    engine: "antigravity",
  },
  {
    id: "scout",
    name: "Scout",
    title: "Research Lead",
    role: "Web & Market Research",
    description: "Sucht im Web, sammelt Fakten, analysiert Webseiten und fasst Dokumente zusammen.",
    icon: Compass,
    engine: "antigravity",
  },
  {
    id: "forge",
    name: "Forge",
    title: "Dev & Code Copilot",
    role: "Full-Stack Engineer",
    description: "Schreibt Code, analysiert Repositories, führt Tests aus und löst Fehlermeldungen.",
    icon: Code,
    engine: "codex",
  },
];

export function Step5Bot({
  data,
  onUpdateData,
  onContinue,
  onBack,
  isSaving = false,
}: Step5BotProps) {
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>(
    data.botName ? data.botName.toLowerCase() : "nexus",
  );
  const [botName, setBotName] = React.useState(data.botName || "Nexus");
  const [botRole, setBotRole] = React.useState(data.botRole || "General Workspace Copilot");
  const [engine, setEngine] = React.useState<"antigravity" | "claude" | "codex" | "freebuff">(
    (data.botEngine as any) || "antigravity",
  );
  const [isCustomizing, setIsCustomizing] = React.useState(false);
  const [isCreatingAgent, setIsCreatingAgent] = React.useState(false);

  const createAgentMutation = useMutation(createAgentMutationOptions(queryClient));

  const handleSelectPreset = (p: BotPreset) => {
    setSelectedPresetId(p.id);
    setBotName(p.name);
    setBotRole(p.role);
    setEngine(p.engine);
    setIsCustomizing(false);
    onUpdateData({
      botName: p.name,
      botRole: p.role,
      botEngine: p.engine,
    });
  };

  const handleProceed = async () => {
    const finalName = botName.trim() || "Nexus";
    const finalRole = botRole.trim() || "Workspace Assistant";

    setIsCreatingAgent(true);
    try {
      // Erstelle den Agenten im System
      const created = await createAgentMutation.mutateAsync({
        name: finalName,
        title: finalName,
        roleDescription: finalRole,
        visibility: "public",
        headline: finalRole,
        description: `Erstellt im Onboarding für ${data.companyName || "Connect"}`,
      });

      onUpdateData({
        botId: created.id,
        botName: created.name,
        botRole: created.roleDescription || finalRole,
        botEngine: engine,
      });
    } catch (err) {
      // Graceful degraded mode: Speichere lokale Konfiguration
      onUpdateData({
        botId: `bot-${Date.now()}`,
        botName: finalName,
        botRole: finalRole,
        botEngine: engine,
      });
    } finally {
      setIsCreatingAgent(false);
      onContinue();
    }
  };

  const isDesignV2 = getFlag("designV2");

  return (
    <div className="w-full flex flex-col items-center justify-center max-w-xl mx-auto py-2 text-center select-none">
      <div className="relative mb-6">
        <div
          className={`size-16 flex items-center justify-center shadow-md transition-transform duration-300 hover:scale-105 ${
            isDesignV2
              ? "rounded-[var(--p-radius-lg)] border border-[var(--p-accent)]/30 bg-[var(--p-accent)]/15 text-[var(--p-accent)] shadow-[0_0_24px_rgba(56,189,248,0.18)]"
              : "rounded-2xl bg-primary/10 border border-primary/20 text-primary mb-4 shadow-sm"
          }`}
        >
          <Bot className={`size-8 ${isDesignV2 ? "text-[var(--p-accent)]" : ""}`} />
        </div>
      </div>

      <h1
        className={`text-2xl sm:text-3xl font-bold tracking-tight ${
          isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
        }`}
      >
        Ersten AI-Coworker anlegen
      </h1>
      <p
        className={`text-sm mt-2 max-w-md ${
          isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground"
        }`}
      >
        Wähle eine bewährte Vorlage oder passe deinen ersten Bot individuell an.
      </p>

      {/* Preset Cards */}
      <div className="w-full mt-6 space-y-3 text-left">
        {PRESETS.map((preset) => {
          const isSelected = selectedPresetId === preset.id && !isCustomizing;
          const Icon = preset.icon;

          return (
            <div
              key={preset.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelectPreset(preset)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleSelectPreset(preset);
              }}
              className={`p-3.5 flex items-center justify-between cursor-pointer transition-all duration-200 ${
                isDesignV2
                  ? isSelected
                    ? "rounded-[var(--p-radius-lg)] border border-[var(--p-accent)] bg-[var(--p-accent)]/10 ring-1 ring-[var(--p-accent)] shadow-[0_0_20px_rgba(56,189,248,0.15)]"
                    : "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] hover:border-[var(--p-accent)]/40 hover:bg-[var(--p-surface-hover)]"
                  : isSelected
                    ? "rounded-xl border border-primary bg-primary/10 ring-1 ring-primary shadow-xs"
                    : "rounded-xl border border-border/80 bg-card/60 hover:border-primary/40 hover:bg-accent/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`size-10 flex items-center justify-center shrink-0 transition ${
                    isDesignV2
                      ? isSelected
                        ? "rounded-[var(--p-radius-md)] bg-[var(--p-accent)] text-[var(--p-text-on-accent)] font-bold shadow-xs"
                        : "rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] text-[var(--p-text-2)]"
                      : isSelected
                        ? "rounded-lg bg-primary text-primary-foreground"
                        : "rounded-lg bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      className={`text-sm font-semibold ${
                        isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
                      }`}
                    >
                      {preset.name}
                    </h3>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                        isDesignV2
                          ? "border border-[var(--p-border)] bg-[var(--p-surface-3)] text-[var(--p-text-2)]"
                          : "border border-border text-muted-foreground"
                      }`}
                    >
                      {preset.title}
                    </span>
                  </div>
                  <p
                    className={`text-xs mt-1 leading-relaxed ${
                      isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
                    }`}
                  >
                    {preset.description}
                  </p>
                </div>
              </div>

              <div
                className={`size-5 rounded-full border flex items-center justify-center shrink-0 ml-2 ${
                  isDesignV2
                    ? isSelected
                      ? "border-[var(--p-accent)] bg-[var(--p-accent)] text-[var(--p-text-on-accent)]"
                      : "border-[var(--p-border-strong)] bg-transparent"
                    : isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                }`}
              >
                {isSelected && <Check className="size-3 stroke-[3]" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Name / Role Toggle */}
      <div className="w-full mt-3 text-left">
        {!isCustomizing ? (
          isDesignV2 ? (
            <DesignButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsCustomizing(true)}
              leftIcon={<Edit2 className="size-3.5" />}
            >
              Namen oder Rolle manuell anpassen
            </DesignButton>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsCustomizing(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <Edit2 className="size-3.5 mr-1" />
              Namen oder Rolle manuell anpassen
            </Button>
          )
        ) : (
          <div
            className={`p-3.5 space-y-3 mt-2 ${
              isDesignV2
                ? "rounded-[var(--p-radius-lg)] border border-[var(--p-border)] bg-[var(--p-surface-2)] shadow-sm"
                : "rounded-xl border border-border bg-card/40"
            }`}
          >
            <h4
              className={`text-xs font-semibold ${
                isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground"
              }`}
            >
              Individuelle Bot-Einstellungen
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label
                  htmlFor="custom-bot-name"
                  className={`text-[11px] ${
                    isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
                  }`}
                >
                  Bot Name
                </Label>
                <Input
                  id="custom-bot-name"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  className={`h-8 text-xs ${
                    isDesignV2
                      ? "rounded-[var(--p-radius-md)] border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] focus:border-[var(--p-accent)]"
                      : "bg-background"
                  }`}
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="custom-bot-role"
                  className={`text-[11px] ${
                    isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground"
                  }`}
                >
                  Rolle / Spezialgebiet
                </Label>
                <Input
                  id="custom-bot-role"
                  value={botRole}
                  onChange={(e) => setBotRole(e.target.value)}
                  className={`h-8 text-xs ${
                    isDesignV2
                      ? "rounded-[var(--p-radius-md)] border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)] focus:border-[var(--p-accent)]"
                      : "bg-background"
                  }`}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between w-full max-w-md gap-3">
        {isDesignV2 ? (
          <>
            <DesignButton
              type="button"
              variant="secondary"
              onClick={onBack}
              disabled={isSaving || isCreatingAgent}
              leftIcon={<ArrowLeft className="size-4" />}
              className="w-1/3"
            >
              Zurück
            </DesignButton>
            <DesignButton
              type="button"
              variant="primary"
              onClick={handleProceed}
              loading={isSaving || isCreatingAgent}
              rightIcon={<ArrowRight className="size-4" />}
              className="w-2/3"
            >
              {isCreatingAgent ? "Wird angelegt…" : "Handy verbinden"}
            </DesignButton>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSaving || isCreatingAgent}
              className="w-1/3 gap-1.5"
            >
              <ArrowLeft className="size-4" />
              Zurück
            </Button>
            <Button
              type="button"
              onClick={handleProceed}
              disabled={isSaving || isCreatingAgent}
              className="w-2/3 gap-2 shadow-sm font-medium"
            >
              {isCreatingAgent ? "Wird angelegt…" : "Handy verbinden"}
              <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
