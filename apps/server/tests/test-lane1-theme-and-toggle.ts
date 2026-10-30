import { describe, expect, test } from "bun:test";
import {
  getStoredTheme,
  resolveTheme,
  parseStoredDarkTheme,
  THEME_STORAGE_KEY,
  THEME_V3_MIGRATION_KEY,
  THEME_DEFAULT_MIGRATION_KEY,
} from "../../app/src/lib/theme";

describe("Swarm v3 Lane 1 – Dark Mode Default & Migration", () => {
  test("resolveTheme: 'light' resolves to light, everything else to dark", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("system")).toBe("dark");
    expect(resolveTheme(null)).toBe("dark");
    expect(resolveTheme(undefined)).toBe("dark");
  });

  test("parseStoredDarkTheme: only explicit 'light' returns false (light)", () => {
    expect(parseStoredDarkTheme("light")).toBe(false);
    expect(parseStoredDarkTheme("dark")).toBe(true);
    expect(parseStoredDarkTheme("system")).toBe(true);
    expect(parseStoredDarkTheme(null)).toBe(true);
    expect(parseStoredDarkTheme("")).toBe(true);
    expect(parseStoredDarkTheme("unknown")).toBe(true);
  });

  test("getStoredTheme: returns 'dark' by default when no storage exists", () => {
    // In node/bun environment without window, getStoredTheme defaults to dark
    expect(getStoredTheme()).toBe("dark");
  });
});

describe("Swarm v3 Lane 1 – ControlToggle Module Export", () => {
  test("ControlToggle component and useControlMode hook are exported", async () => {
    const mod = await import("../../app/src/components/control-toggle");
    expect(mod.ControlToggle).toBeDefined();
    expect(typeof mod.ControlToggle).toBe("function");
    expect(mod.useControlMode).toBeDefined();
    expect(typeof mod.useControlMode).toBe("function");
  });
});
