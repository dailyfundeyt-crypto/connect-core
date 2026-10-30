/**
 * T3-Bridge — Komprimierungs-Sub-Agent (Lane A16): Prompt & Transkript-Aufbereitung
 *
 * Aufgabe 2: Feste Übergabe-Struktur:
 *  - Ziel
 *  - Stand
 *  - Entscheidungen
 *  - offene Aufgaben
 *  - wichtige Dateien/Pfade
 *  - Stil-Hinweise
 *  - letzte Nutzerbitte (wörtlich)
 *
 * Grenze: Übergabe ≤ 8 000 Tokens.
 */

import type { SummarizerMessage } from "./types.js";

/**
 * System-Prompt für den Komprimierungs-Sub-Agenten.
 */
export const SUMMARIZER_SYSTEM_PROMPT = `Du bist ein hochpräziser Komprimierungs-Sub-Agent im System „Connect T3-Bridge“.
Deine Aufgabe ist es, einen langen Gesprächsverlauf (bis zu 100.000 Tokens) zu analysieren und für das nächste
frische Kontextfenster des Agenten eine vollständige, präzise Übergabe (Handoff) zu erstellen.

WICHTIGE VORGABEN:
1. Verwende AUSSCHLIESSLICH die folgende feste 7-teilige Gliederung mit genau diesen Überschriften:
   ### 1. Ziel
   ### 2. Stand
   ### 3. Entscheidungen
   ### 4. Offene Aufgaben
   ### 5. Wichtige Dateien und Pfade
   ### 6. Stil-Hinweise
   ### 7. Letzte Nutzerbitte (wörtlich)

2. DETAILS ZU DEN ABSCHNITTEN:
   - ### 1. Ziel: Was ist das übergeordnete Ziel des Nutzers und das Hauptvorhaben des Projekts?
   - ### 2. Stand: Was wurde bisher erfolgreich umgesetzt, getestet und verifiziert?
   - ### 3. Entscheidungen: Welche Architektur-, Bibliotheks- und Design-Entscheidungen wurden getroffen?
   - ### 4. Offene Aufgaben: Welche konkreten Schritte, Tests oder Implementierungen stehen als Nächstes an?
   - ### 5. Wichtige Dateien und Pfade: Welche Dateien, Module und Pfade sind für die Weiterarbeit zentral?
   - ### 6. Stil-Hinweise: Welche Arbeitsregeln, Programmierstile, Sprachvorgaben oder Nutzerpräferenzen gelten?
   - ### 7. Letzte Nutzerbitte (wörtlich): Zitiere die ALLERLETZTE Aufforderung oder Frage des Nutzers EXAKT und WÖRTLICH. Formuliere sie nicht um!

3. SICHERHEIT & DATENSCHUTZ:
   - Gib NIEMALS Passwörter, API-Keys, Bearer-Tokens, Secrets oder Credentials aus.

4. TOKEN-BUDGET:
   - Die gesamte Übergabe muss prägnant und strikt innerhalb von 8.000 Tokens bleiben.
   - Schreibe auf Deutsch.`;

/**
 * Extrahiert die letzte Nutzerbitte wörtlich aus dem Nachrichtenverlauf.
 */
export function extractLastUserRequest(
  history: ReadonlyArray<SummarizerMessage>,
): string {
  if (!history || history.length === 0) {
    return "(Keine vorherige Nutzerbitte im Verlauf)";
  }

  // Suche rückwärts nach der letzten Nachricht mit role === "user"
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg && msg.role === "user" && msg.content.trim().length > 0) {
      return msg.content.trim();
    }
  }

  return "(Keine vorherige Nutzerbitte im Verlauf)";
}

/**
 * Bereitet den Nachrichtenverlauf für den Sub-Agenten als lesbares Transkript auf.
 */
export function formatConversationTranscript(
  history: ReadonlyArray<SummarizerMessage>,
): string {
  if (!history || history.length === 0) {
    return "(Leerer Gesprächsverlauf)";
  }

  const lines: string[] = [];

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];
    if (!msg) continue;

    const roleLabel =
      msg.role === "user"
        ? "NUTZER"
        : msg.role === "assistant"
          ? "AGENT"
          : "SYSTEM";

    const nameTag = msg.name ? ` (${msg.name})` : "";
    const timeTag = msg.timestamp ? ` [${msg.timestamp}]` : "";

    lines.push(`--- NACHRICHT ${i + 1}: ${roleLabel}${nameTag}${timeTag} ---`);
    lines.push(msg.content.trim());

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      lines.push("\n[Werkzeugaufrufe]:");
      for (const tc of msg.toolCalls) {
        lines.push(`- Tool: ${tc.name}`);
        if (tc.output) {
          const shortOut =
            tc.output.length > 300
              ? tc.output.slice(0, 300) + "... [gekürzt]"
              : tc.output;
          lines.push(`  Ausgabe: ${shortOut}`);
        }
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Erzeugt den vollständigen Prompt für den Komprimierungs-Sub-Agenten.
 */
export function buildSummarizerUserPrompt(params: {
  readonly agentId: string;
  readonly history: ReadonlyArray<SummarizerMessage>;
  readonly generation?: number;
  readonly lastUserRequestVerbatim: string;
  readonly customInstructions?: string;
}): string {
  const { agentId, history, generation = 0, lastUserRequestVerbatim, customInstructions } = params;

  const transcript = formatConversationTranscript(history);

  return `Hier ist der bisherige Gesprächsverlauf von Agent „${agentId}“ (Kontext-Generation ${generation}), der komprimiert werden soll:

${transcript}

===
WICHTIGE ZUSATZINFORMATION:
Die letzte wörtliche Nutzerbitte war:
„${lastUserRequestVerbatim}“

${customInstructions ? `ZUSÄTZLICHE PROJEKTHINWEISE:\n${customInstructions}\n` : ""}
Erstelle nun die strukturierte Kontext-Übergabe mit den exakt 7 vorgeschriebenen Abschnitten:
### 1. Ziel
### 2. Stand
### 3. Entscheidungen
### 4. Offene Aufgaben
### 5. Wichtige Dateien und Pfade
### 6. Stil-Hinweise
### 7. Letzte Nutzerbitte (wörtlich)
`;
}
