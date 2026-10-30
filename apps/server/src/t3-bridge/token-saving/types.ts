/**
 * types.ts — Typdefinitionen für das Token-Spar-Subsystem (A14)
 *
 * Verantwortlich für:
 *  - Konfiguration und Policies für Token-Einsparung (Regeln an/aus)
 *  - Messwerte für Vorher/Nachher-Turn-Messungen
 *  - Anbindung an das Usage-Ledger (A17)
 *  - Hilfsmodell-Zuordnung (Economy Models)
 *  - Striktes Verbot: Nutzer-Text darf unter keinen Umständen verändert werden.
 */

import type {
  TokenSavingPolicy as ContractTokenSavingPolicy,
  UsageLedgerRow,
  T3ProviderId,
} from "../contracts";

/**
 * Erweiterte Token-Spar-Politik mit Schaltern für alle Einzelregeln.
 * Kompatibel mit der in `contracts.ts` definierten TokenSavingPolicy.
 */
export interface TokenSavingConfig extends ContractTokenSavingPolicy {
  /** Globaler Hauptschalter für Token-Spar-Regeln. */
  enabled: boolean;

  /**
   * Regel 1: Lange Befehls- und Tool-Ausgaben kürzen (Head + Tail erhalten,
   * Mittelteil durch Auslassungsmarker ersetzen).
   */
  truncateCommandOutputs: boolean;
  /** Maximale Zeilenanzahl einer Tool-Ausgabe vor Kürzung. Standard: 25 */
  commandOutputMaxLines: number;
  /** Zu erhaltende Kopf-Zeilen bei Kürzung. Standard: 10 */
  commandOutputHeadLines: number;
  /** Zu erhaltende Fuß-Zeilen bei Kürzung. Standard: 10 */
  commandOutputTailLines: number;

  /**
   * Regel 2: Doppelte oder unveränderte Tool-Ausgaben innerhalb des Turns
   * bzw. Verlaufs durch Hash-Referenzen ersetzen. Standard: true
   */
  deduplicateToolOutputs: boolean;

  /**
   * Regel 3: Große Dateianhänge nur als relativen Pfad im Arbeitsordner übergeben,
   * wenn die CLI lokalen Dateizugriff hat. Standard: true
   */
  attachmentsAsPath: boolean;

  /**
   * Regel 4: Redundante und geschwätzige System-Anweisungen auf kompakte
   * Kernregeln verdichten (System-Prompt-Kompaktierung). Standard: true
   */
  compactSystemInstructions: boolean;

  /**
   * Regel 5: Günstige Modelle für Hilfsaufgaben wie Zusammenfassungen (A15/A16)
   * oder Thread-Titel einsetzen statt teure Spitzenmodelle. Standard: true
   */
  economyModelForAuxiliary: boolean;

  /**
   * Prompt-Cache-Tracking: Fortsetzen bestehender Sessions analysieren
   * und cacheSavingsUsd berechnen. Standard: true
   */
  trackPromptCacheSavings: boolean;

  /**
   * T3-Slash-Befehl `/compact` unterstützen und an Komprimierungs-Pipeline
   * weiterleiten. Standard: true
   */
  supportCompactSlashCommand: boolean;
}

/** Standard-Konfiguration für Token-Sparen. */
export const DEFAULT_TOKEN_SAVING_CONFIG: TokenSavingConfig = {
  enabled: true,
  // A01 Basis-Felder
  liveStreamOnlyVisibleChat: true,
  coalesceMs: 80,
  liveBudgetTokens: 2000,
  collapseToolOutput: true,
  // A14 Erweiterte Regeln
  truncateCommandOutputs: true,
  commandOutputMaxLines: 25,
  commandOutputHeadLines: 10,
  commandOutputTailLines: 10,
  deduplicateToolOutputs: true,
  attachmentsAsPath: true,
  compactSystemInstructions: true,
  economyModelForAuxiliary: true,
  trackPromptCacheSavings: true,
  supportCompactSlashCommand: true,
};

/**
 * Einzelner Anhang im Turn.
 */
export interface TurnAttachment {
  name: string;
  /** Absoluter oder relativer Dateipfad im Dateisystem */
  path?: string;
  /** MIME-Typ der Datei */
  mimeType?: string;
  /** Textueller Inhalt (falls bereits geladen) */
  content?: string;
  /** Dateigröße in Bytes */
  sizeBytes?: number;
}

/**
 * Ein Tool-Aufruf und dessen Ausgabe im Turn-Kontext.
 */
export interface TurnToolOutput {
  id: string;
  toolName: string;
  callArgs?: string | Record<string, unknown>;
  output: string;
  truncated?: boolean;
  deduplicated?: boolean;
}

/**
 * Ein Turn-Eingabe-Bundle, das optimiert werden soll.
 */
export interface TurnInputBundle {
  turnId: string;
  agentId?: string | null;
  companyId?: string | null;
  provider: T3ProviderId | "legacy" | "cloud" | string;
  model: string;
  /**
   * Der unveränderliche Nutzer-Text.
   * REGEL: DARF UNTER KEINEN UMSTÄNDEN VERÄNDERT WERDEN.
   */
  userPrompt: string;
  /** System-Anweisung für den Agenten */
  systemPrompt?: string;
  /** Vorherige Nachrichten / Kontextverlauf */
  history?: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    toolCallId?: string;
  }>;
  /** Tool-Ausgaben, die in diesen Turn einfließen */
  toolOutputs?: TurnToolOutput[];
  /** Anhänge */
  attachments?: TurnAttachment[];
  /** Ob die ausführende CLI lokalen Dateisystem-Zugriff hat */
  hasLocalFileAccess?: boolean;
  /** Session-ID bzw. Thread-ID für Fortsetzung */
  threadId?: string;
  /** Ob es sich um eine fortgesetzte Session handelt */
  isResumedSession?: boolean;
  /** Art der Aufgabe (für Economy-Modell-Auswahl bei Hilfsaufgaben) */
  taskType?: "summary" | "title" | "classification" | "auxiliary";
  /** Ursprüngliches Primärmodell des Agenten (falls taskType gesetzt) */
  primaryModel?: string;
}

/**
 * Ergebnis der Optimierung eines Turn-Eingabe-Bundles.
 */
export interface TurnOptimizationResult {
  /** Optimiertes Eingabe-Bundle */
  bundle: TurnInputBundle;
  /** Messung der Einsparung */
  measurement: TurnTokenMeasurement;
  /** Liste der angewandten Regeln */
  appliedRules: string[];
}

/**
 * Präzise Messung der Tokens pro Turn vorher und nachher.
 */
export interface TurnTokenMeasurement {
  turnId: string;
  agentId?: string | null;
  companyId?: string | null;
  provider: T3ProviderId | "legacy" | "cloud" | string;
  model: string;
  /** Roh-Tokens vor Optimierung */
  rawInputTokens: number;
  /** Optimierte Tokens nach Anwendung der Spar-Regeln */
  optimizedInputTokens: number;
  /** Eingesparte Tokens (rawInputTokens - optimizedInputTokens) */
  savedTokens: number;
  /** Prozentuale Einsparung der Eingabetokens (0 bis 100) */
  savedPercentage: number;
  /** Geschätzte oder gemeldete Output-Tokens */
  outputTokens: number;
  /** Reasoning-Tokens (falls Modell CoT unterstützt) */
  reasoningTokens: number;
  /** Gelesene Cache-Tokens (Prompt Caching Treffer) */
  cachedInputTokens: number;
  /** Neu geschriebene Cache-Tokens */
  cacheCreationTokens: number;
  /** Ungecachte Eingabe-Tokens */
  uncachedInputTokens: number;
  /** Ersparnis durch Prompt Caching in USD */
  cacheSavingsUsd: number;
  /** Geschätzte Ersparnis durch Token-Spar-Regeln in USD */
  estimatedCostSavingsUsd: number;
  /** Kennzeichen gemäß Anforderung: saving_applied */
  saving_applied: boolean;
  /** Welche Regeln gegriffen haben */
  rulesApplied: string[];
  /** Zeitstempel im ISO-Format */
  timestamp: string;
}

/**
 * Repräsentation eines Ledger-Eintrags mit `saving_applied`.
 * Erweitert `UsageLedgerRow` aus `contracts.ts`.
 */
export interface TokenSavingLedgerEntry extends UsageLedgerRow {
  /** Kennzeichen aus Vorgabe A14: Tokens pro Turn vorher/nachher mit saving_applied */
  saving_applied: boolean;
  /** Ursprüngliche Roh-Tokens vor Optimierung */
  rawInputTokens: number;
  /** Eingesparte Tokens */
  savedTokens: number;
  /** Liste der angewendeten Regeln */
  rulesApplied: string[];
}

/**
 * Interface für den Zugriff auf das Usage-Ledger (A17 Mock / Real).
 */
export interface IUsageLedgerClient {
  /**
   * Schreibt einen Messwert ins Ledger.
   */
  recordTurnSaving(measurement: TurnTokenMeasurement): Promise<TokenSavingLedgerEntry>;

  /**
   * Liest alle gespeicherten Ledger-Einträge (für Tests & Auswertung).
   */
  getEntries(): Promise<TokenSavingLedgerEntry[]>;

  /**
   * Sucht Einträge für einen bestimmten Turn.
   */
  getEntryByTurnId(turnId: string): Promise<TokenSavingLedgerEntry | undefined>;
}

/**
 * Zuordnung für Hilfsmodelle (Economy Model Selection).
 */
export interface EconomyModelMapping {
  provider: string;
  sourceModel: string;
  economyModel: string;
  costRatio: number; // z.B. 0.05 für 95% Kostenersparnis
}
