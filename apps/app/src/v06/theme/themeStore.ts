import {
  type ThemePreference,
  DEFAULT_THEME_PREFERENCE,
  resolveTheme,
} from "@/contracts/v06/theme";
import { getFlag } from "@/contracts/v06/flags";
import { applyThemeEarly } from "./applyThemeEarly";

export const THEME_V2_STORAGE_KEY = "connect.theme.v2";
export const THEME_V2_CHANGED_EVENT = "connect-theme-v2-changed";
export const THEME_V2_FLAG_STORAGE_KEY = "connect.flags.themeV2";

/**
 * Checks whether the v06 Theme v2 feature flag is active.
 * Checks contract getFlag("themeV2"), localStorage override, or window object override.
 */
export function isThemeV2Active(): boolean {
  if (typeof window !== "undefined") {
    try {
      const override = window.localStorage.getItem(THEME_V2_FLAG_STORAGE_KEY);
      if (override === "true") return true;
      if (override === "false") return false;
      const winOverride = (window as any).__CONNECT_FLAGS_V06?.themeV2;
      if (typeof winOverride === "boolean") return winOverride;
    } catch {
      // ignore storage access errors
    }
  }
  return getFlag("themeV2");
}

/**
 * Checks whether the OS currently prefers dark mode.
 * First principles: without media info or window (e.g. SSR / unsupported), defaults to dark (true).
 */
export function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Reads the current theme preference.
 * When Theme v2 is active:
 * - Reads from localStorage `connect.theme.v2`
 * - If empty or invalid, returns DEFAULT_THEME_PREFERENCE ('system')
 * When Theme v2 is disabled:
 * - Reads legacy 'connect-theme' (light or dark)
 */
export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_PREFERENCE;
  }

  try {
    if (!isThemeV2Active()) {
      const legacy = window.localStorage.getItem("connect-theme");
      return legacy === "light" ? "light" : "dark";
    }

    const raw = window.localStorage.getItem(THEME_V2_STORAGE_KEY);
    if (raw === "system" || raw === "dark" || raw === "light") {
      return raw;
    }
  } catch {
    // Storage access error -> fallback
  }

  return DEFAULT_THEME_PREFERENCE;
}

/**
 * Resolves the given or stored preference to a concrete "dark" | "light" color scheme.
 */
export function resolveCurrentTheme(pref?: ThemePreference): "dark" | "light" {
  const p = pref ?? getStoredThemePreference();
  return resolveTheme(p, getSystemPrefersDark());
}

/**
 * Syncs the theme preference with the backend API /api/user/preferences if available.
 * Non-blocking, fails gracefully.
 */
export async function syncThemeToServer(theme: ThemePreference): Promise<void> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return;
  // If window.location.origin is not available (e.g. non-browser test runner), skip relative fetch
  if (!window.location || !window.location.origin || window.location.origin === "null") {
    return;
  }
  try {
    await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ theme }),
    });
  } catch (err) {
    console.debug("[themeStore] Could not sync theme to server:", err);
  }
}

/**
 * Stores the user's theme preference, applies it immediately to the DOM,
 * and notifies all listeners.
 */
export function setThemePreference(theme: ThemePreference): void {
  if (typeof window === "undefined") return;

  const validTheme: ThemePreference =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : DEFAULT_THEME_PREFERENCE;

  if (isThemeV2Active()) {
    try {
      window.localStorage.setItem(THEME_V2_STORAGE_KEY, validTheme);
    } catch {
      // quota or privacy mode
    }

    // Apply immediately to prevent any flicker
    applyThemeEarly(validTheme);

    const resolved = resolveTheme(validTheme, getSystemPrefersDark());

    // Dispatch v2 event
    window.dispatchEvent(
      new CustomEvent(THEME_V2_CHANGED_EVENT, {
        detail: { theme: validTheme, resolved },
      }),
    );

    // Also dispatch legacy event so any legacy listeners remain in sync
    window.dispatchEvent(
      new CustomEvent("connect-theme-changed", {
        detail: { theme: validTheme, resolved },
      }),
    );

    // Persist to server
    void syncThemeToServer(validTheme);
  } else {
    // Legacy fallback behavior
    const legacyTheme = validTheme === "light" ? "light" : "dark";
    try {
      window.localStorage.setItem("connect-theme", legacyTheme);
    } catch {}
    applyThemeEarly(legacyTheme);
    window.dispatchEvent(
      new CustomEvent("connect-theme-changed", {
        detail: { theme: legacyTheme, resolved: legacyTheme },
      }),
    );
    void syncThemeToServer(legacyTheme);
  }
}

/**
 * Subscribes to theme preference changes, cross-tab storage changes,
 * and live OS media query changes (when preference is 'system').
 */
export function subscribeThemePreference(
  callback: (theme: ThemePreference, resolved: "dark" | "light") => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustomEvent = (e: Event) => {
    const detail = (e as CustomEvent).detail as
      | { theme: ThemePreference; resolved: "dark" | "light" }
      | undefined;
    if (detail?.theme && detail?.resolved) {
      callback(detail.theme, detail.resolved);
    } else {
      const current = getStoredThemePreference();
      callback(current, resolveCurrentTheme(current));
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (
      e.key === THEME_V2_STORAGE_KEY ||
      e.key === "connect-theme" ||
      e.key === THEME_V2_FLAG_STORAGE_KEY
    ) {
      const current = getStoredThemePreference();
      const resolved = resolveCurrentTheme(current);
      applyThemeEarly(current);
      callback(current, resolved);
    }
  };

  // Live mediaQuery listener for OS changes
  let mql: MediaQueryList | null = null;
  const handleMediaChange = () => {
    const current = getStoredThemePreference();
    if (current === "system") {
      const resolved = resolveCurrentTheme("system");
      applyThemeEarly("system");
      callback("system", resolved);
    }
  };

  if (window.matchMedia) {
    try {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      if (mql.addEventListener) {
        mql.addEventListener("change", handleMediaChange);
      } else if ((mql as any).addListener) {
        (mql as any).addListener(handleMediaChange);
      }
    } catch {
      // ignore media query listener error
    }
  }

  window.addEventListener(THEME_V2_CHANGED_EVENT, handleCustomEvent);
  window.addEventListener("connect-theme-changed", handleCustomEvent);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(THEME_V2_CHANGED_EVENT, handleCustomEvent);
    window.removeEventListener("connect-theme-changed", handleCustomEvent);
    window.removeEventListener("storage", handleStorage);
    if (mql) {
      try {
        if (mql.removeEventListener) {
          mql.removeEventListener("change", handleMediaChange);
        } else if ((mql as any).removeListener) {
          (mql as any).removeListener(handleMediaChange);
        }
      } catch {}
    }
  };
}
