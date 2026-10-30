import React from "react";
import {
  IconMoon,
  IconSun,
  IconDeviceDesktop,
} from "@tabler/icons-react";
import type { ThemePreference } from "@/contracts/v06/theme";
import { useTheme } from "./useTheme";
import { cn } from "@/lib/utils";

export interface ThemeSettingsSectionProps {
  /** The currently selected theme preference */
  value?: ThemePreference;
  /** Callback fired when the user selects a theme */
  onChange?: (theme: ThemePreference) => void;
  /** Additional CSS class names */
  className?: string;
}

interface ThemeOptionItem {
  id: ThemePreference;
  label: string;
  description: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const THEME_OPTIONS: ThemeOptionItem[] = [
  {
    id: "system",
    label: "System",
    badge: "Standard",
    description: "Passt sich automatisch an dein Betriebssystem (Windows) an.",
    icon: IconDeviceDesktop,
  },
  {
    id: "dark",
    label: "Dunkel",
    badge: "Empfohlen",
    description: "Augenfreundlich für fokussiertes Arbeiten bei jedem Licht.",
    icon: IconMoon,
  },
  {
    id: "light",
    label: "Hell",
    description: "Klassisch helle Oberflächen mit kontrastreicher Schrift.",
    icon: IconSun,
  },
];

export function ThemeSettingsSection({
  value,
  onChange,
  className,
}: ThemeSettingsSectionProps) {
  const themeContext = useTheme();

  const selectedTheme: ThemePreference =
    value !== undefined ? value : themeContext.theme;

  const handleSelect = (choice: ThemePreference) => {
    if (onChange) {
      onChange(choice);
    } else {
      themeContext.setTheme(choice);
    }
  };

  return (
    <div
      className={cn("w-full space-y-4", className)}
      data-testid="v06-theme-settings-section"
    >
      <header>
        <h2 className="text-base font-semibold text-foreground">
          Farbschema & Erscheinungsbild
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Wähle dein bevorzugtes Design. Standardmäßig folgt Connect den Einstellungen deines Systems.
        </p>
      </header>

      <div
        role="radiogroup"
        aria-label="Farbschema auswählen"
        className="grid gap-3 sm:grid-cols-3"
      >
        {THEME_OPTIONS.map((opt) => {
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
                "flex min-h-24 flex-col items-start justify-between rounded-xl border p-3.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-accent/40",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    isSelected ? "border-primary" : "border-muted-foreground/40",
                  )}
                >
                  {isSelected && (
                    <span className="size-2 rounded-full bg-primary" />
                  )}
                </span>
              </div>

              <div className="mt-3 w-full min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    {opt.label}
                  </span>
                  {opt.badge && (
                    <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                  {opt.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ThemeSettingsSection;
