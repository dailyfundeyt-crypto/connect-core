/**
 * T3-Bridge / Stream — Event-Budget (Lane A12).
 *
 * EIGENTÜMER: A12.
 *
 * Harte Obergrenze als **gleitendes** 1-s-Fenster UND Mindestabstand zwischen zwei
 * Sendungen: „max. 20 Events/s je Chat“ heißt, dass in JEDEM 1000-ms-Fenster
 * höchstens 20 Events liegen. Ohne Mindestabstand dürfte der Puffer 20 Events auf
 * einmal ausschütten und im nächsten Fenster erneut — über 1,5 s wären das 40
 * Events, also 26,7/s. Der Abstand (`windowMs / limit`) verteilt die Sendungen
 * gleichmäßig; damit bleibt auch die gemessene Rate unter dem Limit.
 */

/** Gleitfenster-Budget mit gleichmäßiger Aussendung. */
export class SlidingWindowBudget {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #minSpacingMs: number;
  #timestamps: number[] = [];

  constructor(limit: number, windowMs = 1_000) {
    this.#limit = Math.max(1, Math.floor(limit));
    this.#windowMs = Math.max(1, Math.floor(windowMs));
    // +1 ms: 20 Events mit exakt 50 ms Abstand lägen an einer Fenstergrenze
    // (t=0 … t=1000) als 21 Events im selben 1000-ms-Fenster.
    this.#minSpacingMs = Math.max(1, Math.ceil((this.#windowMs + 1) / this.#limit));
  }

  get limit(): number {
    return this.#limit;
  }

  get windowMs(): number {
    return this.#windowMs;
  }

  /** Anzahl der im aktuellen Fenster belegten Plätze. */
  used(now: number): number {
    this.#prune(now);
    return this.#timestamps.length;
  }

  /** Darf jetzt ein Event raus? (Fenster frei UND Mindestabstand erreicht.) */
  canEmit(now: number): boolean {
    this.#prune(now);
    if (this.#timestamps.length >= this.#limit) return false;
    const last = this.#timestamps[this.#timestamps.length - 1];
    return last === undefined || now - last >= this.#minSpacingMs;
  }

  /** Verbucht ein soeben ausgeliefertes Event. */
  record(now: number): void {
    this.#prune(now);
    this.#timestamps.push(now);
  }

  /**
   * Frühester Zeitpunkt, zu dem wieder ein Event erlaubt ist.
   * `now`, wenn sofort Kapazität besteht.
   */
  nextAllowedAt(now: number): number {
    this.#prune(now);
    const last = this.#timestamps[this.#timestamps.length - 1];
    const spacingAt = last === undefined ? now : last + this.#minSpacingMs;
    const windowAt =
      this.#timestamps.length >= this.#limit
        ? this.#timestamps[0]! + this.#windowMs
        : now;
    return Math.max(now, spacingAt, windowAt);
  }

  reset(): void {
    this.#timestamps = [];
  }

  #prune(now: number): void {
    const threshold = now - this.#windowMs;
    let drop = 0;
    while (drop < this.#timestamps.length && this.#timestamps[drop]! <= threshold) {
      drop += 1;
    }
    if (drop > 0) this.#timestamps = this.#timestamps.slice(drop);
  }
}
