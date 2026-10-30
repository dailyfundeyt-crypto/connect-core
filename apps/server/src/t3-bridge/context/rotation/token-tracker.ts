/**
 * T3-Bridge — Kontext-Rotation: Token-Tracker je Thread (Lane A15)
 *
 * Verwaltet den kumulierten Token-Zähler je T3-Thread im aktuellen Kontextfenster.
 * Rechnet Nutzungsdaten aus ConnectChatUsage, Usage-Events und Ledger-Einträgen
 * präzise auf und erkennt das Erreichen der Schwelle (Standard: 100 000 Tokens).
 */

import type { ThreadTokenState, TurnUsageInput } from "./types.js";

/**
 * Extrahiert die Summe aller Tokens aus unterschiedlichen Usage-Formaten.
 * Berücksichtigt ungecachte Eingabe, Cache-Tokens, neu geschriebene Cache-Tokens,
 * Ausgabe-Tokens und Reasoning-Tokens (z. B. o1/o3/DeepSeek).
 */
export function extractTotalTokens(usage: TurnUsageInput | unknown): number {
  if (typeof usage === "number") {
    return Number.isFinite(usage) && usage > 0 ? Math.round(usage) : 0;
  }

  if (!usage || typeof usage !== "object") {
    return 0;
  }

  const u = usage as Record<string, unknown>;

  // Falls bereits eine explizite Gesamtsumme vorliegt
  if (typeof u.totalTokens === "number" && Number.isFinite(u.totalTokens)) {
    return Math.max(0, Math.round(u.totalTokens));
  }
  if (typeof u.tokens === "number" && Number.isFinite(u.tokens)) {
    return Math.max(0, Math.round(u.tokens));
  }

  const uncachedInput = typeof u.uncachedInputTokens === "number" ? u.uncachedInputTokens : 0;
  const cachedInput = typeof u.cachedInputTokens === "number" ? u.cachedInputTokens : 0;
  const cacheCreation = typeof u.cacheCreationTokens === "number" ? u.cacheCreationTokens : 0;
  const output = typeof u.outputTokens === "number" ? u.outputTokens : 0;
  const reasoning = typeof u.reasoningTokens === "number" ? u.reasoningTokens : 0;

  // Auch standardisierte Felder aus T3 / OpenAPI
  const promptTokens = typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
  const completionTokens = typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
  const inputTokens = typeof u.inputTokens === "number" ? u.inputTokens : 0;

  const standardSum = uncachedInput + cachedInput + cacheCreation + output + reasoning;
  if (standardSum > 0) {
    return Math.round(standardSum);
  }

  const altSum = promptTokens + completionTokens + inputTokens;
  return Math.max(0, Math.round(altSum));
}

export class ThreadTokenTracker {
  readonly #statesByThread = new Map<string, ThreadTokenState>();

  /**
   * Verbucht die Token-Nutzung eines Turns für einen Thread.
   */
  recordTurnUsage(params: {
    readonly agentId: string;
    readonly threadId: string;
    readonly generation: number;
    readonly usage: TurnUsageInput;
    readonly turnId?: string | null;
  }): ThreadTokenState {
    const { agentId, threadId, generation, usage, turnId } = params;
    const deltaTokens = extractTotalTokens(usage);
    const now = new Date().toISOString();

    const existing = this.#statesByThread.get(threadId);

    const newTokens = (existing?.tokens ?? 0) + deltaTokens;
    const newTurnCount = (existing?.turnCount ?? 0) + 1;

    const nextState: ThreadTokenState = {
      agentId,
      threadId,
      generation,
      tokens: newTokens,
      turnCount: newTurnCount,
      lastTurnId: turnId ?? existing?.lastTurnId ?? null,
      pendingRotation: existing?.pendingRotation ?? false,
      lastUpdatedAt: now,
    };

    this.#statesByThread.set(threadId, nextState);
    return nextState;
  }

  /**
   * Setzt die Tokens eines Threads direkt auf einen bestimmten Wert (z. B. Initialisierung aus T3-Snapshot).
   */
  setTokens(params: {
    readonly agentId: string;
    readonly threadId: string;
    readonly generation: number;
    readonly tokens: number;
  }): ThreadTokenState {
    const { agentId, threadId, generation, tokens } = params;
    const now = new Date().toISOString();
    const existing = this.#statesByThread.get(threadId);

    const nextState: ThreadTokenState = {
      agentId,
      threadId,
      generation,
      tokens: Math.max(0, Math.round(tokens)),
      turnCount: existing?.turnCount ?? 0,
      lastTurnId: existing?.lastTurnId ?? null,
      pendingRotation: existing?.pendingRotation ?? false,
      lastUpdatedAt: now,
    };

    this.#statesByThread.set(threadId, nextState);
    return nextState;
  }

  /**
   * Liefert den aktuellen Token-Zähler für einen Thread.
   */
  getTokens(threadId: string): number {
    return this.#statesByThread.get(threadId)?.tokens ?? 0;
  }

  /**
   * Liefert den gesamten Zustand eines Threads.
   */
  getState(threadId: string): ThreadTokenState | undefined {
    return this.#statesByThread.get(threadId);
  }

  /**
   * Markiert einen Thread für die Rotation nach Turn-Ende.
   */
  setPendingRotation(threadId: string, pending: boolean): void {
    const existing = this.#statesByThread.get(threadId);
    if (!existing) return;

    this.#statesByThread.set(threadId, {
      ...existing,
      pendingRotation: pending,
      lastUpdatedAt: new Date().toISOString(),
    });
  }

  /**
   * Prüft, ob für einen Thread eine Rotation vorgemerkt ist.
   */
  isPendingRotation(threadId: string): boolean {
    return Boolean(this.#statesByThread.get(threadId)?.pendingRotation);
  }

  /**
   * Entfernt oder archiviert den State eines alten Threads.
   */
  resetThread(threadId: string): void {
    this.#statesByThread.delete(threadId);
  }

  /**
   * Löscht alle gespeicherten Zählerstände (für Tests).
   */
  clear(): void {
    this.#statesByThread.clear();
  }
}
