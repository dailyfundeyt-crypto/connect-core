import * as React from "react";
import { ThemeStepFallback } from "./theme-step-fallback";

interface ThemeStepWrapperProps {
  theme: "dark" | "light" | "system";
  onSelectTheme: (theme: "dark" | "light" | "system") => void;
  accentColor?: string;
  onSelectAccent?: (accent: string) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function ThemeStepWrapper(props: ThemeStepWrapperProps) {
  // Always use the robust ThemeStepFallback, which provides complete
  // theme selection, live CSS application, and accent color tuning.
  return <ThemeStepFallback {...props} />;
}
