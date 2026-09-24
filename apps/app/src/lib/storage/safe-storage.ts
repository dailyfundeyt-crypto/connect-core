/**
 * Tiny typed wrappers around `localStorage` with the same JSON-roundtrip +
 * try/catch fallback that every call-site used to write by hand.
 *
 *   const ids = readJSON<string[]>(STORAGE_KEYS.agentApiKeys) ?? [];
 *   writeJSON(STORAGE_KEYS.agentApiKeys, ids);
 *
 * Falls back to `null` / leaves the key untouched if the value is not valid
 * JSON, the key is missing, or storage is unavailable (private mode, etc.).
 */
export function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded, private mode, etc. — silent on purpose */
  }
}

export function readString(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value == null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    /* silent */
  }
}

export function removeKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* silent */
  }
}
