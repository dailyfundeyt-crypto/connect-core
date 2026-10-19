export const THEME_STORAGE_KEY = "connect-theme";
export const THEME_DEFAULT_MIGRATION_KEY = "connect-theme.default-dark.v2";

export function parseStoredDarkTheme(value: string | null) {
  // Dark is the default for new profiles; an explicit light choice is preserved.
  return value === null || value === "dark";
}

type ThemeEffects = {
  setStoredValue: (key: string, value: string) => void;
  toggleRootClass: (name: string, force: boolean) => void;
  setRootColorScheme: (scheme: "dark" | "light") => void;
};

export function applyDarkTheme(dark: boolean, effects: ThemeEffects) {
  effects.setStoredValue(THEME_STORAGE_KEY, dark ? "dark" : "light");
  effects.toggleRootClass("dark", dark);
  // `index.html` sets this inline before paint, and an inline style outranks the palette.
  effects.setRootColorScheme(dark ? "dark" : "light");
  // Persist to server so theme survives sign-out/sign-in.
  void import("@/lib/companies/workspace-sync").then((m) =>
    m.scheduleConnectWorkspacePush(),
  );
}
