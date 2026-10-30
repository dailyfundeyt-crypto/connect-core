/**
 * T3-Bridge — Komprimierungs-Sub-Agent (Lane A16): Öffentliche Modul-Fassade
 *
 * EIGENTÜMER: A16 (Komprimierungs-Sub-Agent).
 *
 * Exportiert alle Kernbausteine für die automatische Kontext-Rotation (A15)
 * und die Chat-Darstellung (A22):
 *  - SummarizerSubAgent: Orchestrator für die Kontext-Kompression
 *  - Feste 7-teilige Übergabe-Struktur
 *  - Secret-Filterung (Keine Secrets in der Zusammenfassung)
 *  - Token-Budget-Erzwingung (≤ 8 000 Tokens)
 *  - Modellauswahl (gleicher Provider/Modell, optional günstiger)
 */

export * from "./types.js";
export * from "./secrets-filter.js";
export * from "./token-counter.js";
export * from "./model-selector.js";
export * from "./prompt.js";
export * from "./parser.js";
export * from "./subagent.js";

import { SummarizerSubAgent } from "./subagent.js";
import type { SummarizerInput, SummarizerResult, SummarizerSubAgentOptions } from "./types.js";

/** Globale Singleton-Instanz für den Server-Betrieb. */
let globalSummarizerSubAgent: SummarizerSubAgent | null = null;

/**
 * Erzeugt eine neue Instanz des Komprimierungs-Sub-Agenten.
 */
export function createSummarizerSubAgent(
  options?: SummarizerSubAgentOptions,
): SummarizerSubAgent {
  return new SummarizerSubAgent(options);
}

/**
 * Holt die globale Singleton-Instanz des Summarizers oder erzeugt eine Standard-Instanz.
 */
export function getGlobalSummarizerSubAgent(): SummarizerSubAgent {
  if (!globalSummarizerSubAgent) {
    globalSummarizerSubAgent = new SummarizerSubAgent();
  }
  return globalSummarizerSubAgent;
}

/**
 * Setzt oder überschreibt die globale Singleton-Instanz (für Dependency Injection oder Tests).
 */
export function setGlobalSummarizerSubAgent(instance: SummarizerSubAgent | null): void {
  globalSummarizerSubAgent = instance;
}

/**
 * Führt direkt eine Kontext-Kompression durch.
 */
export async function summarizeConversation(
  input: SummarizerInput,
  options?: SummarizerSubAgentOptions,
): Promise<SummarizerResult> {
  const agent = options ? new SummarizerSubAgent(options) : getGlobalSummarizerSubAgent();
  return agent.summarize(input);
}
