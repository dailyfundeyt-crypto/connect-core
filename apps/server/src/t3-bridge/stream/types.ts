/**
 * T3-Bridge / Stream — Typen und Vorgabewerte (Lane A12).
 *
 * EIGENTÜMER: A12. Nur innerhalb von `t3-bridge/stream/**` und `t3-bridge/routes/stream.ts` ändern.
 *
 * Aufgabe (MASTERPLAN A12):
 *   - `GET /api/t3-agents/:agentId/stream` (SSE) streamt die von A06 übersetzten
 *     `ConnectChatEvent`s Wort für Wort in den Connect-Chat.
 *   - Nur abonnierte (sichtbare) Chats bekommen Text-Deltas. Alle anderen Agenten
 *     melden ausschließlich Status über `GET /api/t3/status-stream`.
 *   - Budget: max. 20 Events/s je Chat, Coalescing, Heartbeat alle 15 s.
 *
 * Leitgedanken:
 *   - Die A01-Verträge (`contracts.ts`) werden NUR gelesen, niemals geändert.
 *   - Der Hub kennt kein HTTP. SSE-Kodierung liegt in `sse.ts`, Routen in
 *     `../routes/stream.ts`. Dadurch ist der Kern ohne Server testbar.
 *   - Jede Fähigkeit steht hinter dem Feature-Flag `connect.t3.bridge` (A01).
 */

import type { AgentRuntimeState, ConnectChatEvent } from "../contracts.js";

/* ---------------------------------------------------------------------------------------- *
 * Uhr (eigene, minimale Abstraktion — Tests ohne echte Wartezeit)
 * ---------------------------------------------------------------------------------------- */

/** Handle eines Timers; `unref` verhindert, dass der Timer den Prozess offen hält. */
export type StreamTimer = {
  readonly id: unknown;
  readonly unref?: () => void;
};

/** Minimale Uhr, die der Stream und seine Tests benötigen. */
export interface StreamClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): StreamTimer;
  clearTimeout(timer: StreamTimer): void;
  setInterval(callback: () => void, ms: number): StreamTimer;
  clearInterval(timer: StreamTimer): void;
}

/* ---------------------------------------------------------------------------------------- *
 * Rahmen / Konfiguration
 * ---------------------------------------------------------------------------------------- */

/** Vorgabewerte des Streams. Alle Werte sind zur Laufzeit überschreibbar (Tests, A25). */
export const T3_STREAM_DEFAULTS = {
  /** Harte Obergrenze für Chat-Events je Chat (gleitendes 1-s-Fenster). */
  chatEventsPerSecond: 20,
  /** Obergrenze für Status-Snapshots (gleitendes 1-s-Fenster). */
  statusEventsPerSecond: 2,
  /** Coalescing-Fenster für Text-Deltas in Millisekunden. */
  coalesceMs: 50,
  /** Heartbeat-Intervall in Millisekunden (SSE-Kommentar + `keepalive`-Frame). */
  heartbeatMs: 15_000,
  /** Länge des Wiederaufnahme-Logs je Chat (Events, nicht Bytes). */
  logSize: 512,
  /** Obergrenze der Warteschlange je Chat, bevor zusammengefasste Events verworfen werden. */
  maxOutbox: 256,
  /** Nachsicht, bevor ein Chat nach dem letzten Abonnenten als unsichtbar gilt (Reload). */
  unseenGraceMs: 5_000,
  /** `retry`-Feld im ersten SSE-Frame (Millisekunden bis zum Reconnect des Browsers). */
  retryMs: 2_000,
  /** Obergrenze parallel gehaltener Status-Einträge (Flotten-Schutz). */
  maxTrackedAgents: 500,
} as const;

/** Konfiguration des Stream-Hubs (alle Felder optional, Vorgaben aus `T3_STREAM_DEFAULTS`). */
export type StreamHubConfig = {
  readonly chatEventsPerSecond: number;
  readonly statusEventsPerSecond: number;
  readonly coalesceMs: number;
  readonly heartbeatMs: number;
  readonly logSize: number;
  readonly maxOutbox: number;
  readonly unseenGraceMs: number;
  readonly retryMs: number;
  readonly maxTrackedAgents: number;
};

/** Füllt eine Teilkonfiguration mit den Vorgaben auf. */
export function resolveStreamHubConfig(
  partial: Partial<StreamHubConfig> = {},
): StreamHubConfig {
  return {
    chatEventsPerSecond: positive(partial.chatEventsPerSecond, T3_STREAM_DEFAULTS.chatEventsPerSecond),
    statusEventsPerSecond: positive(
      partial.statusEventsPerSecond,
      T3_STREAM_DEFAULTS.statusEventsPerSecond,
    ),
    coalesceMs: nonNegative(partial.coalesceMs, T3_STREAM_DEFAULTS.coalesceMs),
    heartbeatMs: positive(partial.heartbeatMs, T3_STREAM_DEFAULTS.heartbeatMs),
    logSize: positive(partial.logSize, T3_STREAM_DEFAULTS.logSize),
    maxOutbox: positive(partial.maxOutbox, T3_STREAM_DEFAULTS.maxOutbox),
    unseenGraceMs: nonNegative(partial.unseenGraceMs, T3_STREAM_DEFAULTS.unseenGraceMs),
    retryMs: positive(partial.retryMs, T3_STREAM_DEFAULTS.retryMs),
    maxTrackedAgents: positive(partial.maxTrackedAgents, T3_STREAM_DEFAULTS.maxTrackedAgents),
  };
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

/* ---------------------------------------------------------------------------------------- *
 * Chat-Frames (das, was A12 auf die Leitung legt)
 * ---------------------------------------------------------------------------------------- */


/**
 * Eine Chat-Nachricht auf der Leitung.
 *
 * `id` ist je Chat monoton steigend und die Grundlage der Wiederaufnahme
 * (`Last-Event-ID`). `event` ist exakt der A01/A06-Vertrag `ConnectChatEvent`.
 */
export type StreamEnvelope = {
  readonly id: number;
  readonly agentId: string;
  readonly at: string;
  readonly event: ConnectChatEvent;
};

/** Gründe, aus denen ein Client den Verlauf neu laden muss (statt Lücken zu füllen). */
export type StreamResyncReason = "log_gap" | "unknown_event_id" | "upstream_closed";

/** Kontroll-Frame: der Client soll den Thread-Snapshot (A11) neu laden. */
export type StreamResync = {
  readonly type: "resync";
  readonly agentId: string;
  readonly reason: StreamResyncReason;
  /** Vom Client angeforderte Id (0 = keine). */
  readonly requestedLastEventId: number;
  /** Letzte auf diesem Kanal vergebene Id. */
  readonly lastEventId: number;
  /** Älteste noch nachlieferbare Id (null = leer). */
  readonly oldestAvailableId: number | null;
};

/** Erstes Frame einer SSE-Verbindung. */
export type StreamReady = {
  readonly type: "ready";
  readonly stream: "chat" | "status";
  readonly agentId: string | null;
  /** Letzte Id, die der Client bereits kennt. */
  readonly lastEventId: number;
  /** True, wenn der Client eine Wiederaufnahme versucht hat. */
  readonly resumed: boolean;
  /** Millisekunden bis zum automatischen Reconnect (EventSource `retry`). */
  readonly retryMs: number;
  readonly at: string;
};

/** Heartbeat-Frame (zusätzlich zum SSE-Kommentar `: hb`). */
export type StreamKeepalive = {
  readonly type: "keepalive";
  readonly at: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Status-Stream (nur sichtbare Zustände, niemals Chat-Inhalt)
 * ---------------------------------------------------------------------------------------- */

/** Zusatzangaben zu einem Agenten-Status. */
export type StreamStatusMeta = {
  readonly queuePosition?: number | null;
  readonly provider?: string | null;
  readonly detail?: string;
};

/** Ein Agent im Status-Snapshot. */
export type StreamAgentStatus = {
  readonly agentId: string;
  readonly state: AgentRuntimeState;
  readonly queuePosition: number | null;
  readonly provider: string | null;
  readonly detail?: string;
  readonly changedAt: string;
};

/**
 * Der Status-Snapshot.
 *
 * WICHTIG: Hier steht NUR Status. Keine Prompts, keine Antworten, keine Tool-Ausgaben,
 * keine Dateinamen. Ein Test erzwingt diese Zusage (`kein Chat-Inhalt im Status-Stream`).
 */
export type StreamStatusSnapshot = {
  readonly type: "status";
  readonly seq: number;
  readonly at: string;
  readonly agents: readonly StreamAgentStatus[];
};

/* ---------------------------------------------------------------------------------------- *
 * Senken (Subscriber)
 * ---------------------------------------------------------------------------------------- */

/** Empfänger einer Chat-Verbindung. */
export type ChatStreamSink = {
  readonly onEnvelope: (envelope: StreamEnvelope) => void;
  readonly onResync?: (resync: StreamResync) => void;
};

/** Empfänger des Status-Streams. */
export type StatusStreamSink = {
  readonly onSnapshot: (snapshot: StreamStatusSnapshot) => void;
};

/**
 * Rückgabe von `T3StreamHub.subscribeChat`.
 *
 * Ablauf im Aufrufer (Route):
 *  1. `ready`-Frame senden (die Kennzahlen kommen aus dieser Rückgabe),
 *  2. bei `resync` das Resync-Frame senden, sonst `replay` in Reihenfolge senden,
 *  3. `activate()` — erst jetzt fließen Live-Events (vorher gepuffert, keine Lücke).
 */
export type ChatSubscription = {
  readonly agentId: string;
  /** Vom Client angeforderte Id (0 = keine). */
  readonly requestedLastEventId: number;
  /** Letzte auf dem Kanal vergebene Id zum Zeitpunkt des Abonnierens. */
  readonly lastEventId: number;
  /** Nachzuliefernde Events in Reihenfolge (leer bei Lücke oder Erstverbindung). */
  readonly replay: readonly StreamEnvelope[];
  /** Gesetzt, wenn nicht nachgeliefert werden kann → Snapshot laden. */
  readonly resync: StreamResync | null;
  /** Live-Betrieb starten (gepufferte Events fließen jetzt). */
  activate(): void;
  /** Verbindung schließen (idempotent). */
  close(): void;
};

/** Rückgabe von `T3StreamHub.subscribeStatus`. */
export type StatusSubscription = {
  readonly lastSeq: number;
  close(): void;
};

/* ---------------------------------------------------------------------------------------- *
 * Quellen (T3-Seite) — Ports, damit A12 ohne Sidecar testbar bleibt
 * ---------------------------------------------------------------------------------------- */

/** Eine Thread-Zuordnung Agent → T3-Thread. */
export type AgentThreadBinding = {
  readonly agentId: string;
  readonly threadId: string;
};

/**
 * Thread-Verzeichnis.
 *
 * Besitzer der echten Zuordnung ist A11 (`t3_thread_map`). Solange A11 nicht verdrahtet
 * ist, liefert der Mock/Adapter nichts bzw. die Tests eine feste Zuordnung.
 */
export interface AgentThreadDirectory {
  resolveThread(agentId: string): Promise<AgentThreadBinding | null>;
}

/** Rückrufe einer Quelle in den Hub. */
export type StreamSourceHandlers = {
  readonly onChatEvent: (agentId: string, event: ConnectChatEvent) => void;
  readonly onStatus: (
    agentId: string,
    state: AgentRuntimeState,
    meta?: StreamStatusMeta,
  ) => void;
  readonly onResync?: (agentId: string, reason: StreamResyncReason) => void;
};

/**
 * Eine Live-Quelle (normalerweise der T3-Sidecar über A03/A06).
 *
 * `setVisible` ist der Lastschutz: nur sichtbare Chats werden stromaufwärts abonniert.
 */
export interface StreamSource {
  readonly name: string;
  attach(handlers: StreamSourceHandlers): void;
  setVisible?(agentId: string, visible: boolean): void;
  dispose(): void;
}

/* ---------------------------------------------------------------------------------------- *
 * Statistiken (Diagnose, Tests, Bericht)
 * ---------------------------------------------------------------------------------------- */

/** Zustand eines Chat-Kanals. */
export type ChatStreamStats = {
  readonly agentId: string;
  readonly visible: boolean;
  readonly subscribers: number;
  /** Ausgelieferte Envelopes seit Prozessstart. */
  readonly emitted: number;
  /** Verworfene Events (Warteschlange voll / unsichtbar). */
  readonly dropped: number;
  /** Anzahl Text-Deltas, die zusammengefasst wurden. */
  readonly coalesced: number;
  readonly lastEventId: number;
  readonly oldestAvailableId: number | null;
  readonly pendingEvents: number;
};

/** Zustand des Status-Streams. */
export type StatusStreamStats = {
  readonly subscribers: number;
  readonly trackedAgents: number;
  readonly snapshots: number;
  readonly lastSeq: number;
  /** Status-Meldungen, die wegen `maxTrackedAgents` nicht mehr aufgenommen wurden. */
  readonly rejected: number;
};

/** Schutz vor Missbrauch: nur harmlose Agent-Ids als Stream-Schlüssel. */
export function isSafeStreamAgentId(agentId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(agentId);
}
