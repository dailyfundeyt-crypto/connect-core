/**
 * Local app security password — browser session unlock when the PC-local
 * database is the source of truth. Not a full auth system.
 */

const HASH_KEY = "connect.security-password-hash";
const UNLOCK_KEY = "connect.security-unlocked";
const EMAIL_KEY = "connect.security-email";

const DEFAULT_EMAIL = "stefankunc994@gmail.com";

/** Older single-user addresses — rewrite to Stefan’s Gmail on read. */
const LEGACY_EMAILS = new Set([
  "dev@connect.local",
  "stefan@connect.local",
]);

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getSecurityEmail(): string {
  if (typeof window === "undefined") return DEFAULT_EMAIL;
  const stored = window.localStorage.getItem(EMAIL_KEY)?.trim().toLowerCase();
  if (!stored || LEGACY_EMAILS.has(stored)) {
    if (stored && LEGACY_EMAILS.has(stored)) {
      window.localStorage.setItem(EMAIL_KEY, DEFAULT_EMAIL);
    }
    return DEFAULT_EMAIL;
  }
  return stored;
}

export function setSecurityEmail(email: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
}

export function hasSecurityPassword(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(HASH_KEY));
}

export function isSecurityUnlocked(): boolean {
  if (typeof window === "undefined") return true;
  if (!hasSecurityPassword()) return true;
  return (
    window.localStorage.getItem(UNLOCK_KEY) === "1" ||
    window.sessionStorage.getItem(UNLOCK_KEY) === "1"
  );
}

export async function setSecurityPassword(password: string): Promise<void> {
  if (typeof window === "undefined") return;
  const trimmed = password.trim();
  if (trimmed.length < 6) {
    throw new Error("Passwort muss mindestens 6 Zeichen haben.");
  }
  window.localStorage.setItem(HASH_KEY, await sha256(trimmed));
  window.localStorage.setItem(UNLOCK_KEY, "1");
  window.sessionStorage.setItem(UNLOCK_KEY, "1");
  window.dispatchEvent(new Event("connect-security-changed"));
}

export async function unlockWithPassword(password: string): Promise<boolean> {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(HASH_KEY);
  if (!stored) return true;
  const ok = (await sha256(password.trim())) === stored;
  if (ok) {
    window.localStorage.setItem(UNLOCK_KEY, "1");
    window.sessionStorage.setItem(UNLOCK_KEY, "1");
    window.dispatchEvent(new Event("connect-security-changed"));
  }
  return ok;
}

export function lockSecurity() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(UNLOCK_KEY);
  window.sessionStorage.removeItem(UNLOCK_KEY);
  window.dispatchEvent(new Event("connect-security-changed"));
}

export function clearSecurityPassword() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HASH_KEY);
  window.localStorage.removeItem(UNLOCK_KEY);
  window.sessionStorage.removeItem(UNLOCK_KEY);
  window.dispatchEvent(new Event("connect-security-changed"));
}

export function subscribeSecurity(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-security-changed", handler);
  return () => window.removeEventListener("connect-security-changed", handler);
}
