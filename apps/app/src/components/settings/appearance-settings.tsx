import { useState, useEffect } from "react";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { useTheme } from "@/components/theme-provider";
import {
  type AppTheme,
  applyTheme,
  getStoredTheme,
  resolveTheme,
  subscribeTheme,
} from "@/lib/theme";
import { isThemeV2Active } from "@/v06/theme/themeStore";
import { ThemeSettingsSection } from "@/v06/theme/ThemeSettingsSection";
import { OnboardingRestartButton } from "@/v06/onboarding/OnboardingRestartButton";
import { cn } from "@/lib/utils";

const legacyOptions = [
  {
    theme: "dark" as AppTheme,
    label: "Dunkel (Standard)",
    description: "Der Standard für Connect: Augenfreundlich bei Tag und Nacht.",
    Icon: IconMoon,
  },
  {
    theme: "light" as AppTheme,
    label: "Hell",
    description: "Helle Oberflächen und dunkle Schrift (nur aktiv, wenn hier explizit gewählt).",
    Icon: IconSun,
  },
] as const;

export function AppearanceSettings() {
  const isV2 = isThemeV2Active();
  const { setDark } = useTheme();
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => getStoredTheme());

  useEffect(() => {
    if (isV2) return;
    return subscribeTheme((newTheme, resolved) => {
      setCurrentTheme(newTheme);
      setDark(resolved === "dark");
    });
  }, [isV2, setDark]);

  const handleSelectTheme = (theme: AppTheme) => {
    setCurrentTheme(theme);
    applyTheme(theme);
    const resolved = resolveTheme(theme);
    setDark(resolved === "dark");
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6" data-testid="appearance-settings">
      {isV2 ? (
        <ThemeSettingsSection />
      ) : (
        <>
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Darstellung</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Wähle den Farbmodus für die gesamte App. Standard ist immer Dunkel – Hell wird nur aktiviert, wenn du es hier explizit auswählst.
            </p>
          </header>

          <div aria-label="Farbmodus" className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup">
            {legacyOptions.map(({ theme, label, description, Icon }) => {
              const selected = currentTheme === theme;
              return (
                <button
                  aria-checked={selected}
                  className={cn(
                    "flex min-h-28 flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:bg-accent/50",
                  )}
                  key={label}
                  onClick={() => handleSelectTheme(theme)}
                  role="radio"
                  type="button"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <Icon className="size-5" />
                    </span>
                    <span aria-hidden="true" className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-muted-foreground/40")}>
                      {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-foreground">Ersteinrichtung (Onboarding)</h2>
        <p className="mt-1 mb-3 text-xs text-muted-foreground">
          Setzt den aktuellen Onboarding-Status zurück, sodass der 7-stufige Begrüßungsablauf erneut durchlaufen werden kann.
        </p>
        <OnboardingRestartButton />
      </div>
    </div>
  );
}

export default AppearanceSettings;
