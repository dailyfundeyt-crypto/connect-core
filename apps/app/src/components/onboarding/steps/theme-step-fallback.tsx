import * as React from "react";
import { Moon, Sun, Monitor, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ThemeStepFallbackProps {
  theme: "dark" | "light" | "system";
  onSelectTheme: (theme: "dark" | "light" | "system") => void;
  accentColor?: string;
  onSelectAccent?: (accent: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

const ACCENT_OPTIONS = [
  { id: "teal", label: "Teal (Standard)", class: "bg-teal-500", color: "#14b8a6" },
  { id: "indigo", label: "Indigo", class: "bg-indigo-500", color: "#6366f1" },
  { id: "violet", label: "Violett", class: "bg-purple-500", color: "#a855f7" },
  { id: "amber", label: "Amber", class: "bg-amber-500", color: "#f59e0b" },
  { id: "emerald", label: "Smaragd", class: "bg-emerald-500", color: "#10b981" },
];

export function ThemeStepFallback({
  theme = "dark",
  onSelectTheme,
  accentColor = "teal",
  onSelectAccent,
  onContinue,
  onBack,
}: ThemeStepFallbackProps) {
  // Apply theme to document element immediately for preview
  const handleThemeChange = (newTheme: "dark" | "light" | "system") => {
    onSelectTheme(newTheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.classList.remove("dark", "light");
      if (newTheme === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.add(prefersDark ? "dark" : "light");
      } else {
        root.classList.add(newTheme);
      }
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center max-w-xl mx-auto py-2">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-center">
        Wähle dein Erscheinungsbild
      </h1>
      <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
        Passe Connect an deine Vorlieben an. Du kannst dies jederzeit in den Einstellungen ändern.
      </p>

      {/* Theme Cards (Max 1 decision: Theme Mode) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mt-8">
        {/* Dark Mode */}
        <button
          type="button"
          onClick={() => handleThemeChange("dark")}
          className={`p-4 rounded-xl border text-left flex flex-col items-start gap-3 transition cursor-pointer ${
            theme === "dark"
              ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
              : "border-border bg-card/60 hover:bg-card/90"
          }`}
        >
          <div className="size-9 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 flex items-center justify-center">
            <Moon className="size-4" />
          </div>
          <div className="w-full flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Dark Mode</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Standard & augenschonend</p>
            </div>
            {theme === "dark" && <Check className="size-4 text-primary shrink-0" />}
          </div>
        </button>

        {/* Light Mode */}
        <button
          type="button"
          onClick={() => handleThemeChange("light")}
          className={`p-4 rounded-xl border text-left flex flex-col items-start gap-3 transition cursor-pointer ${
            theme === "light"
              ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
              : "border-border bg-card/60 hover:bg-card/90"
          }`}
        >
          <div className="size-9 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
            <Sun className="size-4" />
          </div>
          <div className="w-full flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Light Mode</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Hell & kontrastreich</p>
            </div>
            {theme === "light" && <Check className="size-4 text-primary shrink-0" />}
          </div>
        </button>

        {/* System Mode */}
        <button
          type="button"
          onClick={() => handleThemeChange("system")}
          className={`p-4 rounded-xl border text-left flex flex-col items-start gap-3 transition cursor-pointer ${
            theme === "system"
              ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
              : "border-border bg-card/60 hover:bg-card/90"
          }`}
        >
          <div className="size-9 rounded-lg bg-muted border border-border text-foreground flex items-center justify-center">
            <Monitor className="size-4" />
          </div>
          <div className="w-full flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">System</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Folgt Betriebssystem</p>
            </div>
            {theme === "system" && <Check className="size-4 text-primary shrink-0" />}
          </div>
        </button>
      </div>

      {/* Accent Color Selection (Optional micro-picker) */}
      <div className="w-full mt-6 p-4 rounded-xl border border-border/80 bg-card/40 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">Akzentfarbe:</span>
        <div className="flex items-center gap-2">
          {ACCENT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              title={opt.label}
              onClick={() => onSelectAccent?.(opt.id)}
              className={`size-6 rounded-full ${opt.class} flex items-center justify-center transition cursor-pointer ${
                accentColor === opt.id
                  ? "ring-2 ring-foreground/60 scale-110"
                  : "opacity-75 hover:opacity-100"
              }`}
            >
              {accentColor === opt.id && <Check className="size-3 text-white stroke-[3]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-8 flex items-center justify-between w-full max-w-xs gap-3">
        <Button variant="outline" onClick={onBack} size="lg" className="w-1/2">
          <ArrowLeft className="size-4 mr-1.5" />
          Zurück
        </Button>
        <Button onClick={onContinue} size="lg" className="w-1/2">
          Weiter
          <ArrowRight className="size-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
