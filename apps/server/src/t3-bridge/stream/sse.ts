/**
 * T3-Bridge / Stream — SSE-Kodierung (Lane A12).
 *
 * EIGENTÜMER: A12.
 *
 * Dünne Schicht zwischen Hub und HTTP:
 *   - `encodeSseFrame` erzeugt genau ein SSE-Frame (`id`, `event`, `data`).
 *   - `createSseStream` baut den `ReadableStream`, hält den Heartbeat (15 s) und
 *     räumt bei Abbruch (Client weg, `AbortSignal`) zuverlässig auf.
 *
 * Bewusst ohne Hono-Abhängigkeit: der Stream ist damit auch in Tests direkt lesbar.
 */

import type { StreamClock } from "./types.js";

/** Ein SSE-Frame. `id` ist die Wiederaufnahme-Id (Chat-Stream). */
export type SseFrame = {
  readonly event: string;
  readonly data: unknown;
  readonly id?: number;
  readonly retry?: number;
};

export type SseStreamOptions = {
  readonly clock: StreamClock;
  /** Heartbeat-Intervall in Millisekunden. */
  readonly heartbeatMs: number;
  /**
   * Wird synchron beim Aufbau aufgerufen. Die Rückgabe ist die Aufräumfunktion
   * (Abmeldung vom Hub). Fehler werden als `error`-Frame gemeldet und beenden den
   * Stream, statt die Verbindung stumm hängen zu lassen.
   */
  readonly onOpen: (send: (frame: SseFrame) => void) => (() => void) | void;
  /** Bricht die Verbindung ab (Client getrennt). */
  readonly signal?: AbortSignal;
};

/** Kodiert einen Frame nach SSE. JSON enthält keine echten Zeilenumbrüche. */
export function encodeSseFrame(frame: SseFrame): string {
  let out = "";
  if (frame.id !== undefined) out += `id: ${frame.id}\n`;
  if (frame.retry !== undefined) out += `retry: ${frame.retry}\n`;
  out += `event: ${frame.event}\n`;
  out += `data: ${JSON.stringify(frame.data)}\n\n`;
  return out;
}

/** Baut einen SSE-`ReadableStream` mit Heartbeat und sauberem Abbau. */
export function createSseStream(options: SseStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cleanupRef: (() => void) | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const cleanups: Array<() => void> = [];

      const cleanup = () => {
        if (closed) return;
        closed = true;
        for (const fn of cleanups.splice(0)) {
          try {
            fn();
          } catch {
            // Aufräumen darf nie werfen.
          }
        }
      };
      cleanupRef = cleanup;

      const closeQuietly = () => {
        try {
          controller.close();
        } catch {
          // Bereits geschlossen/abgebrochen.
        }
      };

      const send = (frame: SseFrame) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSseFrame(frame)));
        } catch {
          cleanup();
        }
      };

      if (options.signal) {
        const onAbort = () => {
          cleanup();
          closeQuietly();
        };
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
        cleanups.push(() => options.signal?.removeEventListener("abort", onAbort));
      }

      const heartbeat = options.clock.setInterval(() => {
        if (closed) return;
        // Kommentar hält Proxys offen; das Frame ist für den Client sichtbar.
        try {
          controller.enqueue(encoder.encode(`: hb ${new Date(options.clock.now()).toISOString()}\n\n`));
        } catch {
          cleanup();
          return;
        }
        send({
          event: "keepalive",
          data: { type: "keepalive", at: new Date(options.clock.now()).toISOString() },
        });
      }, options.heartbeatMs);
      heartbeat.unref?.();
      cleanups.push(() => options.clock.clearInterval(heartbeat));

      try {
        const teardown = options.onOpen(send);
        if (teardown) cleanups.push(teardown);
      } catch (error) {
        send({
          event: "error",
          data: {
            type: "error",
            message: error instanceof Error ? error.message : "Stream-Aufbau fehlgeschlagen.",
            at: new Date(options.clock.now()).toISOString(),
          },
        });
        cleanup();
        closeQuietly();
      }
    },

    cancel() {
      cleanupRef?.();
      cleanupRef = null;
    },
  });
}

/** Standard-Header eines SSE-Endpunkts. */
export const SSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
