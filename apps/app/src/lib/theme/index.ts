export * from "./types";
export * from "./theme-manager";

// Legacy exports matching earlier theme.ts interface
import { applyTheme, THEME_STORAGE_KEY } from "./theme-manager";

type ThemeEffects = {
  setStoredValue: (key: string, value: string) => void;
  toggleRootClass: (name: string, force: boolean) => void;
  setRootColorScheme: (scheme: "dark" | "light") => void;
};

export function applyDarkTheme(dark: boolean, effects?: ThemeEffects): void {
  const theme = dark ? "dark" : "light";
  if (effects) {
    effects.setStoredValue(THEME_STORAGE_KEY, theme);
    effects.toggleRootClass("dark", dark);
    effects.setRootColorScheme(dark ? "dark" : "light");
  }
  applyTheme(theme);
}
