import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import {
  type ThemePreference,
  DEFAULT_THEME_PREFERENCE,
} from "@/contracts/v06/theme";
import {
  getStoredThemePreference,
  resolveCurrentTheme,
  setThemePreference,
  subscribeThemePreference,
  isThemeV2Active,
} from "./themeStore";
import { applyThemeEarly } from "./applyThemeEarly";

export interface ThemeContextValue {
  /** The configured preference ('system' | 'dark' | 'light') */
  theme: ThemePreference;
  /** The resolved actual color scheme ('dark' | 'light') */
  resolvedTheme: "dark" | "light";
  /** Convenience boolean: true when resolvedTheme === 'dark' */
  dark: boolean;
  /** Set an explicit preference ('system', 'dark', or 'light') */
  setTheme: (theme: ThemePreference) => void;
  /** Backwards compatibility: setDark(true) sets 'dark', setDark(false) sets 'light' */
  setDark: (dark: boolean) => void;
  /** Toggles between explicit 'dark' and 'light' (used by profile menu item) */
  toggle: () => void;
  /** Whether Theme v2 feature flag is active */
  isV2: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const isV2 = isThemeV2Active();

  const [theme, setInternalTheme] = useState<ThemePreference>(() =>
    getStoredThemePreference(),
  );

  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() =>
    resolveCurrentTheme(theme),
  );

  // Apply synchronously before paint on mount and on theme change
  useIsomorphicLayoutEffect(() => {
    const resolved = applyThemeEarly(theme);
    setResolvedTheme(resolved);
  }, [theme]);

  // Subscribe to storage, custom events, and live OS matchMedia changes
  useEffect(() => {
    return subscribeThemePreference((newPref, newResolved) => {
      setInternalTheme(newPref);
      setResolvedTheme(newResolved);
    });
  }, []);

  const handleSetTheme = useCallback((newTheme: ThemePreference) => {
    setInternalTheme(newTheme);
    setThemePreference(newTheme);
    const resolved = applyThemeEarly(newTheme);
    setResolvedTheme(resolved);
  }, []);

  const handleSetDark = useCallback(
    (darkVal: boolean) => {
      handleSetTheme(darkVal ? "dark" : "light");
    },
    [handleSetTheme],
  );

  const handleToggle = useCallback(() => {
    // Profilmenü-Eintrag ruft useTheme().toggle() (setzt explizit 'dark' oder 'light')
    const next: ThemePreference = resolvedTheme === "dark" ? "light" : "dark";
    handleSetTheme(next);
  }, [resolvedTheme, handleSetTheme]);

  const value: ThemeContextValue = {
    theme,
    resolvedTheme,
    dark: resolvedTheme === "dark",
    setTheme: handleSetTheme,
    setDark: handleSetDark,
    toggle: handleToggle,
    isV2,
  };

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // If used outside ThemeProvider, provide a fallback connected directly to the store
    const currentTheme = getStoredThemePreference();
    const resolved = resolveCurrentTheme(currentTheme);
    return {
      theme: currentTheme,
      resolvedTheme: resolved,
      dark: resolved === "dark",
      setTheme: (t) => {
        setThemePreference(t);
        applyThemeEarly(t);
      },
      setDark: (d) => {
        const t: ThemePreference = d ? "dark" : "light";
        setThemePreference(t);
        applyThemeEarly(t);
      },
      toggle: () => {
        const next: ThemePreference = resolved === "dark" ? "light" : "dark";
        setThemePreference(next);
        applyThemeEarly(next);
      },
      isV2: isThemeV2Active(),
    };
  }
  return ctx;
}
