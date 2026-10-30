import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { ThemePreference } from "@/contracts/v06/theme";
import {
  isThemeV2Active,
  getStoredThemePreference,
  setThemePreference,
  subscribeThemePreference,
  resolveCurrentTheme,
} from "@/v06/theme/themeStore";
import { applyThemeEarly } from "@/v06/theme/applyThemeEarly";
import {
  applyDarkTheme,
  parseStoredDarkTheme,
  THEME_DEFAULT_MIGRATION_KEY,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

export type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: "dark" | "light";
  dark: boolean;
  setDark: (dark: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  toggle: () => void;
  isV2: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const isV2 = isThemeV2Active();

  // --- v06 Theme v2 State ---
  const [themePref, setThemePref] = useState<ThemePreference>(() =>
    getStoredThemePreference(),
  );
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() =>
    resolveCurrentTheme(themePref),
  );

  // --- Legacy Theme State (for flag = false) ---
  const [legacyDark, setLegacyDark] = useState<boolean>(() => {
    try {
      if (window.localStorage.getItem(THEME_DEFAULT_MIGRATION_KEY) !== "1") {
        window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
        window.localStorage.setItem(THEME_DEFAULT_MIGRATION_KEY, "1");
        return true;
      }
      return parseStoredDarkTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return true;
    }
  });

  // v06 Layout Effect: sync DOM before paint
  useIsomorphicLayoutEffect(() => {
    if (isV2) {
      const res = applyThemeEarly(themePref);
      setResolvedTheme(res);
    }
  }, [isV2, themePref]);

  // v06 Subscription: listen to cross-tab and live OS media query changes
  useEffect(() => {
    if (!isV2) return;
    return subscribeThemePreference((newPref, newResolved) => {
      setThemePref(newPref);
      setResolvedTheme(newResolved);
    });
  }, [isV2]);

  // Legacy Layout Effect: apply dark theme when v2 is off
  useLayoutEffect(() => {
    if (isV2) return;
    applyDarkTheme(legacyDark, {
      setStoredValue: (key, value) => window.localStorage.setItem(key, value),
      toggleRootClass: (name, force) =>
        document.documentElement.classList.toggle(name, force),
      setRootColorScheme: (scheme) => {
        document.documentElement.style.colorScheme = scheme;
      },
    });
    void import("@/lib/desktop-bridge").then((m) =>
      m.notifyDesktopTheme(legacyDark),
    );
  }, [isV2, legacyDark]);

  // Setters
  const handleSetTheme = useCallback(
    (newTheme: ThemePreference) => {
      if (isV2) {
        setThemePref(newTheme);
        setThemePreference(newTheme);
        const res = applyThemeEarly(newTheme);
        setResolvedTheme(res);
      } else {
        const isDark = newTheme !== "light";
        setLegacyDark(isDark);
      }
    },
    [isV2],
  );

  const handleSetDark = useCallback(
    (dark: boolean) => {
      if (isV2) {
        handleSetTheme(dark ? "dark" : "light");
      } else {
        setLegacyDark(dark);
      }
    },
    [isV2, handleSetTheme],
  );

  const handleToggle = useCallback(() => {
    if (isV2) {
      const next: ThemePreference = resolvedTheme === "dark" ? "light" : "dark";
      handleSetTheme(next);
    } else {
      setLegacyDark((prev) => !prev);
    }
  }, [isV2, resolvedTheme, handleSetTheme]);

  const value: ThemeContextValue = {
    theme: isV2 ? themePref : legacyDark ? "dark" : "light",
    resolvedTheme: isV2 ? resolvedTheme : legacyDark ? "dark" : "light",
    dark: isV2 ? resolvedTheme === "dark" : legacyDark,
    setDark: handleSetDark,
    setTheme: handleSetTheme,
    toggle: handleToggle,
    isV2,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return value;
}
