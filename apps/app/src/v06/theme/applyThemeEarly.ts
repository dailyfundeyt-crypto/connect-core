import {
  type ThemePreference,
  DEFAULT_THEME_PREFERENCE,
  resolveTheme,
} from "@/contracts/v06/theme";
import { getFlag } from "@/contracts/v06/flags";

/**
 * Applies the resolved theme synchronously to <html> and the meta theme-color.
 * Designed to execute before the first paint to prevent flashes.
 */
export function applyThemeEarly(explicitPref?: ThemePreference): "dark" | "light" {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "dark";
  }

  // Check flag
  let isV2 = false;
  try {
    const override = window.localStorage.getItem("connect.flags.themeV2");
    if (override === "true") {
      isV2 = true;
    } else if (override === "false") {
      isV2 = false;
    } else if (typeof (window as any).__CONNECT_FLAGS_V06?.themeV2 === "boolean") {
      isV2 = (window as any).__CONNECT_FLAGS_V06.themeV2;
    } else {
      isV2 = getFlag("themeV2");
    }
  } catch {
    isV2 = getFlag("themeV2");
  }

  let pref: ThemePreference = DEFAULT_THEME_PREFERENCE;

  if (explicitPref) {
    pref = explicitPref;
  } else if (isV2) {
    try {
      const stored = window.localStorage.getItem("connect.theme.v2");
      if (stored === "system" || stored === "dark" || stored === "light") {
        pref = stored;
      }
    } catch {}
  } else {
    // Legacy fallback
    try {
      const legacy = window.localStorage.getItem("connect-theme");
      pref = legacy === "light" ? "light" : "dark";
    } catch {
      pref = "dark";
    }
  }

  const systemPrefersDark =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true;

  const resolved = resolveTheme(pref, systemPrefersDark);
  const isDark = resolved === "dark";

  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = resolved;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = isDark ? "#09090b" : "#ffffff";
  }

  // Sync with native desktop bridge if present
  try {
    const bridge = (window as any).__CONNECT_DESKTOP_BRIDGE__;
    if (bridge && typeof bridge.setTheme === "function") {
      bridge.setTheme(isDark);
    }
  } catch {}

  return resolved;
}
