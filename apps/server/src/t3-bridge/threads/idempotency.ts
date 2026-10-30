/**
 * T3-Bridge — Nachrichten & Threads: Idempotenz-Manager (A11)
 *
 * Garantiert: "Zweimal dieselbe clientMessageId → nur ein Turn."
 *
 * Verhindert Mehrfachausführungen bei doppelten Klicks, Verbindungsabbrüchen
 * oder parallelen Requests mit derselben clientMessageId.
 */

import type { IIdempotencyStore, T3MessageRecord } from "./types.js";

export class MemoryIdempotencyStore implements IIdempotencyStore {
  readonly #records = new Map<string, T3MessageRecord>();

  async get(clientMessageId: string): Promise<T3MessageRecord | null> {
    return this.#records.get(clientMessageId) ?? null;
  }

  async set(clientMessageId: string, record: T3MessageRecord): Promise<void> {
    this.#records.set(clientMessageId, record);
  }

  async update(clientMessageId: string, updates: Partial<T3MessageRecord>): Promise<void> {
    const existing = this.#records.get(clientMessageId);
    if (!existing) return;
    this.#records.set(clientMessageId, { ...existing, ...updates, updatedAt: new Date().toISOString() });
  }

  clear(): void {
    this.#records.clear();
  }
}

export class IdempotencyManager {
  readonly #store: IIdempotencyStore;
  readonly #inFlight = new Map<string, Promise<T3MessageRecord>>();

  constructor(store?: IIdempotencyStore) {
    this.#store = store ?? new MemoryIdempotencyStore();
  }

  /**
   * Prüft, ob ein Datensatz bereits vorliegt.
   */
  async getRecord(clientMessageId: string): Promise<T3MessageRecord | null> {
    return this.#store.get(clientMessageId);
  }

  /**
   * Führt eine Turn-Aktion genau einmal pro `clientMessageId` aus.
   *
   * Trifft zeitgleich oder später dieselbe clientMessageId ein, wird kein
   * zweiter Turn gestartet; stattdessen wird auf das laufende Ergebnis gewartet
   * bzw. der fertige Datensatz zurückgegeben.
   */
  async runOnce(
    clientMessageId: string,
    execute: () => Promise<T3MessageRecord>,
  ): Promise<{ record: T3MessageRecord; duplicate: boolean }> {
    // 1. Bereits abgeschlossener oder gespeicherter Datensatz?
    const existing = await this.#store.get(clientMessageId);
    if (existing) {
      return { record: existing, duplicate: true };
    }

    // 2. Befindet sich der Turn gerade in der Ausführung (In-Flight)?
    const running = this.#inFlight.get(clientMessageId);
    if (running) {
      const result = await running;
      return { record: result, duplicate: true };
    }

    // 3. Neu ausführen und Promise registrieren
    const promise = (async () => {
      try {
        const record = await execute();
        await this.#store.set(clientMessageId, record);
        return record;
      } finally {
        this.#inFlight.delete(clientMessageId);
      }
    })();

    this.#inFlight.set(clientMessageId, promise);
    const finalRecord = await promise;
    return { record: finalRecord, duplicate: false };
  }

  /**
   * Aktualisiert den Status einer bekannten Nachricht.
   */
  async updateStatus(
    clientMessageId: string,
    updates: Partial<T3MessageRecord>,
  ): Promise<void> {
    await this.#store.update(clientMessageId, updates);
  }
}
