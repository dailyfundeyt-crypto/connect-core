/**
 * T3-Bridge / Stream — Uhr (Lane A12).
 *
 * EIGENTÜMER: A12.
 *
 * Warum eine eigene, minimale Uhr? Der Stream braucht deterministische Tests für
 * Coalescing, Budget und Heartbeat. A08 hat eine ähnliche Abstraktion für den
 * Scheduler; A12 bleibt bewusst unabhängig davon (die Lane hängt nur von A03/A06 ab),
 * damit ein Umbau dort den Stream nicht bricht.
 */

import type { StreamClock, StreamTimer } from "./types.js";

/** Produktiv-Uhr auf Basis von `Date.now()` und globalen Timern. */
export class SystemStreamClock implements StreamClock {
  now(): number {
    return Date.now();
  }

  setTimeout(callback: () => void, ms: number): StreamTimer {
    const handle = globalThis.setTimeout(callback, Math.max(0, ms));
    return unrefTimer(handle);
  }

  clearTimeout(timer: StreamTimer): void {
    if (timer?.id !== undefined) {
      globalThis.clearTimeout(timer.id as ReturnType<typeof setTimeout>);
    }
  }

  setInterval(callback: () => void, ms: number): StreamTimer {
    const handle = globalThis.setInterval(callback, Math.max(1, ms));
    return unrefTimer(handle);
  }

  clearInterval(timer: StreamTimer): void {
    if (timer?.id !== undefined) {
      globalThis.clearInterval(timer.id as ReturnType<typeof setInterval>);
    }
  }
}

/** Timer sollen den Bun-Prozess nicht am Beenden hindern. */
function unrefTimer(handle: ReturnType<typeof setTimeout>): StreamTimer {
  const unref = (handle as unknown as { unref?: () => void }).unref;
  return {
    id: handle,
    ...(typeof unref === "function"
      ? { unref: () => (handle as unknown as { unref: () => void }).unref() }
      : {}),
  };
}
