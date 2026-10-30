import type { AppTheme, ResolvedTheme, UserThemePreference } from "./types";

export const THEME_STORAGE_KEY = "connect-theme";
export const THEME_DEFAULT_MIGRATION_KEY = "connect-theme.default-dark.v2";
export const THEME_V3_MIGRATION_KEY = "connect-theme.default-dark.v3";
export const THEME_CHANGED_EVENT = "connect-theme-changed";

/**
 * Returns true if the system OS prefers dark mode.
 * Kept for legacy/external compatibility; Swarm v3 defaults to dark mode
 * regardless of system prefers-color-scheme.
 */
export function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Read the current theme preference from localStorage.
 * Rule: Kein gespeicherter Wert ODER 'system' -> 'dark'.
 * Nur explizit 'light' -> 'light'.
 * Migriert alte 'system'-Werte einmalig zu 'dark'.
 */
export function getStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    // Migration alter Werte: 'system' einmalig -> 'dark' (clientseitig)
    if (raw === "system") {
      window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.localStorage.setItem(THEME_V3_MIGRATION_KEY, "1");
      return "dark";
    }
    if (raw === "light") {
      return "light";
    }
    if (raw === "dark") {
      return "dark";
    }
  } catch {
    /* ignore storage access error */
  }
  return "dark";
}

/**
 * Resolves an AppTheme into an actual "dark" | "light" value.
 * Rule: Kein gespeicherter Wert ODER 'system' -> dark. Nur explizit 'light' -> hell.
 * prefers-color-scheme wird fuer den Default ignoriert.
 */
export function resolveTheme(theme?: AppTheme | null): ResolvedTheme {
  if (theme === "light") {
    return "light";
  }
  return "dark";
}

/**
 * Legacy compatibility helper.
 * Rule: Nur explizit 'light' -> false (hell). Alles andere (inkl. 'system' / null) -> true (dark).
 */
export function parseStoredDarkTheme(value: string | null): boolean {
  if (value === "light") {
    return false;
  }
  return true; // Default to dark for null, "dark", "system", or any other value
}

/**
 * Syncs the theme preference with the backend API /api/user/preferences.
 */
export async function syncThemeWithServer(theme: AppTheme): Promise<void> {
  try {
    await fetch("/api/user/preferences", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ theme }),
    });
  } catch (err) {
    // Non-blocking error logging
    console.debug("[theme] Could not sync theme preference to server:", err);
  }

  // Also trigger workspace push if available
  try {
    const ws = await import("@/lib/companies/workspace-sync");
    ws.scheduleConnectWorkspacePush();
  } catch {
    /* ignore */
  }
}

/**
 * Applies the theme to the DOM, localStorage, and notifies listeners and bridges.
 */
export function applyTheme(theme: AppTheme): void {
  if (typeof window === "undefined") return;

  const resolved = resolveTheme(theme);
  const isDark = resolved === "dark";

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.localStorage.setItem(THEME_DEFAULT_MIGRATION_KEY, "1");
    window.localStorage.setItem(THEME_V3_MIGRATION_KEY, "1");
  } catch {
    /* quota or privacy mode */
  }

  // Set classes on root HTML
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = resolved;

  // Update meta theme-color
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = isDark ? "#09090b" : "#ffffff";
  }

  // Notify listeners within window
  window.dispatchEvent(
    new CustomEvent(THEME_CHANGED_EVENT, {
      detail: { theme, resolved },
    }),
  );

  // Sync with desktop bridge if present
  void import("@/lib/desktop-bridge")
    .then((m) => m.notifyDesktopTheme(isDark))
    .catch(() => {});

  // Persist to server
  void syncThemeWithServer(theme);
}

/**
 * Subscribe to theme preference changes.
 */
export function subscribeTheme(
  cb: (theme: AppTheme, resolved: ResolvedTheme) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustom = (e: Event) => {
    const detail = (e as CustomEvent).detail as
      | { theme: AppTheme; resolved: ResolvedTheme }
      | undefined;
    if (detail) {
      cb(detail.theme, detail.resolved);
    } else {
      const current = getStoredTheme();
      cb(current, resolveTheme(current));
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      const current = getStoredTheme();
      cb(current, resolveTheme(current));
    }
  };

  // Media query listener for system theme changes
  let mediaQuery: MediaQueryList | null = null;
  const handleMedia = () => {
    if (getStoredTheme() === "system") {
      const current = getStoredTheme();
      const resolved = resolveTheme(current);
      applyTheme("system");
      cb(current, resolved);
    }
  };

  if (window.matchMedia) {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", handleMedia);
  }

  window.addEventListener(THEME_CHANGED_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(THEME_CHANGED_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
    if (mediaQuery) {
      mediaQuery.removeEventListener("change", handleMedia);
    }
  };
}

/**
 * Initializes theme on bootstrap, ensuring dark mode default and listener setup.
 */
export function initTheme(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw || raw === "system" || window.localStorage.getItem(THEME_V3_MIGRATION_KEY) !== "1") {
      const nextTheme = raw === "light" ? "light" : "dark";
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      window.localStorage.setItem(THEME_V3_MIGRATION_KEY, "1");
    }
  } catch {}
  const theme = getStoredTheme();
  applyTheme(theme);
}
