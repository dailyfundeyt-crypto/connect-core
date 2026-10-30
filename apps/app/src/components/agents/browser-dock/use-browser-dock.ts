/**
 * A32 — Zustand der Browser-Andockleiste (Modus, Breite, schmales Fenster).
 *
 * EIGENTÜMER: A32.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BROWSER_DOCK_WIDTH_DEFAULT,
  clampBrowserDockWidth,
  readStoredBrowserDockSettings,
  writeBrowserDockSettings,
} from "./storage";
import type { BrowserDockMode, BrowserDockSettings } from "./types";

/** Unter dieser Fensterbreite ist eine rechte Leiste nicht sinnvoll. */
const NARROW_BREAKPOINT = 720;

export function useNarrowViewport(breakpoint = NARROW_BREAKPOINT): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint,
  );

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < breakpoint);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return narrow;
}

export type BrowserDockState = {
  mode: BrowserDockMode;
  width: number;
  setMode: (mode: BrowserDockMode) => void;
  /** `save = true` beim Ende einer Zieh-Geste oder Tastaturänderung. */
  setWidth: (width: number, save?: boolean) => void;
};

/**
 * Merkt Modus und Breite. Ohne gespeicherte Wahl gilt `defaultMode`
 * (Standard „floating" = bisheriges Verhalten).
 */
export function useBrowserDock({
  defaultMode = "floating",
}: { defaultMode?: BrowserDockMode } = {}): BrowserDockState {
  const [settings, setSettings] = useState<BrowserDockSettings>(() => {
    const stored = readStoredBrowserDockSettings();
    if (stored) return stored;
    return {
      mode: defaultMode,
      width: clampBrowserDockWidth(BROWSER_DOCK_WIDTH_DEFAULT),
    };
  });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const update = useCallback(
    (patch: Partial<BrowserDockSettings>, persist: boolean) => {
      const next: BrowserDockSettings = {
        ...settingsRef.current,
        ...patch,
        width: clampBrowserDockWidth(
          patch.width ?? settingsRef.current.width,
        ),
      };
      settingsRef.current = next;
      setSettings(next);
      if (persist) writeBrowserDockSettings(next);
    },
    [],
  );

  const setMode = useCallback(
    (mode: BrowserDockMode) => update({ mode }, true),
    [update],
  );
  const setWidth = useCallback(
    (width: number, save = false) => update({ width }, save),
    [update],
  );

  return {
    mode: settings.mode,
    width: settings.width,
    setMode,
    setWidth,
  };
}
