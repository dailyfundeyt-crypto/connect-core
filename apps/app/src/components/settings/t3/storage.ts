/**
 * T3-Einstellungen — Lokaler Speicher & Reaktivität (Lane A25).
 *
 * Verwaltet die Benutzereinstellungen im Browser (localStorage) mit automatischem Fallback
 * auf DEFAULT_T3_UNIFIED_SETTINGS und Reaktivität über Storage- und Custom-Events.
 */

import { useEffect, useState } from "react";
import {
  DEFAULT_T3_UNIFIED_SETTINGS,
  type T3UnifiedSettings,
  type T3UnifiedSettingsPatch,
} from "./types";

const STORAGE_KEY = "connect_t3_settings_v1";
const CHANGE_EVENT = "connect:t3:settings-changed";

/**
 * Liest die aktuellen T3-Einstellungen synchron aus dem Speicher.
 */
export function getT3UnifiedSettings(): T3UnifiedSettings {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_T3_UNIFIED_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_T3_UNIFIED_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<T3UnifiedSettings>;

    return {
      sidecar: {
        ...DEFAULT_T3_UNIFIED_SETTINGS.sidecar,
        ...(parsed.sidecar ?? {}),
      },
      concurrency: {
        ...DEFAULT_T3_UNIFIED_SETTINGS.concurrency,
        ...(parsed.concurrency ?? {}),
        providerLimits: {
          ...DEFAULT_T3_UNIFIED_SETTINGS.concurrency.providerLimits,
          ...(parsed.concurrency?.providerLimits ?? {}),
        },
      },
      context: {
        ...DEFAULT_T3_UNIFIED_SETTINGS.context,
        ...(parsed.context ?? {}),
      },
      tokenSaving: {
        ...DEFAULT_T3_UNIFIED_SETTINGS.tokenSaving,
        ...(parsed.tokenSaving ?? {}),
      },
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return DEFAULT_T3_UNIFIED_SETTINGS;
  }
}

/**
 * Speichert Änderungen an den T3-Einstellungen und informiert alle Abonnenten.
 */
export function saveT3UnifiedSettings(patch: T3UnifiedSettingsPatch): T3UnifiedSettings {
  const current = getT3UnifiedSettings();
  const next: T3UnifiedSettings = {
    ...current,
    ...patch,
    sidecar: patch.sidecar ? { ...current.sidecar, ...patch.sidecar } : current.sidecar,
    concurrency: patch.concurrency
      ? {
          ...current.concurrency,
          ...patch.concurrency,
          providerLimits: {
            ...current.concurrency.providerLimits,
            ...(patch.concurrency.providerLimits ?? {}),
          },
        }
      : current.concurrency,
    context: patch.context ? { ...current.context, ...patch.context } : current.context,
    tokenSaving: patch.tokenSaving
      ? { ...current.tokenSaving, ...patch.tokenSaving }
      : current.tokenSaving,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
    } catch {
      // Ignoriere Speicherfehler bei vollem Speicher
    }
  }

  return next;
}

/**
 * Setzt alle Einstellungen auf die Standardwerte zurück.
 */
export function resetT3UnifiedSettings(): T3UnifiedSettings {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, { detail: DEFAULT_T3_UNIFIED_SETTINGS }),
      );
    } catch {
      // ignore
    }
  }
  return DEFAULT_T3_UNIFIED_SETTINGS;
}

/**
 * Abonniert Änderungen an den T3-Einstellungen.
 */
export function subscribeT3UnifiedSettings(
  callback: (settings: T3UnifiedSettings) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleCustom = (e: Event) => {
    const detail = (e as CustomEvent<T3UnifiedSettings>).detail;
    callback(detail || getT3UnifiedSettings());
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      callback(getT3UnifiedSettings());
    }
  };

  window.addEventListener(CHANGE_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}

/**
 * React-Hook für reaktive T3-Einstellungen.
 */
export function useT3UnifiedSettings(): {
  settings: T3UnifiedSettings;
  updateSettings: (patch: T3UnifiedSettingsPatch) => void;
  resetSettings: () => void;
} {
  const [settings, setSettings] = useState<T3UnifiedSettings>(() => getT3UnifiedSettings());

  useEffect(() => {
    return subscribeT3UnifiedSettings((next) => {
      setSettings(next);
    });
  }, []);

  return {
    settings,
    updateSettings: (patch) => {
      const next = saveT3UnifiedSettings(patch);
      setSettings(next);
    },
    resetSettings: () => {
      const reset = resetT3UnifiedSettings();
      setSettings(reset);
    },
  };
}
