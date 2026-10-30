/** Contract v06 – Änderungen nur durch A00/Integrator */

export type ThemePreference = "system" | "dark" | "light";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

/**
 * Löst die Theme-Präferenz in ein konkretes Farbschema ("dark" | "light") auf.
 * Bei unbekannten Werten wird standardmäßig 'dark' zurückgegeben.
 */
export function resolveTheme(
  pref: ThemePreference | string | null | undefined,
  systemPrefersDark: boolean,
): "dark" | "light" {
  if (pref === "dark") {
    return "dark";
  }
  if (pref === "light") {
    return "light";
  }
  if (pref === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  // Bei unbekannt / ungültig: Fallback auf dark
  return "dark";
}
