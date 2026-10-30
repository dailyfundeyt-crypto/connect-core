/**
 * Adapter-Schnittstellen für die Zukunfts-Simulation (v06 / A30).
 *
 * Entkoppelt die Simulations-Ausführung (Mock, Gemini-CLI Debatte, MiroFish Sidecar).
 * Konsumiert: apps/server/src/contracts/v06/future-sim.ts
 */

import type { FutureSimRun } from "../../contracts/v06/future-sim";

export type SimulationRole = "optimist" | "skeptic" | "cfo" | "customer";

export interface LoadedPlanNote {
  path: string;
  title: string;
  contentSnippet: string;
  charCount: number;
}

export interface PrepareResult {
  companyId: string;
  planFiles: string[];
  loadedNotes: LoadedPlanNote[];
  summary: string;
  ready: boolean;
}

export interface DebateTurn {
  role: SimulationRole;
  speaker: string;
  argument: string;
  hormoziPrinciple?: string;
  confidence: number; // 0..1
  risksIdentified?: string[];
  opportunitiesIdentified?: string[];
  timestamp: string;
}

export interface ValueEquationScores {
  /** Traum-Ergebnis für Kunden (1..10) */
  dreamOutcome: number;
  /** Gefühlte Erfolgswahrscheinlichkeit (1..10) */
  perceivedLikelihood: number;
  /** Schnelligkeit der Umsetzung / Vermeidung von Wartezeit (1..10) */
  timeDelayReduction: number;
  /** Minimierung von Aufwand und Entbehrung (1..10) */
  effortSacrificeReduction: number;
  /**
   * Berechneter Wert nach der Hormozi-Wertgleichung:
   * Value = (DreamOutcome * PerceivedLikelihood) / (TimeDelay * EffortSacrifice)
   */
  totalValueScore: number;
}

export interface SimulationConsensus {
  focusArea: string;
  primaryRecommendation: string;
  riskScore: number; // 0..100
  growthPotential: number; // 0..100
  actionItems: string[];
  valueEquation: ValueEquationScores;
}

export interface SimulationRunResult {
  runId: string;
  companyId: string;
  question: string;
  planFiles: string[];
  turns: DebateTurn[];
  consensus: SimulationConsensus;
  durationMs: number;
  engineUsed: "mock" | "gemini" | "mirofish";
}

export interface FutureSimReport {
  runId: string;
  title: string;
  markdownContent: string;
  generatedAt: string;
  savedPath?: string;
}

/**
 * Standard-Schnittstelle für jede Zukunfts-Simulations-Engine
 */
export interface FutureSimAdapter {
  readonly engineName: string;

  /**
   * Bereitet Eingabedateien vor (liest Notizen, extrahiert Kernaussagen).
   */
  prepare(planFiles: string[], companyId?: string): Promise<PrepareResult>;

  /**
   * Führt die Simulation/Debatte zu einer strategischen Fragestellung aus.
   */
  run(question: string, context?: PrepareResult): Promise<SimulationRunResult>;

  /**
   * Erstellt einen strukturierten Abschlussbericht zur Archivierung im Spark-Vault.
   */
  report(result?: SimulationRunResult): Promise<FutureSimReport>;
}

export { type FutureSimRun };
