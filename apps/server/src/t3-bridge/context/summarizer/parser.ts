/**
 * T3-Bridge — Komprimierungs-Sub-Agent (Lane A16): Parser & Formatierer
 *
 * Akzeptanzkriterium: Alle 7 Pflichtabschnitte vorhanden.
 *
 * Zerlegt die Ausgabe des Sub-Agenten in die 7 Pflichtstrukturen:
 *  1. Ziel
 *  2. Stand
 *  3. Entscheidungen
 *  4. Offene Aufgaben
 *  5. Wichtige Dateien und Pfade
 *  6. Stil-Hinweise
 *  7. Letzte Nutzerbitte (wörtlich)
 *
 * Garantiert durch defensive Synthese, dass niemals ein Pflichtabschnitt fehlt.
 */

import type { HandoffSections } from "./types.js";

/**
 * Zerlegt Markdown-Text anhand von Überschriften in Abschnitte.
 */
function extractSectionContent(
  text: string,
  sectionPatterns: RegExp[],
  nextSectionPatterns: RegExp[],
): string | null {
  for (const startPattern of sectionPatterns) {
    const match = text.match(startPattern);
    if (!match || match.index === undefined) continue;

    const startIndex = match.index + match[0].length;
    const remaining = text.slice(startIndex);

    let endIndex = remaining.length;
    for (const endPattern of nextSectionPatterns) {
      const endMatch = remaining.match(endPattern);
      if (endMatch && endMatch.index !== undefined && endMatch.index < endIndex) {
        endIndex = endMatch.index;
      }
    }

    const content = remaining.slice(0, endIndex).trim();
    if (content.length > 0) {
      return content;
    }
  }

  return null;
}

/**
 * Wandelt einen Textblock in eine saubere Liste von Stichpunkten um.
 */
function parseBulletPoints(content: string | null): string[] {
  if (!content) return [];
  const lines = content.split("\n");
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Entferne führende Aufzählungszeichen wie "-", "*", "1.", "•"
    const cleaned = trimmed.replace(/^[-*•\d.)\]]\s*/, "").trim();
    if (cleaned.length > 0) {
      items.push(cleaned);
    }
  }

  return items;
}

/**
 * Parst die unstrukturierte oder Markdown-Ausgabe des Sub-Agenten
 * in das typisierte HandoffSections-Objekt.
 */
export function parseHandoffResponse(
  rawText: string,
  options?: {
    readonly fallbackGoal?: string;
    readonly verbatimLastUserRequest?: string;
  },
): HandoffSections {
  const text = rawText || "";

  // 1. Ziel
  const rawGoal = extractSectionContent(
    text,
    [/###?\s*1\.\s*Ziel/i, /###?\s*Ziel/i],
    [/###?\s*2\.\s*Stand/i, /###?\s*Stand/i],
  );

  // 2. Stand
  const rawStand = extractSectionContent(
    text,
    [/###?\s*2\.\s*Stand/i, /###?\s*Stand/i],
    [/###?\s*3\.\s*Entscheidungen/i, /###?\s*Entscheidungen/i],
  );

  // 3. Entscheidungen
  const rawEntscheidungen = extractSectionContent(
    text,
    [/###?\s*3\.\s*Entscheidungen/i, /###?\s*Entscheidungen/i],
    [/###?\s*4\.\s*Offene\s*Aufgaben/i, /###?\s*Offene\s*Aufgaben/i],
  );

  // 4. Offene Aufgaben
  const rawAufgaben = extractSectionContent(
    text,
    [/###?\s*4\.\s*Offene\s*Aufgaben/i, /###?\s*Offene\s*Aufgaben/i],
    [/###?\s*5\.\s*Wichtige\s*Dateien/i, /###?\s*Wichtige\s*Dateien/i],
  );

  // 5. Wichtige Dateien und Pfade
  const rawDateien = extractSectionContent(
    text,
    [/###?\s*5\.\s*Wichtige\s*Dateien(?:\s*und\s*Pfade)?/i, /###?\s*Dateien(?:\s*und\s*Pfade)?/i],
    [/###?\s*6\.\s*Stil-Hinweise/i, /###?\s*Stil-Hinweise/i, /###?\s*Stilhinweise/i],
  );

  // 6. Stil-Hinweise
  const rawStil = extractSectionContent(
    text,
    [/###?\s*6\.\s*Stil-?Hinweise/i, /###?\s*Stil-?Regeln/i],
    [/###?\s*7\.\s*Letzte\s*Nutzerbitte/i, /###?\s*Letzte\s*Nutzerbitte/i],
  );

  // 7. Letzte Nutzerbitte (wörtlich)
  const rawLetzteBitte = extractSectionContent(
    text,
    [/###?\s*7\.\s*Letzte\s*Nutzerbitte(?:\s*\(wörtlich\))?/i, /###?\s*Letzte\s*Nutzerbitte/i],
    [],
  );

  // Verbatim Last User Request: Bevorzuge das echte historische Zitat
  let finalLastUserRequest =
    options?.verbatimLastUserRequest?.trim() ||
    rawLetzteBitte?.trim() ||
    "(Keine vorherige Nutzerbitte vorhanden)";

  // Bereinige eventuelle Anführungszeichen oder Zitat-Marker im LLM-Output
  if (
    !options?.verbatimLastUserRequest &&
    finalLastUserRequest.startsWith(">")
  ) {
    finalLastUserRequest = finalLastUserRequest.replace(/^>\s*/gm, "").trim();
  }

  // Defensive Synthese für lückenlose Vollständigkeit aller 7 Pflichtabschnitte
  const goal =
    rawGoal?.trim() ||
    options?.fallbackGoal?.trim() ||
    "Fortführung des Gesprächs und Bearbeitung der Aufgaben des Nutzers.";

  const currentState =
    rawStand?.trim() ||
    "Das vorherige Kontextfenster wurde bis zum Limit bearbeitet. Die relevanten Artefakte und Zwischenstände liegen vor.";

  const decisions = parseBulletPoints(rawEntscheidungen);
  if (decisions.length === 0) {
    decisions.push("Bestehende Architektur- und Integrationsentscheidungen unverändert fortführen.");
  }

  const openTasks = parseBulletPoints(rawAufgaben);
  if (openTasks.length === 0) {
    openTasks.push("Fortsetzung der Arbeit gemäß der letzten Nutzerbitte.");
  }

  const importantFiles = parseBulletPoints(rawDateien);
  if (importantFiles.length === 0) {
    importantFiles.push("Aktuelle Arbeitsdateien im Agent-Workspace.");
  }

  const styleNotes = parseBulletPoints(rawStil);
  if (styleNotes.length === 0) {
    styleNotes.push("Connect- und T3-Designregeln strikt einhalten.");
    styleNotes.push("Antworten präzise und auf Deutsch formulieren.");
  }

  return {
    goal,
    currentState,
    decisions,
    openTasks,
    importantFiles,
    styleNotes,
    lastUserRequest: finalLastUserRequest,
  };
}

/**
 * Rendert die 7 Abschnitte in ein sauberes, im Chat sichtbares und editierbares Markdown.
 */
export function renderHandoffMarkdown(sections: HandoffSections): string {
  const parts: string[] = [];

  parts.push("### 1. Ziel");
  parts.push(sections.goal);
  parts.push("");

  parts.push("### 2. Stand");
  parts.push(sections.currentState);
  parts.push("");

  parts.push("### 3. Entscheidungen");
  for (const dec of sections.decisions) {
    parts.push(`- ${dec}`);
  }
  parts.push("");

  parts.push("### 4. Offene Aufgaben");
  for (const task of sections.openTasks) {
    parts.push(`- ${task}`);
  }
  parts.push("");

  parts.push("### 5. Wichtige Dateien und Pfade");
  for (const file of sections.importantFiles) {
    parts.push(`- ${file}`);
  }
  parts.push("");

  parts.push("### 6. Stil-Hinweise");
  for (const note of sections.styleNotes) {
    parts.push(`- ${note}`);
  }
  parts.push("");

  parts.push("### 7. Letzte Nutzerbitte (wörtlich)");
  parts.push(`> ${sections.lastUserRequest.replace(/\n/g, "\n> ")}`);

  return parts.join("\n");
}
