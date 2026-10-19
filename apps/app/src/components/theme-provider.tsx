import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import {
  applyDarkTheme,
  parseStoredDarkTheme,
  THEME_DEFAULT_MIGRATION_KEY,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

type ThemeContextValue = {
  dark: boolean;
  setDark: (dark: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(() => {
    try {
      // Existing installs may carry the old light default. Migrate once, then respect choices.
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

  // Apply before paint so switching themes recolors the existing page without a light-frame flash.
  useLayoutEffect(() => {
    applyDarkTheme(dark, {
      setStoredValue: (key, value) => window.localStorage.setItem(key, value),
      toggleRootClass: (name, force) =>
        document.documentElement.classList.toggle(name, force),
      setRootColorScheme: (scheme) => {
        document.documentElement.style.colorScheme = scheme;
      },
    });
    void import("@/lib/desktop-bridge").then((m) => m.notifyDesktopTheme(dark));
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, setDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return value;
}
