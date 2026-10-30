/**
 * T3-Bridge / Stream — Modul-Fassade (Lane A12).
 *
 * EIGENTÜMER: A12.
 *
 * Andere Lanes (A37 Verdrahtung, A11 Threads, A21 Client) importieren
 * ausschließlich von hier:
 *
 * ```ts
 * import { getT3StreamHub } from "../t3-bridge/stream";
 * ```
 */

export * from "./types.js";
export { SystemStreamClock } from "./clock.js";
export { ChatEventLog } from "./event-log.js";
export { SlidingWindowBudget } from "./budget.js";
export { StatusStream } from "./status.js";
export { T3StreamHub, normalizeLastEventId, stateFromChatEvent } from "./hub.js";
export type { T3StreamHubOptions } from "./hub.js";
export {
  T3ThreadSource,
  createT3ThreadSource,
  createThreadMapDirectory,
  stateFromProjection,
} from "./source.js";
export type { T3ThreadSourceOptions, ThreadStreamClient } from "./source.js";
export { SSE_HEADERS, createSseStream, encodeSseFrame } from "./sse.js";
export type { SseFrame, SseStreamOptions } from "./sse.js";

import { T3StreamHub } from "./hub.js";
import type { StreamHubConfig } from "./types.js";

let globalHub: T3StreamHub | null = null;

/**
 * Der prozessweite Hub.
 *
 * A37 hängt hier die Quelle an:
 * ```ts
 * getT3StreamHub().attachSource(createT3ThreadSource({ client, directory }));
 * ```
 * Ohne Quelle liefert der Hub nur Status (und Heartbeats) — niemals erfundene
 * Chat-Events.
 */
export function getT3StreamHub(): T3StreamHub {
  if (!globalHub) globalHub = new T3StreamHub();
  return globalHub;
}

/** Ersetzt den globalen Hub (Tests, Reinitialisierung). Der alte wird abgebaut. */
export function setT3StreamHub(hub: T3StreamHub | null): void {
  if (globalHub && globalHub !== hub) globalHub.dispose();
  globalHub = hub;
}

/** Erzeugt einen eigenständigen Hub (Tests, mehrere Welten). */
export function createT3StreamHub(config?: Partial<StreamHubConfig>): T3StreamHub {
  return new T3StreamHub(config ? { config } : {});
}
