/**
 * Unified Theme Types for Swarm-v2 (Lane 2)
 */

export type AppTheme = "dark" | "light" | "system";

export type ResolvedTheme = "dark" | "light";

export interface UserThemePreference {
  theme: AppTheme;
  accentColor?: string;
  focusMode?: boolean;
  reducedMotion?: boolean;
}

export interface ThemeOption {
  value: AppTheme;
  label: string;
  description: string;
}
