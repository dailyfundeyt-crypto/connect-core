import React, { useState } from "react";
import { IconMoon, IconSun, IconDeviceDesktop, IconCheck } from "@tabler/icons-react";
import {
  type AppTheme,
  applyTheme,
  getStoredTheme,
} from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ThemeStepProps {
  onComplete?: (theme: AppTheme) => void;
  onNext?: () => void;
  initialTheme?: AppTheme;
  className?: string;
}

const themeOptions: Array<{
  id: AppTheme;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}> = [
  {
    id: "dark",
    title: "Dunkel",
    description: "Der Standard für Connect: Augenfreundlich bei Tag und Nacht.",
    icon: IconMoon,
    badge: "Empfohlen",
  },
  {
    id: "light",
    title: "Hell",
    description: "Klassisches helles Design mit dunkler Schrift.",
    icon: IconSun,
  },
  {
    id: "system",
    title: "System",
    description: "Passt sich automatisch an dein Betriebssystem an.",
    icon: IconDeviceDesktop,
  },
];

/**
 * Onboarding Theme Step (Lane 2 - used by Lane 9 Onboarding)
 * Allows the user to choose their preferred theme during onboarding.
 * Defaults to "dark", with instantaneous live preview and persistence.
 */
export function ThemeStep({
  onComplete,
  onNext,
  initialTheme,
  className,
}: ThemeStepProps) {
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(
    () => initialTheme ?? getStoredTheme() ?? "dark",
  );

  const handleSelect = (theme: AppTheme) => {
    setSelectedTheme(theme);
    applyTheme(theme);
  };

  const handleConfirm = () => {
    applyTheme(selectedTheme);
    if (onComplete) onComplete(selectedTheme);
    if (onNext) onNext();
  };

  return (
    <div
      className={cn("mx-auto flex w-full max-w-xl flex-col p-6 text-foreground", className)}
      data-testid="onboarding-theme-step"
    >
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <IconMoon className="size-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Wähle deine Darstellung</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect startet standardmäßig dunkel. Du kannst die Darstellung jederzeit in den Einstellungen ändern.
        </p>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-3" role="radiogroup">
        {themeOptions.map((opt) => {
          const isSelected = selectedTheme === opt.id;
          const Icon = opt.icon;

          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelect(opt.id)}
              className={cn(
                "relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isSelected
                  ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                  : "border-border bg-card hover:border-muted-foreground/30 hover:bg-accent/40",
              )}
            >
              {opt.badge ? (
                <span className="absolute right-3 top-3 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {opt.badge}
                </span>
              ) : null}

              <div
                className={cn(
                  "mb-3 flex size-10 items-center justify-center rounded-xl",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
              </div>

              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <span>{opt.title}</span>
                {isSelected ? <IconCheck className="size-4 text-primary" /> : null}
              </div>

              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex justify-end gap-3">
        <Button
          type="button"
          onClick={handleConfirm}
          className="h-11 w-full rounded-xl font-semibold sm:w-auto sm:px-8"
        >
          Weiter
        </Button>
      </div>
    </div>
  );
}

export default ThemeStep;
