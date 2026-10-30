/**
 * T3-Bridge / Stream — Hub (Lane A12).
 *
 * EIGENTÜMER: A12.
 *
 * Der Hub ist die einzige Stelle, die entscheidet, was ein Browser sieht:
 *
 *   - **Sichtbarkeit:** Ein Chat ist sichtbar, solange ein SSE-Abonnent hängt
 *     (plus kurze Nachsicht für einen Reload). Nur sichtbare Chats bekommen
 *     Text-Deltas und Tool-Events. Unsichtbare Agenten liefern ausschließlich
 *     Status in den Status-Stream.
 *   - **Budget:** je sichtbarem Chat höchstens 20 Events pro gleitender Sekunde.
 *   - **Coalescing:** Text-Deltas werden bis zu 50 ms gesammelt; Tool-/Plan-/
 *     Approval-Updates desselben Items werden ersetzt statt angehängt.
 *   - **Wiederaufnahme:** Jedes Event bekommt eine monotone Id; ein Ringpuffer
 *     erlaubt `Last-Event-ID`-Fortsetzung, sonst `resync`.
 *
 * Der Hub kennt kein HTTP. Er arbeitet mit Senken (`onEnvelope`), die Route
 * (`../routes/stream.ts`) kodiert daraus SSE.
 */

import type { AgentRuntimeState, ConnectChatEvent } from "../contracts.js";
import { SlidingWindowBudget } from "./budget.js";
import { SystemStreamClock } from "./clock.js";
import { ChatEventLog } from "./event-log.js";
import { StatusStream } from "./status.js";
import { isSafeStreamAgentId, resolveStreamHubConfig } from "./types.js";
import type {
  ChatStreamSink,
  ChatStreamStats,
  ChatSubscription,
  StreamClock,
  StreamEnvelope,
  StreamHubConfig,
  StreamAgentStatus,
  StreamResync,
  StreamResyncReason,
  StreamSource,
  StreamStatusMeta,
  StreamTimer,
  StatusStreamSink,
  StatusStreamStats,
  StatusSubscription,
} from "./types.js";

export type T3StreamHubOptions = {
  readonly config?: Partial<StreamHubConfig>;
  readonly clock?: StreamClock;
};

type SubscriberRecord = {
  readonly sink: ChatStreamSink;
  active: boolean;
  closed: boolean;
  buffer: StreamEnvelope[];
};

type ChannelState = {
  readonly agentId: string;
  seq: number;
  readonly log: ChatEventLog;
  readonly budget: SlidingWindowBudget;
  outbox: ConnectChatEvent[];
  pendingText: { itemId: string; delta: string } | null;
  coalesceTimer: StreamTimer | null;
  drainTimer: StreamTimer | null;
  drainAt: number | null;
  graceTimer: StreamTimer | null;
  readonly subscribers: Set<SubscriberRecord>;
  visibleToSource: boolean;
  emitting: boolean;
  emitted: number;
  dropped: number;
  coalesced: number;
};

/** Obergrenze des Puffers einer noch nicht aktivierten Verbindung. */
const MAX_INACTIVE_BUFFER = 256;

export class T3StreamHub {
  readonly #clock: StreamClock;
  readonly #config: StreamHubConfig;
  readonly #channels = new Map<string, ChannelState>();
  readonly #sources = new Set<StreamSource>();
  readonly #status: StatusStream;
  #disposed = false;

  constructor(options: T3StreamHubOptions = {}) {
    this.#config = resolveStreamHubConfig(options.config);
    this.#clock = options.clock ?? new SystemStreamClock();
    this.#status = new StatusStream(this.#clock, this.#config);
  }

  get config(): StreamHubConfig {
    return this.#config;
  }

  /* ------------------------------------------------------------------------------------ *
   * Quellen
   * ------------------------------------------------------------------------------------ */

  /**
   * Hängt eine Live-Quelle an (A03/A06-Adapter oder ein Mock).
   * Sichtbare Chats werden sofort stromaufwärts abonniert.
   */
  attachSource(source: StreamSource): void {
    if (this.#disposed || this.#sources.has(source)) return;
    this.#sources.add(source);
    source.attach({
      onChatEvent: (agentId, event) => this.publish(agentId, event),
      onStatus: (agentId, state, meta) => this.reportStatus(agentId, state, meta),
      onResync: (agentId, reason) => this.notifyResync(agentId, reason),
    });
    for (const channel of this.#channels.values()) {
      if (!channel.visibleToSource) continue;
      try {
        source.setVisible?.(channel.agentId, true);
      } catch {
        // Eine defekte Quelle darf den Hub nicht blockieren.
      }
    }
  }

  detachSource(source: StreamSource): void {
    if (this.#sources.delete(source)) {
      try {
        source.dispose();
      } catch {
        // Quelle darf beim Abbau nicht den Server reißen.
      }
    }
  }

  /* ------------------------------------------------------------------------------------ *
   * Eingang
   * ------------------------------------------------------------------------------------ */

  /**
   * Nimmt ein übersetztes Chat-Event (A06) entgegen.
   *
   * Status wird IMMER abgeleitet — auch für unsichtbare Chats. Alles andere wird
   * verworfen, solange niemand den Chat abonniert hat (keine Text-Deltas für
   * unsichtbare Chats, kein Speicherwachstum).
   */
  publish(agentId: string, event: ConnectChatEvent): void {
    if (this.#disposed || !agentId || !event) return;
    if (event.type === "keepalive") return; // Heartbeat macht die Route.
    if (!isSafeStreamAgentId(agentId)) return;

    this.#applyStatusFromEvent(agentId, event);

    const channel = this.#channel(agentId);
    if (!this.#isHot(channel)) {
      channel.dropped += 1;
      return;
    }

    if (event.type === "text_delta") {
      if (channel.pendingText && channel.pendingText.itemId !== event.itemId) {
        this.#flushPendingText(channel);
      }
      if (channel.pendingText) {
        channel.pendingText.delta += event.delta;
      } else {
        channel.pendingText = { itemId: event.itemId, delta: event.delta };
      }
      channel.coalesced += 1;
      this.#scheduleCoalesce(channel);
      return;
    }

    this.#flushPendingText(channel);
    this.#pushEvent(channel, event);
    this.#drain(channel);
  }

  /** Meldet einen Agenten-Status (z. B. Warteschlange aus A08/A11). */
  reportStatus(
    agentId: string,
    state: AgentRuntimeState,
    meta: StreamStatusMeta = {},
  ): void {
    if (this.#disposed || !agentId || !isSafeStreamAgentId(agentId)) return;
    this.#status.set(agentId, state, meta);
  }

  /** Kontroll-Frame an die Zuhörer eines Chats (z. B. Upstream abgerissen). */
  notifyResync(agentId: string, reason: StreamResyncReason): void {
    const channel = this.#channels.get(agentId);
    if (!channel || this.#disposed) return;

    const resync: StreamResync = {
      type: "resync",
      agentId,
      reason,
      requestedLastEventId: 0,
      lastEventId: channel.seq,
      oldestAvailableId: channel.log.oldestId,
    };
    for (const subscriber of [...channel.subscribers]) {
      if (subscriber.closed || !subscriber.active) continue;
      try {
        subscriber.sink.onResync?.(resync);
      } catch {
        this.#removeSubscriber(channel, subscriber);
      }
    }
  }

  /* ------------------------------------------------------------------------------------ *
   * Abonnements
   * ------------------------------------------------------------------------------------ */

  /**
   * Abonniert den Chat eines Agenten.
   *
   * `replay`/`resync` werden VOR dem Live-Betrieb zurückgegeben; die Route sendet
   * beides und ruft dann `activate()`. Ereignisse, die zwischen Aufbau und
   * Aktivierung eintreffen, werden gepuffert und danach in Reihenfolge zugestellt
   * — es gibt keine Lücke.
   */
  subscribeChat(
    agentId: string,
    options: { readonly lastEventId?: number; readonly sink: ChatStreamSink },
  ): ChatSubscription {
    const channel = this.#channel(agentId);
    const requested = normalizeLastEventId(options.lastEventId);

    let replay: readonly StreamEnvelope[] = [];
    let resync: StreamResync | null = null;

    if (requested > 0) {
      if (requested > channel.seq) {
        resync = this.#resync(agentId, "unknown_event_id", requested, channel);
      } else {
        const events = channel.log.since(requested);
        if (events === null) {
          resync = this.#resync(agentId, "log_gap", requested, channel);
        } else {
          replay = events;
        }
      }
    }

    const record: SubscriberRecord = {
      sink: options.sink,
      active: false,
      closed: false,
      buffer: [],
    };
    channel.subscribers.add(record);
    this.#onWatcherAdded(channel);

    let activated = false;
    let closed = false;

    return {
      agentId,
      requestedLastEventId: requested,
      lastEventId: channel.seq,
      replay,
      resync,
      activate: () => {
        if (activated || closed || record.closed) return;
        activated = true;
        record.active = true;
        const buffered = record.buffer;
        record.buffer = [];
        for (const envelope of buffered) {
          if (!this.#send(record, envelope)) break;
        }
      },
      close: () => {
        if (closed) return;
        closed = true;
        this.#removeSubscriber(channel, record);
      },
    };
  }

  /** Abonniert den Status-Stream (nur Status, niemals Chat-Inhalt). */
  subscribeStatus(sink: StatusStreamSink): StatusSubscription {
    return this.#status.subscribe(sink);
  }

  /** True, wenn ein Chat gerade sichtbar ist (Abonnent oder Reload-Nachsicht). */
  isVisible(agentId: string): boolean {
    const channel = this.#channels.get(agentId);
    return channel ? this.#isHot(channel) : false;
  }

  /* ------------------------------------------------------------------------------------ *
   * Diagnose
   * ------------------------------------------------------------------------------------ */

  /** Letzter bekannter Status eines Agenten (Diagnose/Test). */
  statusOf(agentId: string): StreamAgentStatus | undefined {
    return this.#status.get(agentId);
  }

  chatStats(agentId: string): ChatStreamStats | null {
    const channel = this.#channels.get(agentId);
    if (!channel) return null;
    return {
      agentId,
      visible: this.#isHot(channel),
      subscribers: channel.subscribers.size,
      emitted: channel.emitted,
      dropped: channel.dropped,
      coalesced: channel.coalesced,
      lastEventId: channel.seq,
      oldestAvailableId: channel.log.oldestId,
      pendingEvents: channel.outbox.length + (channel.pendingText ? 1 : 0),
    };
  }

  allChatStats(): ChatStreamStats[] {
    return [...this.#channels.keys()]
      .map((agentId) => this.chatStats(agentId))
      .filter((stats): stats is ChatStreamStats => stats !== null);
  }

  statusStats(): StatusStreamStats {
    return this.#status.stats();
  }

  /* ------------------------------------------------------------------------------------ *
   * Intern — Kanäle und Sichtbarkeit
   * ------------------------------------------------------------------------------------ */

  #channel(agentId: string): ChannelState {
    let channel = this.#channels.get(agentId);
    if (!channel) {
      channel = {
        agentId,
        seq: 0,
        log: new ChatEventLog(this.#config.logSize),
        budget: new SlidingWindowBudget(this.#config.chatEventsPerSecond),
        outbox: [],
        pendingText: null,
        coalesceTimer: null,
        drainTimer: null,
        drainAt: null,
        graceTimer: null,
        subscribers: new Set(),
        visibleToSource: false,
        emitting: false,
        emitted: 0,
        dropped: 0,
        coalesced: 0,
      };
      this.#channels.set(agentId, channel);
    }
    return channel;
  }

  /** Sichtbar = Abonnent hängt, oder die Nachsicht für einen Reload läuft noch. */
  #isHot(channel: ChannelState): boolean {
    return channel.subscribers.size > 0 || channel.graceTimer !== null;
  }

  #onWatcherAdded(channel: ChannelState): void {
    if (channel.graceTimer) {
      this.#clock.clearTimeout(channel.graceTimer);
      channel.graceTimer = null;
    }
    if (!channel.visibleToSource) this.#setSourceVisible(channel, true);
  }

  #removeSubscriber(channel: ChannelState, record: SubscriberRecord): void {
    if (record.closed) return;
    record.closed = true;
    record.buffer = [];
    channel.subscribers.delete(record);
    if (channel.subscribers.size > 0 || !channel.visibleToSource) return;

    const grace = this.#config.unseenGraceMs;
    if (grace <= 0) {
      this.#setSourceVisible(channel, false);
      return;
    }
    if (channel.graceTimer) return;
    channel.graceTimer = this.#clock.setTimeout(() => {
      channel.graceTimer = null;
      if (channel.subscribers.size === 0) this.#setSourceVisible(channel, false);
    }, grace);
    channel.graceTimer.unref?.();
  }

  #setSourceVisible(channel: ChannelState, visible: boolean): void {
    if (channel.visibleToSource === visible) return;
    channel.visibleToSource = visible;
    for (const source of this.#sources) {
      try {
        source.setVisible?.(channel.agentId, visible);
      } catch {
        // Eine Quelle darf den Hub nicht blockieren.
      }
    }
    if (!visible) {
      // Nicht sichtbare Chats halten keinen Ausgang mehr vor.
      channel.pendingText = null;
      if (channel.coalesceTimer) {
        this.#clock.clearTimeout(channel.coalesceTimer);
        channel.coalesceTimer = null;
      }
      channel.outbox = [];
    }
  }

  /* ------------------------------------------------------------------------------------ *
   * Intern — Zustellung, Coalescing, Budget
   * ------------------------------------------------------------------------------------ */

  #scheduleCoalesce(channel: ChannelState): void {
    if (channel.coalesceTimer) return;
    const delay = Math.max(1, this.#config.coalesceMs);
    channel.coalesceTimer = this.#clock.setTimeout(() => {
      channel.coalesceTimer = null;
      this.#flushPendingText(channel);
      this.#drain(channel);
    }, delay);
    channel.coalesceTimer.unref?.();
  }

  #flushPendingText(channel: ChannelState): void {
    if (channel.coalesceTimer) {
      this.#clock.clearTimeout(channel.coalesceTimer);
      channel.coalesceTimer = null;
    }
    const pending = channel.pendingText;
    if (!pending) return;
    channel.pendingText = null;
    this.#pushEvent(channel, {
      type: "text_delta",
      itemId: pending.itemId,
      delta: pending.delta,
    });
  }

  #pushEvent(channel: ChannelState, event: ConnectChatEvent): void {
    const outbox = channel.outbox;

    // Text-Deltas desselben Items nur am Ende zusammenfassen (Reihenfolge bleibt).
    if (event.type === "text_delta") {
      const last = outbox[outbox.length - 1];
      if (last?.type === "text_delta" && last.itemId === event.itemId) {
        outbox[outbox.length - 1] = {
          type: "text_delta",
          itemId: last.itemId,
          delta: last.delta + event.delta,
        };
        return;
      }
      outbox.push(event);
      this.#trimOutbox(channel);
      return;
    }

    // Zustands-Updates desselben Items ersetzen den alten Eintrag.
    if (event.type === "tool" || event.type === "plan" || event.type === "subagent") {
      for (let index = outbox.length - 1; index >= 0; index -= 1) {
        const candidate = outbox[index];
        if (
          candidate.type === event.type &&
          candidate.item.id === event.item.id
        ) {
          outbox[index] = event;
          return;
        }
      }
      outbox.push(event);
      this.#trimOutbox(channel);
      return;
    }

    if (event.type === "approval") {
      for (let index = outbox.length - 1; index >= 0; index -= 1) {
        const candidate = outbox[index];
        if (
          candidate.type === "approval" &&
          candidate.item.requestId === event.item.requestId
        ) {
          outbox[index] = event;
          return;
        }
      }
      outbox.push(event);
      this.#trimOutbox(channel);
      return;
    }

    if (event.type === "usage") {
      const last = outbox[outbox.length - 1];
      if (last?.type === "usage") {
        outbox[outbox.length - 1] = event;
        return;
      }
      outbox.push(event);
      this.#trimOutbox(channel);
      return;
    }

    outbox.push(event);
    this.#trimOutbox(channel);
  }

  /**
   * Notbremse gegen unbegrenztes Wachstum: zuerst zusammenfassbare Einträge
   * verwerfen, sonst den ältesten. `turn_end`/`error` bleiben so lange wie möglich.
   */
  #trimOutbox(channel: ChannelState): void {
    while (channel.outbox.length > this.#config.maxOutbox) {
      const mergeable = channel.outbox.findIndex(
        (event) =>
          event.type === "text_delta" ||
          event.type === "tool" ||
          event.type === "plan" ||
          event.type === "subagent" ||
          event.type === "approval" ||
          event.type === "usage",
      );
      if (mergeable >= 0) {
        channel.outbox.splice(mergeable, 1);
      } else {
        channel.outbox.shift();
      }
      channel.dropped += 1;
    }
  }

  #scheduleDrain(channel: ChannelState, at: number): void {
    if (channel.drainTimer && channel.drainAt !== null && channel.drainAt <= at) return;
    if (channel.drainTimer) {
      this.#clock.clearTimeout(channel.drainTimer);
      channel.drainTimer = null;
      channel.drainAt = null;
    }
    const delay = Math.max(1, at - this.#clock.now());
    channel.drainAt = this.#clock.now() + delay;
    channel.drainTimer = this.#clock.setTimeout(() => {
      channel.drainTimer = null;
      channel.drainAt = null;
      this.#drain(channel);
    }, delay);
    channel.drainTimer.unref?.();
  }

  #drain(channel: ChannelState): void {
    if (this.#disposed || channel.emitting || !this.#isHot(channel)) return;

    channel.emitting = true;
    try {
      while (channel.outbox.length > 0) {
        const now = this.#clock.now();
        if (!channel.budget.canEmit(now)) {
          this.#scheduleDrain(channel, channel.budget.nextAllowedAt(now));
          break;
        }

        const event = channel.outbox.shift()!;
        channel.budget.record(now);
        channel.seq += 1;
        const envelope: StreamEnvelope = {
          id: channel.seq,
          agentId: channel.agentId,
          at: new Date(now).toISOString(),
          event,
        };
        channel.log.append(envelope);
        channel.emitted += 1;

        for (const subscriber of [...channel.subscribers]) {
          if (subscriber.closed) continue;
          if (subscriber.active) {
            this.#send(subscriber, envelope);
          } else {
            this.#buffer(subscriber, envelope);
          }
        }
      }
    } finally {
      channel.emitting = false;
    }
  }

  #send(subscriber: SubscriberRecord, envelope: StreamEnvelope): boolean {
    if (subscriber.closed) return false;
    try {
      subscriber.sink.onEnvelope(envelope);
      return true;
    } catch {
      const channel = this.#channels.get(envelope.agentId);
      if (channel) this.#removeSubscriber(channel, subscriber);
      return false;
    }
  }

  #buffer(subscriber: SubscriberRecord, envelope: StreamEnvelope): void {
    if (subscriber.buffer.length >= MAX_INACTIVE_BUFFER) {
      subscriber.buffer.shift();
    }
    subscriber.buffer.push(envelope);
  }

  #resync(
    agentId: string,
    reason: StreamResyncReason,
    requested: number,
    channel: ChannelState,
  ): StreamResync {
    return {
      type: "resync",
      agentId,
      reason,
      requestedLastEventId: requested,
      lastEventId: channel.seq,
      oldestAvailableId: channel.log.oldestId,
    };
  }

  /* ------------------------------------------------------------------------------------ *
   * Status aus Chat-Events
   * ------------------------------------------------------------------------------------ */

  #applyStatusFromEvent(agentId: string, event: ConnectChatEvent): void {
    const state = stateFromChatEvent(event);
    if (!state) return;
    this.#status.set(agentId, state);
  }

  /* ------------------------------------------------------------------------------------ *
   * Abbau
   * ------------------------------------------------------------------------------------ */

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    for (const channel of this.#channels.values()) {
      if (channel.coalesceTimer) this.#clock.clearTimeout(channel.coalesceTimer);
      if (channel.drainTimer) this.#clock.clearTimeout(channel.drainTimer);
      if (channel.graceTimer) this.#clock.clearTimeout(channel.graceTimer);
      for (const subscriber of channel.subscribers) subscriber.closed = true;
      channel.subscribers.clear();
    }
    this.#channels.clear();

    for (const source of [...this.#sources]) {
      try {
        source.dispose();
      } catch {
        // ignorieren
      }
    }
    this.#sources.clear();
    this.#status.dispose();
  }
}

/** Begrenzt eine angeforderte `Last-Event-ID` auf sinnvolle Werte. */
export function normalizeLastEventId(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

/**
 * Leitet den Agenten-Status aus einem Chat-Event ab.
 * Bewusst grob: der Status-Stream zeigt „läuft / wartet / fertig / Fehler“.
 */
export function stateFromChatEvent(event: ConnectChatEvent): AgentRuntimeState | null {
  switch (event.type) {
    case "text_delta":
    case "text_done":
    case "tool":
    case "plan":
    case "subagent":
    case "usage":
      return "running";
    case "approval":
      return event.item.blocking ? "waiting_approval" : "running";
    case "error":
      return "error";
    case "turn_end":
      return event.item.status === "failed" ? "error" : "idle";
    case "context_switch":
    case "keepalive":
      return null;
  }
}
