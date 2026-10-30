/**
 * Company modes — product names (icon rail).
 *
 * Focus        — quick tasks
 * Messages     — AIs / channels (HQ)
 * Browser      — Lab Chromium + app tabs (build)
 * Unternehmen  — static company site (one URL, no tabs)
 * Agents       — T3 Code: projects, threads and agents on this PC
 */

import { getT3Flag } from "@/lib/t3/contracts";

export type CompanyLevel = 1 | 2 | 3 | 4 | 5;

/** Product short names for chips / UI */
export const MODE_NAMES: Record<CompanyLevel, string> = {
  1: "Focus",
  2: "Messages",
  3: "Browser",
  4: "Unternehmen",
  5: "Agents",
};

export const LEVEL_LABELS: Record<CompanyLevel, string> = {
  1: "Focus — schnelle Aufgaben",
  2: "Messages — deine AIs & Kanäle",
  3: "Browser — Apps & Tabs zum Bauen",
  4: "Unternehmen — feste Firmen-URL",
  5: "Agents — T3 Code für deine Agenten",
};

export const LEVEL_BLURBS: Record<CompanyLevel, string> = {
  1: "Schnelle Tasks: ein Agent-Fenster, ← → wechselt.",
  2: "Messages: Kanäle und AIs — wie Slack für eure Company.",
  3: "Browser: Chromium + App-Ordner. Agenten bauen hier. ★ startet die Software.",
  4: "Unternehmen: einmal URL setzen — danach steht die Firmen-Seite fest, ohne Tabs.",
  5: "Agents: T3 Code — Projekte, Threads und Agenten auf diesem PC steuern.",
};

const STORAGE_KEY = "connect.activeLevel";
const EVENT = "connect-active-level";

export function isCompanyLevel(value: unknown): value is CompanyLevel {
  return (
    value === 1 || value === 2 || value === 3 || value === 4 || value === 5
  );
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

/**
 * Ob Modus 5 („Agents — T3 Code“) sichtbar bleiben darf.
 *
 * Stefan möchte den T3-Modus oben weghaben: der Agenten-/Firmen-Umschalter bleibt,
 * aber der T3-Code-Einstieg verschwindet. Hinter dem A01-Flag `connect.t3.hideAgentsMode`
 * ist er standardmäßig ausgeblendet. Die Dateien des Modus bleiben unangetastet — nur
 * der Einstieg in der oberen Leiste verschwindet.
 *
 * Flag aus = der T3-Modus ist wieder sichtbar (altes Verhalten).
 */
export function isAgentsModeVisible(): boolean {
  return !getT3Flag("hideAgentsMode");
}

/**
 * Die Modi, die in der oberen Leiste wählbar sind.
 *
 * Modus 4 („Unternehmen") hat dort noch nie einen Chip — er ist eine eigene Route.
 */
export type VisibleCompanyLevel = 1 | 2 | 3 | 5;

/**
 * Die Liste der sichtbaren Modi.
 *
 * Modus 5 (Agents — T3 Code) fällt weg, sobald das Flag `hideAgentsMode` gesetzt ist.
 * Die anderen Modi bleiben unverändert in Reihenfolge.
 */
export function visibleCompanyLevels(): readonly VisibleCompanyLevel[] {
  return isAgentsModeVisible() ? ([1, 2, 3, 5] as const) : ([1, 2, 3] as const);
}
