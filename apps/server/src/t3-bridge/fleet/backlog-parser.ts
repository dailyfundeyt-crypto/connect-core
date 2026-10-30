/**
 * T3-Bridge — Ideen-Backlog-Parser (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Liest `docs/ideen/IDEEN-BACKLOG.md` und macht daraus Agenten-Vorschläge.
 * Eine Zeile = eine Idee = ein Agent.
 *
 * Warum ein Parser und nicht „ein Agent pro Markdown-Datei“:
 * Stefan pflegt die Ideen in einem Dokument, das er liest. Ein Parser, der
 * eine Tabelle versteht, erlaubt es, das Dokument umzubauen (Spalten
 * umsortieren, Zeilen hinzufügen), ohne dass jemand Code anfassen muss.
 *
 * Das Format ist bewusst tolerant: eine Zeile, die nicht lesbar ist, wird
 * **nicht** stillschweigend übersprungen, sondern als `skipped` gemeldet.
 * Sonst entstünde eine Flotte, die kürzer ist als das Backlog, und niemand
 * sähe warum.
 */

import { FLEET_CLI_IDS, type FleetCliId, type FleetIdea, type FleetIdeaBook } from "./types";

/** Kürzester sinnvoller Ideenname. */
const MIN_NAME_LENGTH = 2;
/** Längster Agentenname (Connect-Agentennamen werden auch als Dateiname benutzt). */
const MAX_NAME_LENGTH = 60;

/**
 * Synonyme für die CLI.
 *
 * Stefans Notizen schreiben „claudeAgent“ (so heißt der T3-Treiber) und
 * „Claude“; Connect nennt es „claude“. Alle drei sind derselbe Agent.
 */
const CLI_ALIASES: Record<string, FleetCliId> = {
  codex: "codex",
  claude: "claude",
  claudeagent: "claude",
  claudeagentcode: "claude",
  antigravity: "antigravity",
  gemini: "antigravity",
  hermes: "hermes",
  freebuff: "freebuff",
  muse: "hermes",
  cursor: "hermes",
  pi: "hermes",
  opencode: "hermes",
  workspace: "codex",
};

/** Spaltenüberschriften, die wir erkennen. */
const HEADER_CELLS: Record<string, keyof FleetIdeaRow> = {
  id: "id",
  "idee": "title",
  "ideen": "title",
  "titel": "title",
  "title": "title",
  "cli": "cli",
  "engine": "cli",
  "agent": "name",
  "agentenname": "name",
  "name": "name",
  "beschreibung": "description",
  "kurzbeschreibung": "description",
  "description": "description",
  "rolle": "description",
};

/** Die Spalten einer Zeile, in der Reihenfolge des Dokuments. */
type FleetIdeaRow = {
  id: string;
  title: string;
  cli: string;
  name: string;
  description: string;
};

/**
 * Zerlegt eine Markdown-Tabellenzeile in Zellen.
 *
 * St Pipes am Anfang und Ende werden entfernt, weil eine Markdown-Tabelle
 * immer so aussieht: `| a | b |`. Auslassungen (`| |`) bleiben erhalten,
 * weil sie „dieses Feld ist leer“ bedeuten.
 */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split("|").map((cell) => cell.trim());
}

/** Ist die Zeile eine Tabellenzeile (mindestens eine Zelle mit Inhalt)? */
export function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && splitTableRow(line).length > 0;
}

/** Ist die Zeile eine Trennzeile (`|---|---|`)? */
export function isSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()))
  );
}

/**
 * Überschreibt eine Zelle: `**I1**` → `I1`, `` `codex` `` → `codex`.
 */
function stripDecoration(value: string): string {
  return value
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/^__(.*)__$/, "$1")
    .replace(/^`(.*)`$/, "$1")
    .trim();
}

/**
 * Ermittelt die CLI aus einer Zelle.
 *
 * Unbekannte Werte werden **nicht** stillschweigend auf `codex` gesetzt: der
 * Aufrufer soll wissen, dass die Backlog-Datei einen Tippfehler enthält.
 */
export function parseCliCell(
  value: string,
): { ok: true; cli: FleetCliId } | { ok: false; reason: string } {
  const raw = stripDecoration(value).toLowerCase().replace(/[\s_-]/g, "");
  if (!raw) return { ok: true, cli: "codex" };

  const mapped = CLI_ALIASES[raw];
  if (mapped) return { ok: true, cli: mapped };

  return {
    ok: false,
    reason: `Unbekannte CLI „${stripDecoration(value)}“. Erlaubt sind: ${FLEET_CLI_IDS.join(", ")}.`,
  };
}

/**
 * Leitet aus einer Idee einen Agentennamen ab.
 *
 * Der Name wird zum Dateinamen des Arbeitsordners (A07) und steht in der
 * Sidebar. Deshalb: keine Sonderzeichen, kein Umlaut-Problem (A07
 * transliteriert von selbst), und eine Längenbegrenzung.
 */
export function deriveAgentName(title: string, id: string): string {
  const cleaned = title
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const base = cleaned.length >= MIN_NAME_LENGTH ? cleaned : `Agent ${id}`.trim();
  return base.slice(0, MAX_NAME_LENGTH).trim();
}

/**
 * Liest die Spaltenzuordnung aus einer Kopfzeile.
 *
 * Ohne erkennbare Kopfzeile (also ohne Tabelle) wird die Standardreihenfolge
 * `ID | Idee | CLI | Name | Beschreibung` angenommen.
 */
function readHeader(cells: string[]): (keyof FleetIdeaRow)[] {
  const mapped = cells.map((cell) => {
    const key = stripDecoration(cell).toLowerCase();
    return HEADER_CELLS[key];
  });

  // Wenn mindestens eine Spalte benannt ist, nehmen wir die Zuordnung.
  if (mapped.some(Boolean)) {
    return mapped.map((value) => value ?? "description");
  }
  return ["id", "title", "cli", "name", "description"];
}

/**
 * Sieht die Zeile wie eine Kopfzeile aus?
 *
 * Die Regel ist streng: **alle** nicht-leeren Zellen müssen bekannte
 * Spaltennamen sein. Sonst wäre eine Datenzeile wie `| I1 | Idee | codex |`
 * eine Kopfzeile (weil „Idee“ ein Spaltenname ist) — und die Idee ginge
 * verloren. Mit der strengen Regel ist nur eine echte Kopfzeile eine
 * Kopfzeile.
 */
function looksLikeHeaderRow(cells: string[]): boolean {
  const named = cells.filter((cell) => stripDecoration(cell).trim() !== "");
  if (named.length === 0) return false;
  return named.every((cell) => {
    const key = stripDecoration(cell).toLowerCase();
    return HEADER_CELLS[key] !== undefined;
  });
}

/**
 * Parst ein Backlog-Dokument.
 *
 * @param markdown Der Rohtext des Dokuments.
 */
export function parseIdeaBacklog(markdown: string): FleetIdeaBook {
  const ideas: FleetIdea[] = [];
  const skipped: FleetIdeaBook["skipped"] = [];

  const lines = markdown.split(/\r?\n/);
  let columns: (keyof FleetIdeaRow)[] = ["id", "title", "cli", "name", "description"];
  let seenHeader = false;
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;

    // Code-Blöcke enthalten Markdown-Beispiele — keine Ideen.
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (!isTableRow(line)) continue;
    if (isSeparatorRow(line)) continue;

    const cells = splitTableRow(line);

    // Die erste Kopfzeile bestimmt die Spaltenreihenfolge.
    if (!seenHeader) {
      if (looksLikeHeaderRow(cells)) {
        columns = readHeader(cells);
      }
      seenHeader = true;
      if (looksLikeHeaderRow(cells)) continue;
    }

    const row: FleetIdeaRow = {
      id: "",
      title: "",
      cli: "",
      name: "",
      description: "",
    };
    cells.forEach((cell, cellIndex) => {
      const column = columns[cellIndex];
      if (!column) return;
      row[column] = stripDecoration(cell);
    });

    // Ohne Idee ist die Zeile keine Idee.
    if (!row.title) {
      skipped.push({
        line: lineNumber,
        text: line.trim(),
        reason: "Kein Ideen-Titel in der Zeile.",
      });
      continue;
    }

    const cli = parseCliCell(row.cli);
    if (!cli.ok) {
      skipped.push({ line: lineNumber, text: line.trim(), reason: cli.reason });
      continue;
    }

    const name = row.name || deriveAgentName(row.title, row.id || String(ideas.length + 1));

    ideas.push({
      id: row.id,
      title: row.title,
      cli: cli.cli,
      name: name.slice(0, MAX_NAME_LENGTH),
      description: row.description || row.title,
    });
  }

  return { markdown, ideas, skipped };
}

/**
 * Entfernt Ideen, deren Name schon vorkommt.
 *
 * Zwei Agenten dürfen nicht denselben Namen tragen (der Arbeitsordner wäre
 * sonst doppelt belegt, A07 würde ihn aber mit `-2` retten — der Name im
 * Raster wäre trotzdem zweimal da). Die Dubletten werden deshalb abgefangen
 * und als Fehler gemeldet, nicht stillschweigend umbenannt.
 */
export function dedupeIdeas(
  ideas: readonly FleetIdea[],
): { unique: FleetIdea[]; duplicates: FleetIdea[] } {
  const seen = new Set<string>();
  const unique: FleetIdea[] = [];
  const duplicates: FleetIdea[] = [];

  for (const idea of ideas) {
    const key = idea.name.trim().toLowerCase();
    if (!key) {
      duplicates.push(idea);
      continue;
    }
    if (seen.has(key)) {
      duplicates.push(idea);
      continue;
    }
    seen.add(key);
    unique.push(idea);
  }

  return { unique, duplicates };
}
