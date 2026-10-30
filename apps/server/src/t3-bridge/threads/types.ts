/**
 * T3-Bridge — Nachrichten & Threads (A11): Typdefinitionen
 *
 * EIGENTÜMER: A11 (Nachrichten & Threads).
 * Liest Verträge aus apps/server/src/t3-bridge/contracts.ts (A01).
 *
 * Verwaltet:
 *  - Zuordnung Connect-Agent ↔ T3-Thread (Mapping in t3_thread_map)
 *  - Senden von Nachrichten mit Idempotenz (clientMessageId)
 *  - Starten von Turns über den Scheduler (A08) mit Workspace (A07)
 *  - Statusmodell: sending / waiting / running / answered / failed wie Cloud-Agents
 *  - Verlauf aus T3-Snapshot über alle Kontext-Generationen hinweg (I5)
 */

import type {
  ConnectChatItem,
  ConnectChatItemStatus,
  ConnectChatRole,
  T3MessageRequest,
  T3MessageResponse,
  T3ProviderId,
  T3ThreadMap,
  T3ThreadSnapshot,
} from "../contracts.js";

export type {
  ConnectChatItem,
  ConnectChatItemStatus,
  ConnectChatRole,
  T3MessageRequest,
  T3MessageResponse,
  T3ProviderId,
  T3ThreadMap,
  T3ThreadSnapshot,
};

/* ---------------------------------------------------------------------------------------- *
 * Statusmodell (wie Cloud-Agents)
 * ---------------------------------------------------------------------------------------- */

/**
 * Statusmodell für Nachrichten im Connect-Chat (angelehnt an Cloud-Agents):
 *  - sending:  wird vorbereitet / an den Sidecar übergeben
 *  - waiting:  im Scheduler eingereiht, wartet auf freien Slot (Position)
 *  - running:  wird aktiv vom Sidecar / Modell ausgeführt
 *  - answered: Antwort liegt vollständig vor
 *  - failed:   Fehler bei Ausführung oder Zustellung
 */
export type T3MessageStatus =
  | "sending"
  | "waiting"
  | "running"
  | "answered"
  | "failed";

/* ---------------------------------------------------------------------------------------- *
 * Nachrichten-Datensatz
 * ---------------------------------------------------------------------------------------- */

export type T3MessageRecord = {
  /** Id der Nutzernachricht im Connect-Chat (für Idempotenz & Status-Zuordnung). */
  readonly id: string;
  readonly agentId: string;
  readonly threadId: string;
  readonly turnId: string | null;
  readonly generation: number;
  readonly role: ConnectChatRole;
  readonly text: string;
  readonly status: T3MessageStatus;
  readonly attachmentIds?: readonly string[];
  readonly reply?: string;
  readonly replyRole?: ConnectChatRole;
  readonly items?: readonly ConnectChatItem[];
  readonly error?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly answeredAt?: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Verlaufs-Abfrage
 * ---------------------------------------------------------------------------------------- */

export type T3MessageHistoryResult = {
  readonly messages: readonly T3MessageRecord[];
  readonly items: readonly ConnectChatItem[];
  readonly threadId: string | null;
  readonly generation: number;
  readonly tokens: number;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export type T3MessageHistoryQuery = {
  readonly cursor?: string | null;
  readonly limit?: number;
};

/* ---------------------------------------------------------------------------------------- *
 * Kontext-Generation Record (Ablösung alter Fenster / I5)
 * ---------------------------------------------------------------------------------------- */

export type ContextGenerationRecord = {
  readonly id: string;
  readonly agentId: string;
  readonly threadId: string;
  readonly tokensAtSwitch: number;
  readonly summaryText: string | null;
  readonly createdAt: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Speicher-Schnittstellen
 * ---------------------------------------------------------------------------------------- */

export interface IThreadMapStore {
  /** Holt die aktuell aktive Generation eines Agenten (ohne supersededAt). */
  getActiveThread(agentId: string): Promise<T3ThreadMap | null>;

  /** Holt alle Generationen eines Agenten aufsteigend nach Generation. */
  getAllGenerations(agentId: string): Promise<readonly T3ThreadMap[]>;

  /** Speichert oder aktualisiert eine Thread-Zuordnung. */
  saveThread(entry: T3ThreadMap): Promise<void>;

  /**
   * Rotiert den Thread eines Agenten (Idee I5 / A15):
   * Markiert den alten Thread als abgelöst und legt die neue Generation an.
   */
  rotateThread(params: {
    readonly agentId: string;
    readonly newThreadId: string;
    readonly tokensAtSwitch: number;
    readonly summaryText?: string;
  }): Promise<T3ThreadMap>;

  /** Holt alle protokollierten Kontext-Wechsel eines Agenten. */
  getContextGenerations(agentId: string): Promise<readonly ContextGenerationRecord[]>;
}

export interface IIdempotencyStore {
  /** Liest einen bekannten Nachrichten-Datensatz anhand der clientMessageId. */
  get(clientMessageId: string): Promise<T3MessageRecord | null>;

  /** Speichert einen Datensatz. */
  set(clientMessageId: string, record: T3MessageRecord): Promise<void>;

  /** Aktualisiert einen bestehenden Datensatz. */
  update(clientMessageId: string, updates: Partial<T3MessageRecord>): Promise<void>;
}
