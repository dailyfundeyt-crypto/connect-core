/**
 * T3-Bridge — Scheduler: Priorisierte FIFO-Warteschlange mit Anti-Starvation (Aging)
 *
 * EIGENTÜMER: A08 (Scheduler & Gleichzeitigkeit).
 * Garantiert:
 *  - Striktes FIFO innerhalb gleicher Priorität
 *  - Bevorzugung höherer Prioritäten
 *  - Anti-Starvation: Wartende Jobs niedriger Priorität altern und steigen auf,
 *    sodass sie bei Dauerlast nicht verhungern.
 */

import {
  type QueuedTurn,
  type TurnPriority,
  TURN_PRIORITY_WEIGHTS,
} from "./types.js";

export class PriorityFifoQueue<T = unknown> {
  #items: QueuedTurn<T>[] = [];
  #agingIntervalMs: number;
  #starvationThresholdMs: number;

  constructor(options?: {
    agingIntervalMs?: number;
    starvationThresholdMs?: number;
  }) {
    // Standard: Alle 30 Sekunden +5 Prioritätspunkte, ab 2 Minuten maximale Priorität
    this.#agingIntervalMs = options?.agingIntervalMs ?? 30_000;
    this.#starvationThresholdMs = options?.starvationThresholdMs ?? 120_000;
  }

  get length(): number {
    return this.#items.length;
  }

  get items(): ReadonlyArray<QueuedTurn<T>> {
    return this.#items;
  }

  updateAgingSettings(options: {
    agingIntervalMs?: number;
    starvationThresholdMs?: number;
  }): void {
    if (options.agingIntervalMs !== undefined && options.agingIntervalMs > 0) {
      this.#agingIntervalMs = options.agingIntervalMs;
    }
    if (options.starvationThresholdMs !== undefined && options.starvationThresholdMs > 0) {
      this.#starvationThresholdMs = options.starvationThresholdMs;
    }
  }

  /**
   * Berechnet das effektive Gewicht eines Turns unter Berücksichtigung des Alters.
   */
  calculateEffectivePriority(item: QueuedTurn<T>, now: number): number {
    const baseWeight = TURN_PRIORITY_WEIGHTS[item.basePriority];
    const waitTime = Math.max(0, now - item.enqueuedAt);

    // Starvation-Schutz: Wenn der Turn die Starvation-Schwelle überschritten hat,
    // erhält er die absolute Höchstpriorität (höher als jeder neue urgent-Turn).
    if (waitTime >= this.#starvationThresholdMs) {
      const starvationBoost = 100 + Math.floor(waitTime / 1000);
      return baseWeight + starvationBoost;
    }

    // Normales Aging: Pro Alterungs-Intervall ein Punkte-Bonus
    const intervalsPassed = Math.floor(waitTime / this.#agingIntervalMs);
    const agingBonus = intervalsPassed * 5;

    return baseWeight + agingBonus;
  }

  /**
   * Fügt einen Turn zur Warteschlange hinzu.
   */
  enqueue(item: QueuedTurn<T>): void {
    this.#items.push(item);
  }

  /**
   * Sucht den am höchsten priorisierten fälligen Turn (sortiert nach effektiver Priorität & FIFO).
   * Berücksichtigt optionale Filter (z. B. nach Provider-Slots).
   */
  peekCandidate(
    now: number,
    predicate?: (item: QueuedTurn<T>) => boolean,
  ): { item: QueuedTurn<T>; index: number } | null {
    if (this.#items.length === 0) return null;

    let bestItem: QueuedTurn<T> | null = null;
    let bestIndex = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < this.#items.length; i++) {
      const item = this.#items[i];
      if (item.cancelled) continue;
      if (predicate && !predicate(item)) continue;

      const score = this.calculateEffectivePriority(item, now);

      if (
        score > bestScore ||
        (score === bestScore && bestItem !== null && item.enqueuedAt < bestItem.enqueuedAt)
      ) {
        bestScore = score;
        bestItem = item;
        bestIndex = i;
      }
    }

    if (bestItem === null || bestIndex === -1) return null;
    return { item: bestItem, index: bestIndex };
  }

  /**
   * Entnimmt den besten Kandidaten aus der Schlange.
   */
  dequeueCandidate(
    now: number,
    predicate?: (item: QueuedTurn<T>) => boolean,
  ): QueuedTurn<T> | null {
    const candidate = this.peekCandidate(now, predicate);
    if (!candidate) return null;

    const [extracted] = this.#items.splice(candidate.index, 1);
    return extracted ?? null;
  }

  /**
   * Ermittelt die 1-basierte Warteschlangenposition für einen Turn.
   * Gibt null zurück, wenn der Turn nicht in der Schlange ist.
   */
  getPositionForTurn(turnId: string, now: number): number | null {
    const target = this.#items.find((item) => item.turnId === turnId && !item.cancelled);
    if (!target) return null;

    const targetScore = this.calculateEffectivePriority(target, now);
    let aheadCount = 0;

    for (const item of this.#items) {
      if (item.cancelled || item.turnId === turnId) continue;
      const score = this.calculateEffectivePriority(item, now);

      if (
        score > targetScore ||
        (score === targetScore && item.enqueuedAt < target.enqueuedAt)
      ) {
        aheadCount++;
      }
    }

    return aheadCount + 1;
  }

  /**
   * Ermittelt die beste 1-basierte Warteschlangenposition für einen Agenten.
   */
  getPositionForAgent(agentId: string, now: number): number | null {
    const agentTurns = this.#items.filter(
      (item) => item.agentId === agentId && !item.cancelled,
    );
    if (agentTurns.length === 0) return null;

    let bestPosition = Infinity;
    for (const turn of agentTurns) {
      const pos = this.getPositionForTurn(turn.turnId, now);
      if (pos !== null && pos < bestPosition) {
        bestPosition = pos;
      }
    }

    return bestPosition === Infinity ? null : bestPosition;
  }

  /**
   * Gibt die Anzahl aktiver (nicht stornierter) Turns für einen Provider zurück.
   */
  countByProvider(provider: string): number {
    return this.#items.filter(
      (item) => item.provider === provider && !item.cancelled,
    ).length;
  }

  /**
   * Bricht einen Turn in der Warteschlange ab.
   */
  cancelTurn(turnId: string, reason?: string): boolean {
    const index = this.#items.findIndex((item) => item.turnId === turnId);
    if (index === -1) return false;

    const [item] = this.#items.splice(index, 1);
    if (!item || item.cancelled) return false;

    item.cancelled = true;
    item.reject(new Error(reason ?? `Turn ${turnId} wurde in der Warteschlange abgebrochen.`));
    return true;
  }

  /**
   * Bricht alle Turns eines bestimmten Agenten in der Warteschlange ab.
   */
  cancelTurnsForAgent(agentId: string, reason?: string): number {
    let cancelledCount = 0;
    const remaining: QueuedTurn<T>[] = [];

    for (const item of this.#items) {
      if (item.agentId === agentId && !item.cancelled) {
        item.cancelled = true;
        item.reject(
          new Error(reason ?? `Turn ${item.turnId} abgebrochen (Agent ${agentId} zurückgesetzt).`),
        );
        cancelledCount++;
      } else {
        remaining.push(item);
      }
    }

    this.#items = remaining;
    return cancelledCount;
  }

  /**
   * Bereinigt abgelaufene Turns (Timeout überschritten).
   */
  purgeTimedOut(now: number): QueuedTurn<T>[] {
    const timedOut: QueuedTurn<T>[] = [];
    const remaining: QueuedTurn<T>[] = [];

    for (const item of this.#items) {
      if (item.cancelled) continue;

      if (now >= item.timeoutAt) {
        item.cancelled = true;
        item.reject(
          new Error(
            `Turn ${item.turnId} hat das Warteschlangen-Zeitlimit überschritten (${Math.round(
              (now - item.enqueuedAt) / 60000,
            )} min).`,
          ),
        );
        timedOut.push(item);
      } else {
        remaining.push(item);
      }
    }

    this.#items = remaining;
    return timedOut;
  }
}
