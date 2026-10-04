/**
 * Who may do what in the Brain, decided per call from Brain/agents.json.
 *
 * Every Brain tool a Connect agent holds asks these functions, with the entry pinned to that agent's
 * id (`connectAgentId`). No entry means no access. Nothing here overwrites: writing is append-only,
 * and new files are created only where the area allows it (Inbox: new files only).
 */
import type { BrainAgentEntry, BrainArea, BrainProject } from "./store";

export type BrainOp = "read" | "append" | "create";

export class BrainDenied extends Error {}

const ROOT_APPENDABLE = new Set(["hot.md", "index.md"]);

/** Normalised relative path or a German refusal. */
export function normalisePath(input: unknown): string {
  if (typeof input !== "string") throw new BrainDenied("Pfad fehlt.");
  const trimmed = input.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^Brain\//i, "");
  if (!trimmed || trimmed.length > 200 || trimmed.includes("\0")) throw new BrainDenied("Ungültiger Pfad.");
  if (/^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith("/")) throw new BrainDenied("Nur Pfade innerhalb des Brains (relativ, z. B. Shared/Stefan.md).");
  const parts = trimmed.split("/");
  if (parts.length > (parts[0] === "Vault" ? 7 : 4)) throw new BrainDenied("Pfad ist zu tief verschachtelt.");
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.startsWith(".")) throw new BrainDenied("Ungültiger Pfad.");
    if (!/^[\p{L}\p{N} _.,()+&-]+$/u.test(part)) throw new BrainDenied(`Ungültiges Zeichen im Pfad: ${part}`);
  }
  if (!trimmed.toLowerCase().endsWith(".md")) throw new BrainDenied("Nur .md-Dateien.");
  return parts.join("/");
}

/** Which permission area a path belongs to, seen from one agent. Null: outside every area. */
export function areaOf(path: string, slug: string, projects: BrainProject[] = []): BrainArea | null {
  const parts = path.split("/");
  if (parts.length === 1) return path.toLowerCase() === "log.md" ? "log" : "Kern";
  switch (parts[0]) {
    case "Vault":
      return projectOfVault(parts.slice(1).join("/"), projects);
    case "Shared":
      return "Shared";
    case "Projects": {
      const project = projects.find((p) => p.moc && p.moc.toLowerCase() === path.toLowerCase());
      return project ? `Projekt:${project.id}` : "Projects";
    }
    case "Daily":
      return "Daily";
    case "Inbox":
      return "Inbox";
    case "Skills":
      return "Skills";
    case "_templates":
      return "Kern";
    case "Memory":
      if (parts.length === 2) return "Kern";
      return parts[1] === slug ? "Memory:eigen" : "Memory";
    default:
      return null;
  }
}

/**
 * The project a vault note belongs to: by folder (`Flux/…`) or listed root file. A note in a folder no
 * project names falls under `Projects` (= all projects), so a new folder is never readable by accident.
 */
export function projectOfVault(rel: string, projects: BrainProject[]): BrainArea {
  const lower = rel.toLowerCase();
  for (const project of projects) {
    if (project.files.some((file) => file.replace(/\\/g, "/").toLowerCase() === lower)) return `Projekt:${project.id}`;
    if (project.folders.some((folder) => lower.startsWith(`${folder.replace(/\\/g, "/").toLowerCase()}/`))) return `Projekt:${project.id}`;
  }
  return "Projects";
}

const AREA_DE: Record<string, string> = {
  Kern: "Kern (AGENTS, hot, index, Regeln)",
  Shared: "Shared",
  Projects: "Projekte",
  Memory: "Memory (andere Agents)",
  "Memory:eigen": "Memory (eigener Ordner)",
  Daily: "Daily",
  Inbox: "Inbox",
  Skills: "Skills",
  log: "Log",
};

function has(list: BrainArea[], area: BrainArea) {
  if (list.includes(area)) return true;
  // "Projekte (alle)" covers every single project.
  if (area.startsWith("Projekt:")) return list.includes("Projects");
  // "Memory (alle)" covers the agent's own folder too.
  return area === "Memory:eigen" && list.includes("Memory");
}

export function canRead(entry: BrainAgentEntry, path: string, projects: BrainProject[] = []): boolean {
  const area = areaOf(path, entry.slug, projects);
  return area !== null && has(entry.read, area);
}

/** Throws BrainDenied with the reason in German, or returns the area. */
export function assertAllowed(
  entry: BrainAgentEntry,
  path: string,
  op: BrainOp,
  exists: boolean,
  projects: BrainProject[] = [],
): BrainArea {
  const area = areaOf(path, entry.slug, projects);
  if (!area) throw new BrainDenied(`Kein Zugriff: "${path}" liegt in keinem Brain-Bereich.`);
  const project = area.startsWith("Projekt:") ? projects.find((p) => `Projekt:${p.id}` === area) : undefined;
  const label = project ? `Projekt ${project.name}` : (AREA_DE[area] ?? area);
  if (op === "read") {
    if (!has(entry.read, area)) throw new BrainDenied(`Kein Lesezugriff auf ${label} für ${entry.slug}.`);
    return area;
  }
  if (path.startsWith("Vault/")) {
    throw new BrainDenied("Vault-Notizen außerhalb des Brains sind schreibgeschützt. Ergänzungen an die Projekt-Übersicht in Projects/ anhängen.");
  }
  if (!has(entry.write, area)) throw new BrainDenied(`Kein Schreibzugriff auf ${label} für ${entry.slug}.`);
  if (area === "log") throw new BrainDenied("log.md schreibt Connect selbst – direkt schreiben ist nicht erlaubt.");
  const parts = path.split("/");
  if (area === "Kern") {
    if (parts.length !== 1 || !ROOT_APPENDABLE.has(path)) {
      throw new BrainDenied(`"${path}" ist geschützt (Regeln, Vorlagen, agents.json) und wird nur von Stefan geändert.`);
    }
    if (op === "create") throw new BrainDenied("Im Kern werden keine neuen Dateien angelegt.");
  }
  if (area === "Inbox") {
    if (op === "append") throw new BrainDenied("In der Inbox werden nur neue Dateien angelegt, bestehende werden nicht verändert.");
    if (exists) throw new BrainDenied(`"${path}" gibt es schon – in der Inbox nur neue Dateien.`);
  }
  if (op === "create" && exists) {
    throw new BrainDenied(`"${path}" gibt es schon. Überschreiben ist nicht erlaubt – nutze brain_append.`);
  }
  if (op === "append" && !exists && area !== "Memory:eigen" && area !== "Memory" && area !== "Daily") {
    throw new BrainDenied(`"${path}" gibt es nicht. Neue Dateien mit brain_write anlegen.`);
  }
  return area;
}

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /\b(passwor[dt]|kennwort|api[_-]?key|secret|token)\s*[:=]\s*\S{6,}/i,
];

export function assertNoSecrets(text: string) {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new BrainDenied("Abgelehnt: Der Text sieht nach einem Passwort, Key oder Token aus. Secrets gehören nicht ins Brain.");
  }
}
