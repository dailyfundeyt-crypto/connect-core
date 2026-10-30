/**
 * T3-Bridge — Komprimierungs-Sub-Agent (Lane A16): Typdefinitionen
 *
 * EIGENTÜMER: A16 (Komprimierungs-Sub-Agent).
 * Liest Verträge aus apps/server/src/t3-bridge/contracts.ts (A01).
 *
 * Verwaltet:
 *  - Feste 7-teilige Übergabe-Struktur für neues Kontextfenster (Idee I5)
 *  - Maximale Token-Grenze von 8.000 Tokens (≤ 8 000 Tokens)
 *  - Modellwahl: gleicher Provider/Modell (Standard), optional günstigeres Modell
 *  - Secret-Filterung für alle Ein- und Ausgaben
 */

import type {
  ConnectChatItem,
  ConnectChatItemStatus,
  ConnectChatRole,
  ContextPolicy,
  T3ProviderId,
} from "../../contracts.js";

export type {
  ConnectChatItem,
  ConnectChatItemStatus,
  ConnectChatRole,
  ContextPolicy,
  T3ProviderId,
};

/** Maximale Token-Grenze für die komprimierte Übergabe (Stefan: ≤ 8 000 Tokens). */
export const MAX_HANDOFF_TOKENS = 8000;

/* ---------------------------------------------------------------------------------------- *
 * Feste 7-teilige Übergabe-Struktur (Stefan: Pflichtabschnitte)
 * ---------------------------------------------------------------------------------------- */

/**
 * Die 7 Pflichtabschnitte der Kontext-Übergabe.
 * Jeder Abschnitt muss in der fertigen Zusammenfassung vorkommen.
 */
export interface HandoffSections {
  /** 1. Ziel: Was ist das übergeordnete Ziel des Nutzers / Projekts? */
  readonly goal: string;
  /** 2. Stand: Was ist der aktuelle Stand der Implementierung? */
  readonly currentState: string;
  /** 3. Entscheidungen: Welche Architektur- und Design-Entscheidungen wurden getroffen? */
  readonly decisions: readonly string[];
  /** 4. Offene Aufgaben: Welche Schritte sind als Nächstes zu tun? */
  readonly openTasks: readonly string[];
  /** 5. Wichtige Dateien und Pfade: Welche Pfade/Dateien sind relevant? */
  readonly importantFiles: readonly string[];
  /** 6. Stil-Hinweise: Welche Coding-Standards, Sprach- und Verhaltensregeln gelten? */
  readonly styleNotes: readonly string[];
  /** 7. Letzte Nutzerbitte (wörtlich): Die exakte letzte Aufforderung des Nutzers. */
  readonly lastUserRequest: string;
}

/* ---------------------------------------------------------------------------------------- *
 * Eingabe-Nachrichten & Verlauf
 * ---------------------------------------------------------------------------------------- */

export type SummarizerMessageRole = "user" | "assistant" | "system";

export interface SummarizerMessage {
  readonly role: SummarizerMessageRole;
  readonly content: string;
  readonly name?: string;
  readonly timestamp?: string;
  readonly toolCalls?: readonly {
    readonly name: string;
    readonly input?: unknown;
    readonly output?: string;
  }[];
}

/* ---------------------------------------------------------------------------------------- *
 * Sub-Agent Konfiguration & Aufruf
 * ---------------------------------------------------------------------------------------- */

export interface SummarizerInput {
  readonly agentId: string;
  readonly threadId?: string;
  readonly generation?: number;
  /** Provider des Hauptagenten (z. B. codex, claudeAgent, grok). */
  readonly provider: T3ProviderId;
  /** Modell des Hauptagenten (z. B. gpt-4o, claude-3-7-sonnet). */
  readonly model: string;
  /** Verlauf (ConnectChatItems, T3MessageRecords oder rohe Nachrichten). */
  readonly history: ReadonlyArray<SummarizerMessage | ConnectChatItem | unknown>;
  /** Kontext-Politik des Agenten (aus A01). */
  readonly policy?: Partial<ContextPolicy>;
  /** Optional: günstigeres Modell für die Zusammenfassung bevorzugen. */
  readonly useCheaperModel?: boolean;
  /** Maximale Tokens für die Zusammenfassung (Standard: 8 000). */
  readonly maxTokens?: number;
  /** Zusätzliche anwendungsspezifische Prompts/Hinweise. */
  readonly customInstructions?: string;
}

export interface SummarizerResult {
  readonly success: boolean;
  /** Formatierter Markdown-Text mit allen 7 Pflichtabschnitten. */
  readonly summary: string;
  /** Strukturierte Zerlegung der Abschnitte. */
  readonly sections: HandoffSections;
  /** Geschätzte Token-Zahl der Zusammenfassung (≤ 8 000). */
  readonly estimatedTokens: number;
  /** Verwendetes Modell des Sub-Agenten. */
  readonly modelUsed: string;
  /** Verwendeter Provider. */
  readonly providerUsed: T3ProviderId;
  /** Gibt an, ob ein günstigeres Modell gewählt wurde. */
  readonly isCheaperModel: boolean;
  /** Anzahl der durch den Secret-Filter unschädlich gemachten Geheimnisse. */
  readonly redactedSecretsCount: number;
  /** Fehlerbeschreibung bei Fehlschlag. */
  readonly error?: string;
}

/* ---------------------------------------------------------------------------------------- *
 * Modell-Auswahl & Schnittstellen
 * ---------------------------------------------------------------------------------------- */

export interface ResolvedSummarizerModel {
  readonly provider: T3ProviderId;
  readonly model: string;
  readonly isCheaperModel: boolean;
}

export interface IT3RpcSummarizerClient {
  createThread?(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly title: string;
    readonly provider: T3ProviderId;
    readonly model: string;
    readonly cwd?: string | null;
    readonly interactionMode?: string;
  }): Promise<unknown>;

  startTurn?(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly provider?: T3ProviderId;
    readonly model?: string;
    readonly dispatchMode?: { readonly type: "start_immediately" };
  }): Promise<unknown>;

  getThreadSnapshot?(input: {
    readonly threadId: string;
  }): Promise<unknown>;
}

export type LLMRunnerFn = (
  prompt: string,
  model: string,
  provider: T3ProviderId,
) => Promise<string>;

export interface SummarizerSubAgentOptions {
  readonly rpcClient?: IT3RpcSummarizerClient;
  readonly defaultProvider?: T3ProviderId;
  readonly defaultModel?: string;
  readonly bypassFlagCheckForTests?: boolean;
  readonly maxTokens?: number;
  readonly llmRunner?: LLMRunnerFn;
}
