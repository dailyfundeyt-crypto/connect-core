/**
 * T3-Bridge / Translate — Text-Coalescing (A06).
 *
 * Eigentümer: A06. Nur innerhalb von `t3-bridge/translate/` ändern.
 *
 * Konsolidiert mehrfache eingehende Text-Deltas zu einem einzigen `text_delta`-Event,
 * analog zum `ThreadLiveEventCoalescer` in T3.
 *
 * REINE FUNKTIONEN — kein State außerhalb der zurückgegebenen Typen.
 */

import type { ConnectChatEvent } from "../contracts";
import type { TextCoalescingBuffer } from "./types";

/**
 * Liefert ein `text_delta`-Event für einen eingehenden Text-Chunk.
 *
 * Wenn das Item neu ist (andere `itemId` als im Puffer), wird zunächst ein
 * `text_done`-Event für den alten Puffer erzeugt.
 *
 * @returns Erzeugte Events + aktualisierter Puffer.
 */
export function coalesceTextDelta(
  buffer: TextCoalescingBuffer | null,
  itemId: string,
  delta: string,
): { events: ConnectChatEvent[]; buffer: TextCoalescingBuffer } {
  const events: ConnectChatEvent[] = [];

  // Wenn der Puffer ein anderes Item hält → zuerst abschließen.
  if (buffer !== null && buffer.itemId !== itemId) {
    events.push({ type: "text_done", itemId: buffer.itemId, text: buffer.text });
    buffer = null;
  }

  const newText = (buffer?.text ?? "") + delta;
  const newBuffer: TextCoalescingBuffer = { itemId, text: newText };

  events.push({ type: "text_delta", itemId, delta });

  return { events, buffer: newBuffer };
}

/**
 * Schließt den offenen Text-Puffer ab und erzeugt ein `text_done`-Event.
 * Wenn kein Puffer offen ist, wird nichts erzeugt.
 */
export function flushTextBuffer(
  buffer: TextCoalescingBuffer | null,
): { events: ConnectChatEvent[]; buffer: null } {
  if (buffer === null) return { events: [], buffer: null };
  return {
    events: [{ type: "text_done", itemId: buffer.itemId, text: buffer.text }],
    buffer: null,
  };
}
