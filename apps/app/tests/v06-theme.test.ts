import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  DEFAULT_THEME_PREFERENCE,
  resolveTheme,
  type ThemePreference,
} from "../src/contracts/v06/theme";
import {
  THEME_V2_STORAGE_KEY,
  THEME_V2_FLAG_STORAGE_KEY,
  getStoredThemePreference,
  setThemePreference,
  resolveCurrentTheme,
  subscribeThemePreference,
  isThemeV2Active,
} from "../src/v06/theme/themeStore";
import { applyThemeEarly } from "../src/v06/theme/applyThemeEarly";
import { ThemeChoiceStep } from "../src/v06/theme/ThemeChoiceStep";
import { ThemeSettingsSection } from "../src/v06/theme/ThemeSettingsSection";

describe("v06 Theme Contract: resolveTheme", () => {
  test("DEFAULT_THEME_PREFERENCE is 'system'", () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe("system");
  });

  test("explicit 'dark' always resolves to 'dark'", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("explicit 'light' always resolves to 'light'", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });

  test("'system' resolves to 'dark' when OS prefers dark", () => {
    expect(resolveTheme("system", true)).toBe("dark");
  });

  test("'system' resolves to 'light' when OS prefers light", () => {
    expect(resolveTheme("system", false)).toBe("light");
  });

  test("null / undefined / invalid values fallback to 'dark' (first principles: ohne Info dunkel)", () => {
    expect(resolveTheme(null, false)).toBe("dark");
    expect(resolveTheme(undefined, false)).toBe("dark");
    expect(resolveTheme("unknown", false)).toBe("dark");
    expect(resolveTheme("", false)).toBe("dark");
  });
});

describe("v06 Theme Store", () => {
  // Mock localStorage in memory for tests
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    // Enable flag for testing v2 store
    storage.set(THEME_V2_FLAG_STORAGE_KEY, "true");

    // Polyfill window & localStorage & document if not in browser environment
    if (typeof globalThis.window === "undefined") {
      (globalThis as any).window = {};
    }

    globalThis.window.localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, val: string) => storage.set(key, String(val)),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (i: number) => Array.from(storage.keys())[i] ?? null,
      length: storage.size,
    } as any;

    if (typeof globalThis.document === "undefined") {
      const classList = new Set<string>();
      (globalThis as any).document = {
        documentElement: {
          classList: {
            add: (c: string) => classList.add(c),
            remove: (c: string) => classList.delete(c),
            toggle: (c: string, force?: boolean) => {
              if (force === true) classList.add(c);
              else if (force === false) classList.delete(c);
              else if (classList.has(c)) classList.delete(c);
              else classList.add(c);
              return classList.has(c);
            },
            contains: (c: string) => classList.has(c),
          },
          style: {
            colorScheme: "",
          },
        },
        querySelector: (_sel: string) => ({
          content: "",
        }),
      };
    }

    // CustomEvent & EventListener polyfill
    if (typeof (globalThis.window as any).addEventListener !== "function") {
      const listeners: Record<string, Function[]> = {};
      (globalThis.window as any).addEventListener = (evt: string, fn: Function) => {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(fn);
      };
      (globalThis.window as any).removeEventListener = (evt: string, fn: Function) => {
        if (!listeners[evt]) return;
        listeners[evt] = listeners[evt].filter((f) => f !== fn);
      };
      (globalThis.window as any).dispatchEvent = (e: any) => {
        const fns = listeners[e.type] || [];
        fns.forEach((fn) => fn(e));
        return true;
      };
    }
  });

  afterEach(() => {
    storage.clear();
  });

  test("isThemeV2Active detects localStorage override", () => {
    expect(isThemeV2Active()).toBe(true);
    storage.set(THEME_V2_FLAG_STORAGE_KEY, "false");
    expect(isThemeV2Active()).toBe(false);
  });

  test("Default bei leerem Storage = 'system'", () => {
    storage.set(THEME_V2_FLAG_STORAGE_KEY, "true");
    expect(storage.get(THEME_V2_STORAGE_KEY)).toBeUndefined();
    expect(getStoredThemePreference()).toBe("system");
  });

  test("Store liest und schreibt Präferenzen ('dark', 'light', 'system')", () => {
    storage.set(THEME_V2_FLAG_STORAGE_KEY, "true");

    setThemePreference("dark");
    expect(storage.get(THEME_V2_STORAGE_KEY)).toBe("dark");
    expect(getStoredThemePreference()).toBe("dark");

    setThemePreference("light");
    expect(storage.get(THEME_V2_STORAGE_KEY)).toBe("light");
    expect(getStoredThemePreference()).toBe("light");

    setThemePreference("system");
    expect(storage.get(THEME_V2_STORAGE_KEY)).toBe("system");
    expect(getStoredThemePreference()).toBe("system");
  });

  test("resolveCurrentTheme applies system preference when pref is 'system'", () => {
    storage.set(THEME_V2_FLAG_STORAGE_KEY, "true");
    setThemePreference("system");

    // mock matchMedia: dark
    globalThis.window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as any;

    expect(resolveCurrentTheme()).toBe("dark");

    // mock matchMedia: light
    globalThis.window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as any;

    expect(resolveCurrentTheme()).toBe("light");
  });

  test("subscribeThemePreference notifies on preference change", () => {
    storage.set(THEME_V2_FLAG_STORAGE_KEY, "true");

    const received: {
      theme: ThemePreference | null;
      resolved: "dark" | "light" | null;
    } = {
      theme: null,
      resolved: null,
    };

    const unsubscribe = subscribeThemePreference((pref, resolved) => {
      received.theme = pref;
      received.resolved = resolved;
    });

    setThemePreference("light");
    expect(received.theme).toBe("light");
    expect(received.resolved).toBe("light");

    setThemePreference("dark");
    expect(received.theme).toBe("dark");
    expect(received.resolved).toBe("dark");

    unsubscribe();
    setThemePreference("light");
    // After unsubscribe, receivedTheme should not have updated from the second light call
  });
});

describe("v06 applyThemeEarly", () => {
  test("sets class 'dark' and style colorScheme synchronously", () => {
    const classList = new Set<string>();
    const docElem: any = {
      classList: {
        add: (c: string) => classList.add(c),
        remove: (c: string) => classList.delete(c),
        toggle: (c: string, force?: boolean) => {
          if (force === true) classList.add(c);
          else if (force === false) classList.delete(c);
          return classList.has(c);
        },
        contains: (c: string) => classList.has(c),
      },
      style: { colorScheme: "" },
    };

    (globalThis as any).document = {
      documentElement: docElem,
      querySelector: () => ({ content: "" }),
    };

    const resDark = applyThemeEarly("dark");
    expect(resDark).toBe("dark");
    expect(docElem.classList.contains("dark")).toBe(true);
    expect(docElem.style.colorScheme).toBe("dark");

    const resLight = applyThemeEarly("light");
    expect(resLight).toBe("light");
    expect(docElem.classList.contains("dark")).toBe(false);
    expect(docElem.style.colorScheme).toBe("light");
  });
});

describe("v06 Component Exports", () => {
  test("ThemeChoiceStep and ThemeSettingsSection are defined functions", () => {
    expect(typeof ThemeChoiceStep).toBe("function");
    expect(typeof ThemeSettingsSection).toBe("function");
  });
});
