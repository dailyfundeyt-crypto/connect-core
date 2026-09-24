/**
 * Connect company handles — unique @names like Instagram / X / TikTok.
 * Format: @co/<handle> in the UI (Connect-native), stored without the prefix.
 */

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9])?$/;

export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, "")
    .replace(/^co\//i, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 30);
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle) && handle.length >= 2;
}

/** Public display: Connect-native @co/name (unique namespace vs generic @user). */
export function formatCompanyHandle(handle: string): string {
  const n = normalizeHandle(handle);
  return n ? `@co/${n}` : "";
}

export function handleFromName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return base || `co${Date.now().toString(36).slice(-6)}`;
}
