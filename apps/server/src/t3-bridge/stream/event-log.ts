/**
 * T3-Bridge / Stream — Wiederaufnahme-Log (Lane A12).
 *
 * EIGENTÜMER: A12.
 *
 * Ringpuffer der zuletzt ausgelieferten `StreamEnvelope`s je Chat. Über die Id
 * (`id`, monoton) kann ein Client nach einem Verbindungsabbruch mit
 * `Last-Event-ID` genau ab der letzten gesehenen Nachricht fortsetzen.
 *
 * Ist die angeforderte Id älter als der Puffer, wird NICHT geraten: der Hub
 * schickt ein `resync`-Frame, und der Client lädt den Thread-Snapshot (A11).
 */

import type { StreamEnvelope } from "./types.js";

export class ChatEventLog {
  readonly #capacity: number;
  #entries: StreamEnvelope[] = [];
  #lastId = 0;

  constructor(capacity: number) {
    this.#capacity = Math.max(1, Math.floor(capacity));
  }

  /** Letzte vergebene Id (0 = noch keine). */
  get lastId(): number {
    return this.#lastId;
  }

  /** Älteste noch nachlieferbare Id (null = Log leer). */
  get oldestId(): number | null {
    return this.#entries.length > 0 ? this.#entries[0]!.id : null;
  }

  get size(): number {
    return this.#entries.length;
  }

  /** Hängt ein bereits ausgeliefertes Event an und merkt sich dessen Id. */
  append(envelope: StreamEnvelope): void {
    if (envelope.id <= this.#lastId) return;
    this.#lastId = envelope.id;
    this.#entries.push(envelope);
    if (this.#entries.length > this.#capacity) {
      this.#entries.splice(0, this.#entries.length - this.#capacity);
    }
  }

  /**
   * Alle Events mit `id > afterId` in Reihenfolge.
   *
   * Liefert `null`, wenn die Lücke nicht mehr vollständig gedeckt ist — dann darf
   * der Aufrufer NICHT teilweise nachliefern, sondern muss `resync` senden.
   */
  since(afterId: number): readonly StreamEnvelope[] | null {
    if (afterId < 0) return null;
    if (afterId === 0) return [...this.#entries];
    if (afterId > this.#lastId) return null;
    if (this.#entries.length === 0) return afterId === this.#lastId ? [] : null;

    const oldest = this.#entries[0]!.id;
    if (afterId < oldest - 1) return null;

    // Binärsuche nach dem ersten Event mit id > afterId.
    let low = 0;
    let high = this.#entries.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.#entries[mid]!.id <= afterId) low = mid + 1;
      else high = mid;
    }
    return this.#entries.slice(low);
  }

  /** Nur für Tests/Diagnose: alle gepufferten Envelopes. */
  snapshot(): readonly StreamEnvelope[] {
    return [...this.#entries];
  }

  clear(): void {
    this.#entries = [];
    this.#lastId = 0;
  }
}
