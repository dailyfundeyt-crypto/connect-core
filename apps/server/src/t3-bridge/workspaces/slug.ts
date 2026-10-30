/**
 * T3-Bridge — Workspace-Manager: Slugs.
 *
 * Lane: A07 (Welle W1).
 *
 * Ein Slug ist der Ordnername unter `%LOCALAPPDATA%\ConnectAgents\workspaces`.
 * Deshalb gilt: nur `a-z`, `0-9` und `-`. Keine Punkte, keine Leerzeichen,
 * keine Pfadtrenner — damit kann ein Agentenname niemals aus der Wurzel
 * ausbrechen. Deutsche Umlaute werden transliteriert (`Müller` → `mueller`),
 * damit der Ordner in Windows-Explorer und CLI gleich lesbar ist.
 */

/** Windows-Gerätenamen, die als Ordnername nicht funktionieren. */
const RESERVED_WINDOWS_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

/** Obergrenze des Ordner-/Slugnamens (Windows-Pfadlänge bleibt entspannt). */
export const MAX_WORKSPACE_SLUG_LENGTH = 48;

const MAX_SLUG_ATTEMPTS = 999;

/**
 * Agentenname → Slug.
 *
 * Beispiele: `Max Müller` → `max-mueller`, `Grüße & Co.` → `gruesse-co`,
 * `Agent 007 / Geheim` → `agent-007-geheim`, `???` → `agent`.
 */
export function slugifyAgentName(name: string): string {
  const lower = (name ?? "").trim().toLowerCase();
  if (!lower) return "agent";

  const transliterated = lower
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    // Kombinierende Akzente (é → e, ñ → n) entfernen.
    .replace(/[\u0300-\u036f]/g, "");

  const slug = transliterated
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_WORKSPACE_SLUG_LENGTH)
    .replace(/-+$/g, "");

  return sanitizeReserved(slug || "agent");
}

/** Gültiger Slug? (wird auch für manuell gesetzte Slugs geprüft) */
export function isValidWorkspaceSlug(slug: string): boolean {
  return (
    typeof slug === "string" &&
    slug.length > 0 &&
    slug.length <= MAX_WORKSPACE_SLUG_LENGTH &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) &&
    !RESERVED_WINDOWS_NAMES.has(slug)
  );
}

/**
 * Nächsten freien Slug vergeben.
 *
 * Kollisionen entstehen bei gleichen Agentennamen (`Max`, `Max`) oder nach
 * Umbenennungen. Der zweite Agent bekommt `max-2`, der dritte `max-3` — nie
 * denselben Ordner. `taken` wird ohne Rücksicht auf Groß-/Kleinschreibung
 * verglichen, weil Windows-Ordner das auch nicht tun.
 */
export function allocateWorkspaceSlug(
  base: string,
  taken: Iterable<string>,
): string {
  const normalizedBase = isValidWorkspaceSlug(base)
    ? base
    : slugifyAgentName(base);

  const used = new Set<string>();
  for (const value of taken) {
    if (typeof value === "string" && value.trim()) {
      used.add(value.trim().toLowerCase());
    }
  }

  if (!used.has(normalizedBase)) return normalizedBase;

  for (let attempt = 2; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const suffix = `-${attempt}`;
    const stem = normalizedBase
      .slice(0, MAX_WORKSPACE_SLUG_LENGTH - suffix.length)
      .replace(/-+$/g, "");
    const candidate = `${stem || "agent"}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  // 999 gleichnamige Agenten sind praktisch ausgeschlossen; trotzdem darf
  // hier nie ein bestehender Ordner herauskommen.
  const fallback = `agent-${Date.now().toString(36)}`;
  return used.has(fallback)
    ? `${fallback}-${process.pid.toString(36)}`
    : fallback;
}

function sanitizeReserved(slug: string): string {
  if (!slug) return "agent";
  if (RESERVED_WINDOWS_NAMES.has(slug)) return `agent-${slug}`;
  return slug;
}
