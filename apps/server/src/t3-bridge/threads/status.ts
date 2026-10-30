/**
 * T3-Bridge — Nachrichten & Threads: Statusmodell (A11)
 *
 * Statusmodell nach Vorgabe: sending / waiting / running / answered / failed (wie Cloud-Agents).
 *
 * Mappt zwischen den Cloud-Agent-Zuständen und den ConnectChatItemStatus-Werten
 * aus contracts.ts (queued / running / done / error / cancelled / waiting).
 */

import type { ConnectChatItemStatus } from "../contracts.js";
import type { T3MessageStatus } from "./types.js";

/**
 * Konvertiert einen T3MessageStatus in einen ConnectChatItemStatus.
 */
export function toConnectChatItemStatus(status: T3MessageStatus): ConnectChatItemStatus {
  switch (status) {
    case "sending":
      return "queued";
    case "waiting":
      return "waiting";
    case "running":
      return "running";
    case "answered":
      return "done";
    case "failed":
      return "error";
    default:
      return "queued";
  }
}

/**
 * Konvertiert einen ConnectChatItemStatus in einen T3MessageStatus.
 */
export function fromConnectChatItemStatus(itemStatus: ConnectChatItemStatus): T3MessageStatus {
  switch (itemStatus) {
    case "queued":
      return "waiting";
    case "waiting":
      return "waiting";
    case "running":
      return "running";
    case "done":
      return "answered";
    case "error":
    case "cancelled":
      return "failed";
    default:
      return "waiting";
  }
}

/**
 * Prüft, ob ein Status terminal ist (keine weiteren Statusänderungen mehr).
 */
export function isTerminalStatus(status: T3MessageStatus): boolean {
  return status === "answered" || status === "failed";
}

/**
 * Textuelle Beschreibung für die UI (analog zu Cloud-Agents).
 */
export function getStatusLabel(status: T3MessageStatus): string {
  switch (status) {
    case "sending":
      return "Wird gesendet";
    case "waiting":
      return "Wartet";
    case "running":
      return "Arbeitet";
    case "answered":
      return "Beantwortet";
    case "failed":
      return "Fehler";
  }
}
