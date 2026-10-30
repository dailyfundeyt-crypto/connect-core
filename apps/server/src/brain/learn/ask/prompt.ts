import { type Citation, type SearchHit } from "../contracts";
import {
  type AskAnswer,
  INSUFFICIENT_DATA_MESSAGE,
} from "./types";

/* ========================================================================== */
/* Strict RAG Prompt Builder                                                  */
/* ========================================================================== */

export const SPARK_ASK_SYSTEM_PROMPT = `Du bist der offizielle Wissensassistent für Spark (Connect Markdown-Vault).
Deine oberste Pflicht ist absolute Faktentreue gegenüber den Notizen im Vault.

Harte Richtlinien:
1. Antworte AUSSCHLIESSLICH anhand der bereitgestellten durchnummerierten Quellen [1], [2], etc.
2. Jede relevante Feststellung MUSS mit dem entsprechenden Zitatkürzel im Fließtext belegt werden, z.B. "Die Architektur basiert auf SQLite [1] und Hono [2]."
3. Wenn die bereitgestellten Quellen die Frage nicht eindeutig beantworten, sage klipp und klar:
   "${INSUFFICIENT_DATA_MESSAGE}"
4. Halluziniere NIEMALS Dateipfade, Zeilennummern, Fakten oder URLs, die nicht in den Quellen stehen.
5. Halte die Sprache auf Deutsch (sofern der Nutzer nicht auf Englisch fragt), sachlich, präzise und didaktisch klar strukturiert.`;

export function formatSourcesForPrompt(hits: SearchHit[]): string {
  if (hits.length === 0) {
    return "(Keine relevanten Quellen im Spark-Vault gefunden)\n";
  }

  const sections: string[] = ["=== QUELLEN AUS DEM SPARK-VAULT ==="];

  hits.forEach((hit, idx) => {
    const num = idx + 1;
    const { chunk } = hit;
    sections.push(
      `[${num}] Datei: "${chunk.notePath}" | Abschnitt: "${chunk.heading || "Allgemein"}" | Zeilen: ${chunk.lineStart}-${chunk.lineEnd}`,
    );
    sections.push(`Inhalt:\n${chunk.text.trim()}\n`);
  });

  sections.push("===================================");
  return sections.join("\n");
}

export function buildAskPrompt(
  query: string,
  hits: SearchHit[],
  options?: { json?: boolean },
): string {
  const sourcesText = formatSourcesForPrompt(hits);

  if (options?.json) {
    return `${sourcesText}

Frage des Nutzers:
"${query}"

Antworte im JSON-Format mit folgenden Feldern:
{
  "answer": "Deine fundierte Antwort mit Zitaten im Text [1], [2] usw.",
  "sourcesUsed": [1, 2], // Array der tatsächlich genutzten Quellnummern
  "confidence": 0.95, // Zahl zwischen 0 und 1
  "insufficientData": false, // true falls Quellen die Frage nicht beantworten
  "suggestedFollowUps": ["Frage 1?", "Frage 2?"]
}

WICHTIG: Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt ohne Markdown-Fences (\`\`\`json) davor oder danach.`;
  }

  return `${sourcesText}

Frage des Nutzers:
"${query}"

Antworte präzise, belege jede Aussage mit [1], [2] usw., und erfinde nichts.`;
}

/* ========================================================================== */
/* Response Parser & Citation Alignment                                       */
/* ========================================================================== */

export function parseAskTextResponse(
  rawText: string,
  availableCitations: Citation[],
  topSearchScore: number,
): AskAnswer {
  const trimmed = rawText.trim();

  // 1. Detect "Ich weiß es nicht"
  const isUnknown =
    trimmed.includes("Ich weiß es nicht") ||
    trimmed.includes("keine passenden Quellen") ||
    trimmed.includes("nicht anhand der verfügbaren Notizen") ||
    topSearchScore < 0.22;

  if (isUnknown && topSearchScore < 0.22) {
    return {
      answer: INSUFFICIENT_DATA_MESSAGE,
      citations: [],
      confidence: 0.1,
      insufficientData: true,
      sourcesUsed: [],
      suggestedFollowUps: [
        "Möchtest du eine Notiz zu diesem Thema im Vault anlegen?",
        "Soll ich die Suche auf andere Ordner erweitern?",
      ],
    };
  }

  // 2. Extract cited source numbers: [1], [2], etc.
  const citationMatches = trimmed.match(/\[(\d+)\]/g) || [];
  const usedNumbers = Array.from(
    new Set(
      citationMatches
        .map((m) => parseInt(m.replace(/[^\d]/g, ""), 10))
        .filter((n) => !isNaN(n) && n >= 1 && n <= availableCitations.length),
    ),
  );

  // If citations were referenced, filter to only the used ones, otherwise keep available top citations
  const matchedCitations =
    usedNumbers.length > 0
      ? availableCitations.filter((c) => usedNumbers.includes(c.n))
      : availableCitations.slice(0, 3);

  const confidence = Math.min(1, Math.max(0.4, topSearchScore));

  return {
    answer: trimmed,
    citations: matchedCitations,
    confidence,
    insufficientData: false,
    sourcesUsed: usedNumbers.length > 0 ? usedNumbers : matchedCitations.map((c) => c.n),
    suggestedFollowUps: generateGenericFollowUps(trimmed),
  };
}

export function parseAskJsonResponse(
  jsonText: string,
  availableCitations: Citation[],
  topSearchScore: number,
): AskAnswer {
  try {
    // Clean potential markdown fences: ```json ... ```
    const cleaned = jsonText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    const answer = typeof parsed.answer === "string" ? parsed.answer : String(jsonText);
    const sourcesUsed = Array.isArray(parsed.sourcesUsed) ? parsed.sourcesUsed.map(Number) : [];
    const insufficientData = Boolean(parsed.insufficientData);
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : topSearchScore;

    if (insufficientData || answer.includes("Ich weiß es nicht")) {
      return {
        answer: INSUFFICIENT_DATA_MESSAGE,
        citations: [],
        confidence: 0.1,
        insufficientData: true,
        sourcesUsed: [],
        suggestedFollowUps: [
          "Soll ich die Suche erweitern?",
          "Möchtest du dazu eine Notiz anlegen?",
        ],
      };
    }

    const matchedCitations =
      sourcesUsed.length > 0
        ? availableCitations.filter((c) => sourcesUsed.includes(c.n))
        : availableCitations.slice(0, 3);

    return {
      answer,
      citations: matchedCitations,
      confidence: Math.min(1, Math.max(0.3, confidence)),
      insufficientData: false,
      sourcesUsed: sourcesUsed.length > 0 ? sourcesUsed : matchedCitations.map((c) => c.n),
      suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
        ? parsed.suggestedFollowUps
        : generateGenericFollowUps(answer),
    };
  } catch {
    // If JSON parsing fails, fall back gracefully to text parser
    return parseAskTextResponse(jsonText, availableCitations, topSearchScore);
  }
}

function generateGenericFollowUps(answerText: string): string[] {
  const followUps: string[] = [];
  if (answerText.length > 50) {
    followUps.push("Kannst du das genauer erläutern?");
    followUps.push("Welche weiteren Notizen berühren diesen Punkt?");
  }
  return followUps;
}
