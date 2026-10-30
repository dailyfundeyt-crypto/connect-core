/**
 * T3-Bridge — Scheduler: Zeit-Abstraktion (SystemClock & FakeClock)
 *
 * EIGENTÜMER: A08 (Scheduler & Gleichzeitigkeit).
 * Ermöglicht 100 % deterministische Tests für Leerlauf-Timeouts (> 15 min),
 * Aging / Anti-Starvation und Queue-Timeouts ohne reale Wartezeiten oder Flakiness.
 */

import type { Clock, TimerHandle } from "./types.js";

/**
 * Standard-Uhr für den Produktivbetrieb.
 */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  setTimeout(callback: () => void, ms: number): TimerHandle {
    const handle = globalThis.setTimeout(callback, Math.max(0, ms));
    return {
      id: handle,
      unref: typeof (handle as unknown as { unref?: () => void }).unref === "function"
        ? () => (handle as unknown as { unref: () => void }).unref()
        : undefined,
    };
  }

  clearTimeout(handle: TimerHandle): void {
    if (handle && handle.id !== undefined) {
      globalThis.clearTimeout(handle.id as ReturnType<typeof setTimeout>);
    }
  }

  setInterval(callback: () => void, ms: number): TimerHandle {
    const handle = globalThis.setInterval(callback, Math.max(1, ms));
    return {
      id: handle,
      unref: typeof (handle as unknown as { unref?: () => void }).unref === "function"
        ? () => (handle as unknown as { unref: () => void }).unref()
        : undefined,
    };
  }

  clearInterval(handle: TimerHandle): void {
    if (handle && handle.id !== undefined) {
      globalThis.clearInterval(handle.id as ReturnType<typeof setInterval>);
    }
  }
}

type FakeScheduledTask = {
  readonly id: number;
  readonly runAt: number;
  readonly intervalMs?: number;
  readonly callback: () => void;
  cancelled: boolean;
};

/**
 * FakeClock für deterministische Unit- und Simulationstests.
 */
export class FakeClock implements Clock {
  #currentTime: number;
  #nextTimerId = 1;
  #tasks: FakeScheduledTask[] = [];

  constructor(initialTime = 1_000_000) {
    this.#currentTime = initialTime;
  }

  now(): number {
    return this.#currentTime;
  }

  setTimeout(callback: () => void, ms: number): TimerHandle {
    const id = this.#nextTimerId++;
    const task: FakeScheduledTask = {
      id,
      runAt: this.#currentTime + Math.max(0, ms),
      callback,
      cancelled: false,
    };
    this.#tasks.push(task);
    this.#tasks.sort((a, b) => a.runAt - b.runAt);
    return { id };
  }

  clearTimeout(handle: TimerHandle): void {
    const task = this.#tasks.find((t) => t.id === handle.id);
    if (task) {
      task.cancelled = true;
    }
  }

  setInterval(callback: () => void, ms: number): TimerHandle {
    const id = this.#nextTimerId++;
    const intervalMs = Math.max(1, ms);
    const task: FakeScheduledTask = {
      id,
      runAt: this.#currentTime + intervalMs,
      intervalMs,
      callback,
      cancelled: false,
    };
    this.#tasks.push(task);
    this.#tasks.sort((a, b) => a.runAt - b.runAt);
    return { id };
  }

  clearInterval(handle: TimerHandle): void {
    this.clearTimeout(handle);
  }

  /**
   * Spult die Uhr um `ms` Millisekunden vor und führt alle fälligen Timer aus.
   */
  tick(ms: number): void {
    if (ms < 0) return;
    const targetTime = this.#currentTime + ms;

    while (true) {
      // Entferne stornierte Tasks an der Spitze
      while (this.#tasks.length > 0 && this.#tasks[0].cancelled) {
        this.#tasks.shift();
      }

      if (this.#tasks.length === 0) {
        this.#currentTime = targetTime;
        break;
      }

      const nextTask = this.#tasks[0];
      if (nextTask.runAt > targetTime) {
        this.#currentTime = targetTime;
        break;
      }

      // Nächste fällige Aufgabe entnehmen
      this.#tasks.shift();
      this.#currentTime = nextTask.runAt;

      if (!nextTask.cancelled) {
        try {
          nextTask.callback();
        } catch (err) {
          // Timer-Fehler sollten die Uhr nicht blockieren
          console.error("FakeClock timer error:", err);
        }

        // Falls Intervall-Task: erneut einplanen
        if (nextTask.intervalMs !== undefined && !nextTask.cancelled) {
          const recurrentTask: FakeScheduledTask = {
            ...nextTask,
            runAt: this.#currentTime + nextTask.intervalMs,
          };
          this.#tasks.push(recurrentTask);
          this.#tasks.sort((a, b) => a.runAt - b.runAt);
        }
      }
    }
  }

  /**
   * Spult die Uhr auf eine absolute Zeit vor.
   */
  advanceTo(absoluteTime: number): void {
    if (absoluteTime > this.#currentTime) {
      this.tick(absoluteTime - this.#currentTime);
    }
  }

  /**
   * Anzahl aller aktuell noch anstehenden (nicht stornierten) Timer.
   */
  get scheduledTimerCount(): number {
    return this.#tasks.filter((t) => !t.cancelled).length;
  }
}
