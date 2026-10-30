import React from "react";
import {
  IconMoon,
  IconSun,
  IconDeviceDesktop,
  IconCheck,
} from "@tabler/icons-react";
import type { ThemePreference } from "@/contracts/v06/theme";
import { useTheme } from "./useTheme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getFlag } from "@/contracts/v06/flags";
import { Button as DesignButton } from "@/v06/design";
import "@/v06/design/tokens.css";

export interface ThemeChoiceStepProps {
  /** The currently selected theme preference */
  value?: ThemePreference;
  /** Callback fired when the user selects a theme */
  onChange?: (theme: ThemePreference) => void;
  /** Optional callback fired when the user confirms / proceeds */
  onNext?: () => void;
  /** Optional callback fired when the step is completed */
  onComplete?: (theme: ThemePreference) => void;
  /** Additional CSS class names */
  className?: string;
  /** Whether to show a continue / proceed button */
  showContinueButton?: boolean;
  /** Custom label for the continue button (default: "Weiter") */
  continueButtonText?: string;
}

interface ThemeCardDefinition {
  id: ThemePreference;
  title: string;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline";
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const THEME_CARDS: ThemeCardDefinition[] = [
  {
    id: "system",
    title: "System",
    badge: "Standard",
    badgeVariant: "default",
    description: "Folgt automatisch dem Hell- oder Dunkelmodus deines Betriebssystems.",
    icon: IconDeviceDesktop,
  },
  {
    id: "dark",
    title: "Dunkel",
    badge: "Empfohlen",
    badgeVariant: "secondary",
    description: "Augenfreundlich bei Tag und Nacht mit hohem Kontrast.",
    icon: IconMoon,
  },
  {
    id: "light",
    title: "Hell",
    description: "Klassische helle Oberfläche mit klar lesbarer dunkler Typografie.",
    icon: IconSun,
  },
];

export function ThemeChoiceStep({
  value,
  onChange,
  onNext,
  onComplete,
  className,
  showContinueButton = false,
  continueButtonText = "Weiter",
}: ThemeChoiceStepProps) {
  const themeContext = useTheme();

  // Controlled or uncontrolled via context
  const selectedTheme: ThemePreference =
    value !== undefined ? value : themeContext.theme;

  const isDesignV2 = getFlag("designV2");

  const handleSelect = (choice: ThemePreference) => {
    if (onChange) {
      onChange(choice);
    } else {
      themeContext.setTheme(choice);
    }
  };

  const handleProceed = () => {
    if (onComplete) onComplete(selectedTheme);
    if (onNext) onNext();
  };

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col p-4 md:p-6",
        isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground",
        className,
      )}
      data-testid="v06-theme-choice-step"
    >
      <header className="mb-8 text-center">
        <h2
          className={cn(
            "text-2xl md:text-3xl font-bold tracking-tight",
            isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground",
          )}
        >
          Wähle dein Erscheinungsbild
        </h2>
        <p
          className={cn(
            "mt-2 text-sm max-w-md mx-auto",
            isDesignV2 ? "text-[var(--p-text-2)]" : "text-muted-foreground",
          )}
        >
          Connect startet standardmäßig dunkel und passt sich nahtlos an deine Windows-Einstellungen an.
        </p>
      </header>

      {/* 3 Large Cards */}
      <div
        role="radiogroup"
        aria-label="Theme-Auswahl"
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        {THEME_CARDS.map((card) => {
          const isSelected = selectedTheme === card.id;
          const Icon = card.icon;

          return (
            <button
              key={card.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => handleSelect(card.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(card.id);
                }
              }}
              className={cn(
                "group relative flex flex-col justify-between overflow-hidden p-5 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                isDesignV2
                  ? cn(
                      "rounded-[var(--p-radius-lg)] border",
                      isSelected
                        ? "border-[var(--p-accent)] bg-[var(--p-accent)]/10 shadow-[0_0_24px_rgba(56,189,248,0.2)] ring-1 ring-[var(--p-accent)]"
                        : "border-[var(--p-border)] bg-[var(--p-surface-2)] hover:border-[var(--p-accent)]/40 hover:bg-[var(--p-surface-hover)]",
                      "focus-visible:ring-[var(--p-accent)]",
                    )
                  : cn(
                      "rounded-2xl border",
                      isSelected
                        ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary"
                        : "border-border bg-card hover:border-primary/40 hover:bg-accent/40",
                      "focus-visible:ring-primary",
                    ),
              )}
            >
              {/* Card Header & Badge */}
              <div className="flex w-full items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center transition-colors",
                      isDesignV2
                        ? isSelected
                          ? "rounded-[var(--p-radius-md)] bg-[var(--p-accent)] text-[var(--p-text-on-accent)] font-bold shadow-xs"
                          : "rounded-[var(--p-radius-md)] border border-[var(--p-border)] bg-[var(--p-surface-3)] text-[var(--p-text-2)] group-hover:text-[var(--p-text-1)]"
                        : isSelected
                          ? "rounded-xl bg-primary text-primary-foreground"
                          : "rounded-xl bg-muted text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <span
                      className={cn(
                        "text-base font-semibold",
                        isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground",
                      )}
                    >
                      {card.title}
                    </span>
                    {card.badge && (
                      <span
                        className={cn(
                          "ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide",
                          isDesignV2
                            ? "bg-[var(--p-accent)]/20 text-[var(--p-accent)] border border-[var(--p-accent)]/30"
                            : card.badgeVariant === "default"
                              ? "bg-primary/15 text-primary border border-primary/25"
                              : "bg-muted text-muted-foreground border border-border",
                        )}
                      >
                        {card.badge}
                      </span>
                    )}
                  </div>
                </div>

                {/* Selection Indicator Checkmark */}
                <div
                  aria-hidden="true"
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border transition-all",
                    isDesignV2
                      ? isSelected
                        ? "border-[var(--p-accent)] bg-[var(--p-accent)] text-[var(--p-text-on-accent)]"
                        : "border-[var(--p-border-strong)] bg-transparent"
                      : isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30 bg-transparent",
                  )}
                >
                  {isSelected && <IconCheck className="size-3 stroke-[3]" />}
                </div>
              </div>

              {/* Visual Preview Box */}
              <div
                aria-hidden="true"
                className="my-5 w-full overflow-hidden rounded-xl border border-border/80 bg-background/50 p-2 shadow-inner"
              >
                {card.id === "system" && (
                  <div className="flex h-24 w-full overflow-hidden rounded-lg border border-border/60">
                    {/* Left half: Dark */}
                    <div className="flex flex-1 flex-col justify-between bg-zinc-950 p-2 text-zinc-100">
                      <div className="flex items-center gap-1">
                        <div className="size-1.5 rounded-full bg-zinc-700" />
                        <div className="size-1.5 rounded-full bg-zinc-700" />
                        <div className="size-1.5 rounded-full bg-zinc-700" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-1.5 w-3/4 rounded bg-zinc-800" />
                        <div className="h-1.5 w-1/2 rounded bg-zinc-700" />
                      </div>
                      <div className="text-[9px] font-medium text-zinc-400">OS Auto</div>
                    </div>
                    {/* Right half: Light */}
                    <div className="flex flex-1 flex-col justify-between bg-zinc-100 p-2 text-zinc-900 border-l border-zinc-300">
                      <div className="flex items-center justify-end gap-1">
                        <div className="size-1.5 rounded-full bg-zinc-400" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-1.5 w-3/4 rounded bg-zinc-300" />
                        <div className="h-1.5 w-1/2 rounded bg-zinc-200" />
                      </div>
                      <div className="text-[9px] font-medium text-zinc-500 text-right">Live Sync</div>
                    </div>
                  </div>
                )}

                {card.id === "dark" && (
                  <div className="flex h-24 w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-zinc-100">
                    <div className="w-1/4 border-r border-zinc-800 pr-1.5 flex flex-col gap-1">
                      <div className="size-2 rounded bg-sky-500" />
                      <div className="h-1.5 w-full rounded bg-zinc-800" />
                      <div className="h-1.5 w-3/4 rounded bg-zinc-800" />
                    </div>
                    <div className="flex flex-1 flex-col justify-between pl-2">
                      <div className="space-y-1.5">
                        <div className="h-2 w-2/3 rounded bg-zinc-800" />
                        <div className="h-1.5 w-full rounded bg-zinc-900" />
                        <div className="h-1.5 w-4/5 rounded bg-zinc-900" />
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-10 rounded bg-sky-600/30 border border-sky-500/40" />
                        <div className="h-3 w-6 rounded bg-zinc-800" />
                      </div>
                    </div>
                  </div>
                )}

                {card.id === "light" && (
                  <div className="flex h-24 w-full overflow-hidden rounded-lg border border-zinc-300 bg-white p-2 text-zinc-900">
                    <div className="w-1/4 border-r border-zinc-200 pr-1.5 flex flex-col gap-1">
                      <div className="size-2 rounded bg-sky-600" />
                      <div className="h-1.5 w-full rounded bg-zinc-200" />
                      <div className="h-1.5 w-3/4 rounded bg-zinc-200" />
                    </div>
                    <div className="flex flex-1 flex-col justify-between pl-2">
                      <div className="space-y-1.5">
                        <div className="h-2 w-2/3 rounded bg-zinc-300" />
                        <div className="h-1.5 w-full rounded bg-zinc-100" />
                        <div className="h-1.5 w-4/5 rounded bg-zinc-100" />
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-10 rounded bg-sky-500/20 border border-sky-500/30" />
                        <div className="h-3 w-6 rounded bg-zinc-200" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {card.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Optional Continue Button */}
      {(showContinueButton || onNext || onComplete) && (
        <div className="mt-8 flex justify-end">
          <Button
            type="button"
            onClick={handleProceed}
            className="px-6 py-2 rounded-xl text-sm font-semibold"
          >
            {continueButtonText}
          </Button>
        </div>
      )}
    </div>
  );
}

export default ThemeChoiceStep;
