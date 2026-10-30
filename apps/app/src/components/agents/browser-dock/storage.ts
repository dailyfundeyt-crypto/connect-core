/**
 * A32 — Persistenz für die Browser-Andockleiste.
 *
 * EIGENTÜMER: A32.
 *
 * Gemerkt wird nur UI-Zustand (Modus + Breite) im localStorage.
 * Keine Tokens, keine Profilpfade, keine Cookies.
 */

import type { BrowserDockMode, BrowserDockSettings } from "./types";

export const BROWSER_DOCK_STORAGE_KEY = "connect.browser-dock";

export const BROWSER_DOCK_WIDTH_DEFAULT = 420;
export const BROWSER_DOCK_WIDTH_MIN = 300;
export const BROWSER_DOCK_WIDTH_MAX = 760;

/** Anteil des Fensters, den die Leiste höchstens einnehmen darf. */
const MAX_VIEWPORT_SHARE = 0.55;

export function isBrowserDockMode(value: unknown): value is BrowserDockMode {
  return value === "floating" || value === "docked";
}

/**
 * Begrenzt die Breite auf [300, 760] und zusätzlich auf 55 % des Fensters,
 * damit auf halbbreiten Fenstern noch Chat sichtbar bleibt.
 */
export function clampBrowserDockWidth(
  width: number,
  viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth,
): number {
  if (!Number.isFinite(width)) return BROWSER_DOCK_WIDTH_DEFAULT;
  const viewportMax = Math.max(
    BROWSER_DOCK_WIDTH_MIN,
    Math.floor(viewportWidth * MAX_VIEWPORT_SHARE),
  );
  const max = Math.min(BROWSER_DOCK_WIDTH_MAX, viewportMax);
  return Math.min(max, Math.max(BROWSER_DOCK_WIDTH_MIN, Math.round(width)));
}

/** Rohdaten (z. B. aus localStorage) defensiv in gültige Einstellungen wandeln. */
export function parseBrowserDockSettings(
  raw: unknown,
  viewportWidth?: number,
): BrowserDockSettings {
  const fallback: BrowserDockSettings = {
    // Flag an, aber noch nichts gewählt: altes Verhalten = schwebend.
    mode: "floating",
    width: BROWSER_DOCK_WIDTH_DEFAULT,
  };
  if (!raw || typeof raw !== "object") return fallback;
  const record = raw as { mode?: unknown; width?: unknown };
  return {
    mode: isBrowserDockMode(record.mode) ? record.mode : fallback.mode,
    width:
      typeof record.width === "number"
        ? clampBrowserDockWidth(record.width, viewportWidth)
        : fallback.width,
  };
}

/** `null`, wenn noch nie etwas gespeichert wurde (dann gilt der Aufrufer-Default). */
export function readStoredBrowserDockSettings(): BrowserDockSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BROWSER_DOCK_STORAGE_KEY);
    if (!raw) return null;
    return parseBrowserDockSettings(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function readBrowserDockSettings(): BrowserDockSettings {
  return readStoredBrowserDockSettings() ?? parseBrowserDockSettings(null);
}

export function writeBrowserDockSettings(settings: BrowserDockSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BROWSER_DOCK_STORAGE_KEY,
      JSON.stringify({
        mode: settings.mode,
        width: clampBrowserDockWidth(settings.width),
      }),
    );
  } catch {
    /* Speicher voll / privater Modus — UI funktioniert weiter ohne Merken. */
  }
}
