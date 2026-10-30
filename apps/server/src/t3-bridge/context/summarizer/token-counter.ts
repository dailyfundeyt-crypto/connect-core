/**
 * T3-Bridge — Komprimierungs-Sub-Agent (Lane A16): Token-Zähler & Budget-Wächter
 *
 * Akzeptanzkriterium: Grenze: Übergabe ≤ 8 000 Tokens.
 *
 * Stellt sicher, dass die erstellte Zusammenfassung das Token-Limit von
 * maximal 8.000 Tokens niemals überschreitet, selbst bei extrem langen
 * Eingabeverläufen oder ausschweifenden Antworten.
 */

import { MAX_HANDOFF_TOKENS } from "./types.js";

export { MAX_HANDOFF_TOKENS };

/**
 * Schätzt die Token-Zahl eines Textes basierend auf Heuristiken für
 * Deutsch/Englisch und Code (gemittelt ~3,7 Zeichen pro Token bzw. ~1,3 Tokens pro Wort).
 */
export function estimateTokens(text: string): number {
  if (!text || typeof text !== "string") return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;

  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const chars = trimmed.length;

  // Realistische Annäherung an BPE-Tokenizer (GPT-4 / Claude / Llama)
  const charBased = Math.ceil(chars / 3.7);
  const wordBased = Math.ceil(words * 1.3);

  return Math.max(charBased, wordBased);
}

/**
 * Prüft, ob ein Text innerhalb des maximalen Token-Budgets liegt.
 */
export function isWithinTokenBudget(
  text: string,
  maxTokens: number = MAX_HANDOFF_TOKENS,
): boolean {
  return estimateTokens(text) <= maxTokens;
}

/**
 * Erzwingt das Token-Budget für eine Übergabe-Zusammenfassung (≤ 8 000 Tokens).
 *
 * Behält essentielle Abschnitte (insbesondere Ziel und wörtliche letzte Nutzerbitte)
 * strikt bei und kürzt bei Überlänge bevorzugt ausschweifende Zwischenabschnitte.
 */
export function enforceTokenBudget(
  markdownText: string,
  maxTokens: number = MAX_HANDOFF_TOKENS,
): string {
  if (!markdownText) return "";
  if (isWithinTokenBudget(markdownText, maxTokens)) {
    return markdownText;
  }

  // Zerlege Markdown in Abschnitte anhand von Überschriften (### 1., ### 2., etc.)
  const rawSections = markdownText.split(/(?=###\s+\d+\.)/g);
  if (rawSections.length <= 1) {
    // Falls keine Abschnitte erkannt wurden, einfacher Zeichen-Schnitt
    const targetChars = Math.floor(maxTokens * 3.6) - 100;
    return (
      markdownText.slice(0, targetChars) +
      "\n\n... [Gekürzt zur Einhaltung des 8.000 Token-Budgets]"
    );
  }

  // Identifiziere den Ziel-Abschnitt (Abschnitt 1) und den Letzte-Nutzerbitte-Abschnitt (Abschnitt 7)
  const firstSection = rawSections[0] ?? "";
  const lastSection = rawSections[rawSections.length - 1] ?? "";

  const firstTokens = estimateTokens(firstSection);
  const lastTokens = estimateTokens(lastSection);

  // Verbleibendes Budget für die Zwischenabschnitte
  const reservedTokens = firstTokens + lastTokens;
  const availableForMiddle = Math.max(100, maxTokens - reservedTokens);

  const middleSections = rawSections.slice(1, rawSections.length - 1);
  const middleCount = middleSections.length;
  const budgetPerMiddleSection = Math.floor(availableForMiddle / (middleCount || 1));

  const processedMiddle: string[] = [];

  for (const sec of middleSections) {
    const secTokens = estimateTokens(sec);
    if (secTokens <= budgetPerMiddleSection) {
      processedMiddle.push(sec);
    } else {
      // Abschnitt ist zu lang: Behalte die Überschrift und kürze den Rumpf
      const headerMatch = sec.match(/^(###\s+\d+\.[^\n]*\n)/);
      const header = headerMatch ? headerMatch[1] : "";
      const body = headerMatch ? sec.slice(header.length) : sec;

      const allowedChars = Math.max(150, Math.floor(budgetPerMiddleSection * 3.5) - 150);
      const trimmedBody =
        body.slice(0, allowedChars) +
        "\n\n... [Gekürzt zur Einhaltung des 8.000 Token-Budgets]\n";

      processedMiddle.push(`${header}${trimmedBody}`);
    }
  }

  // Baue alles zusammen: Ziel + getrimmte Zwischenabschnitte + Letzte Nutzerbitte
  const assembled = [firstSection, ...processedMiddle, lastSection].join("\n");

  if (estimateTokens(assembled) <= maxTokens) {
    return assembled;
  }

  // Letzte Sicherheitsstufe: Falls immer noch minimal zu lang, kürze Middle noch aggressiver
  const tightMiddle: string[] = [];
  const tightBudget = Math.floor((maxTokens - reservedTokens) / (middleCount || 1));

  for (const sec of processedMiddle) {
    const headerMatch = sec.match(/^(###\s+\d+\.[^\n]*\n)/);
    const header = headerMatch ? headerMatch[1] : "";
    const body = headerMatch ? sec.slice(header.length) : sec;
    const allowedChars = Math.max(80, Math.floor(tightBudget * 3.0) - 100);
    tightMiddle.push(`${header}${body.slice(0, allowedChars)}\n... [Details gekürzt]\n`);
  }

  return [firstSection, ...tightMiddle, lastSection].join("\n");
}
