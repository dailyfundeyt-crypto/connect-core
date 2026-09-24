/**
 * Company modes — product names (icon rail).
 *
 * Focus        — quick tasks
 * Messages     — AIs / channels (HQ)
 * Browser      — Lab Chromium + app tabs (build)
 * Unternehmen  — static company site (one URL, no tabs)
 */

export type CompanyLevel = 1 | 2 | 3 | 4;

/** Product short names for chips / UI */
export const MODE_NAMES: Record<CompanyLevel, string> = {
  1: "Focus",
  2: "Messages",
  3: "Browser",
  4: "Unternehmen",
};

export const LEVEL_LABELS: Record<CompanyLevel, string> = {
  1: "Focus — schnelle Aufgaben",
  2: "Messages — deine AIs & Kanäle",
  3: "Browser — Apps & Tabs zum Bauen",
  4: "Unternehmen — feste Firmen-URL",
};

export const LEVEL_BLURBS: Record<CompanyLevel, string> = {
  1: "Schnelle Tasks: ein Agent-Fenster, ← → wechselt.",
  2: "Messages: Kanäle und AIs — wie Slack für eure Company.",
  3: "Browser: Chromium + App-Ordner. Agenten bauen hier. ★ startet die Software.",
  4: "Unternehmen: einmal URL setzen — danach steht die Firmen-Seite fest, ohne Tabs.",
};

const STORAGE_KEY = "connect.activeLevel";
const EVENT = "connect-active-level";

export function isCompanyLevel(value: unknown): value is CompanyLevel {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function getActiveLevel(): CompanyLevel {
  if (typeof window === "undefined") return 2;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number(raw) : 2;
  return isCompanyLevel(parsed) ? parsed : 2;
}

export function setActiveLevel(level: CompanyLevel) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(level));
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeLevel(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
