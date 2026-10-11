import { EXTENSION_REGISTRY } from "./registry";
import type { ExtensionKey, ExtensionsState } from "./types";

/**
 * Erweiterungs-Storage — localStorage mit Pub/Sub.
 *
 * Pattern bewusst identisch zu `app/src/lib/ui/lab-prefs.ts`:
 * - `getX()` / `setX()` / `subscribeX()`-API
 * - `storage`-Event für Cross-Tab-Updates
 * - eigenes Custom-Event für Same-Tab-Updates
 *
 * Schema-Versionierung: Wenn der Storage fehlende Keys hat (z. B. nach
 * einem Update), werden sie mit dem `defaultEnabled` aus der Registry
 * aufgefüllt. Veraltete Keys werden ignoriert.
 */

const STORAGE_KEY = "connect.extensions.v1";
const EVENT = "connect-extensions-changed";

const CURRENT_SCHEMA_VERSION = 1;

function readRaw(): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isValidRecord(value: unknown): value is Partial<ExtensionsState> {
  return typeof value === "object" && value !== null;
}

/** Baut den vollständigen State auf, mit Defaults für fehlende Keys. */
function buildState(): ExtensionsState {
  const state: Partial<ExtensionsState> = {};
  const raw = readRaw();
  if (isValidRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "boolean") {
        // Cast über unknown — wir prüfen unten explizit, ob der Key
        // in der Registry steht.
        (state as Record<string, boolean>)[key] = value;
      }
    }
  }
  // Mit Registry-Defaults mergen.
  const result: ExtensionsState = {
    flux: false,
    hyper: false,
    spark: false,
    analysis: false,
  };
  for (const manifest of EXTENSION_REGISTRY) {
    const stored = (state as Record<string, boolean | undefined>)[manifest.key];
    result[manifest.key] =
      typeof stored === "boolean" ? stored : manifest.defaultEnabled;
  }
  return result;
}

export function getExtensions(): ExtensionsState {
  return buildState();
}

export function isExtensionEnabled(key: ExtensionKey): boolean {
  return buildState()[key];
}

function writeState(state: ExtensionsState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // localStorage kann voll sein oder blockiert — wir geben stillschweigend
    // auf. Die UI bleibt auf dem aktuellen Stand.
  }
}

export function setExtensionEnabled(
  key: ExtensionKey,
  enabled: boolean,
): ExtensionsState {
  const next: ExtensionsState = { ...buildState(), [key]: enabled };
  writeState(next);
  return next;
}

export function setExtensions(
  partial: Partial<ExtensionsState>,
): ExtensionsState {
  const next: ExtensionsState = { ...buildState(), ...partial };
  writeState(next);
  return next;
}

export function subscribeExtensions(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  // Cross-Tab-Update: gleicher localStorage-Key, andere Tab-Instanz.
  // Eigener Ref, damit der Listener beim Unmount wirklich wieder weg ist —
  // sonst sammelt sich bei jedem Remount ein Listener in diesem Modul.
  const storageHandler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) handler();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", storageHandler);
  };
}

/** Nur für Tests / Migration: löscht den kompletten Erweiterungs-State. */
export function resetExtensions(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

export const EXTENSIONS_STORAGE_KEY = STORAGE_KEY;
export const EXTENSIONS_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
