/**
 * rules/compact-system-prompt.ts — Regel 4: Kurze System-Anweisungen je Agent (A14)
 *
 * Verdichtet geschwätzige und redundante System-Prompts auf das Wesentliche,
 * ohne Qualitäts- oder Verhaltensverlust:
 *  - Bereinigt mehrfache Leerzeilen, redundante Trennlinien und Markdown-Zierrat
 *  - Kürzt stereotype Höflichkeitsfloskeln und wiederholte Anweisungsblöcke
 *  - Spart bei jedem Turn wertvolle Basis-Tokens (Prompt-Cache- und Input-Tokens)
 */

import { estimateTokenCount } from "../token-estimator";

export interface CompactSystemPromptResult {
  optimizedPrompt: string;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  wasCompacted: boolean;
}

/**
 * Bekannte geschwätzige Füllfloskeln in System-Anweisungen,
 * die ohne Bedeutungsverlust gestrichen oder gestrafft werden können.
 */
const VERBOSE_PHRASES: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /Du bist ein hochqualifizierter, extrem hilfsbereiter und intelligenter KI-Assistent[.,]?\s*/gi,
    replacement: "Du bist ein KI-Assistent. ",
  },
  {
    pattern: /Bitte stelle sicher, dass du stets und unter allen Umständen/gi,
    replacement: "Achte darauf, dass du",
  },
  {
    pattern: /Es ist von höchster Wichtigkeit und absolut unabdingbar, dass/gi,
    replacement: "Wichtig:",
  },
  {
    pattern: /Wie du sicherlich bereits weißt, /gi,
    replacement: "",
  },
  {
    pattern: /Im Folgenden findest du eine ausführliche Liste aller verfügbaren Werkzeuge und Instruktionen:\s*/gi,
    replacement: "Instruktionen:\n",
  },
  {
    pattern: /Antworte bitte immer höflich, zuvorkommend, freundlich und hilfsbereit\.\s*/gi,
    replacement: "Antworte freundlich und präzise. ",
  },
];

/**
 * Kompaktiert eine System-Anweisung.
 */
export function compactSystemPrompt(prompt?: string | null): CompactSystemPromptResult {
  if (!prompt || prompt.trim().length === 0) {
    return {
      optimizedPrompt: prompt ?? "",
      originalTokens: 0,
      optimizedTokens: 0,
      savedTokens: 0,
      wasCompacted: false,
    };
  }

  const originalTokens = estimateTokenCount(prompt);
  let text = prompt;

  // 1. Phrasen-Kompaktierung
  for (const item of VERBOSE_PHRASES) {
    text = text.replace(item.pattern, item.replacement);
  }

  // 2. Whitespace- und Leerzeilen-Bereinigung: Mehr als 2 Zeilenumbrüche reduzieren
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  // 3. Zeilen-Trailing-Whitespace entfernen
  text = text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  const optimizedTokens = estimateTokenCount(text);
  const savedTokens = Math.max(0, originalTokens - optimizedTokens);

  return {
    optimizedPrompt: text,
    originalTokens,
    optimizedTokens,
    savedTokens,
    wasCompacted: savedTokens > 0,
  };
}
