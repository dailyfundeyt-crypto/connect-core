/**
 * T3-Bridge / Stream — Status-Registry und Status-Stream (Lane A12).
 *
 * EIGENTÜMER: A12.
 *
 * Aufgabe 2 aus dem Masterplan: Agenten ohne offenen Chat melden ausschließlich
 * Status. Damit 40 laufende Agenten den Browser nicht fluten, wird NICHT ein Event
 * je Statusänderung gesendet, sondern ein **zusammengefasster Snapshot** mit
 * höchstens 2 Sendungen pro Sekunde. Der Snapshot enthält keinerlei Chat-Inhalt.
 */

import { SlidingWindowBudget } from "./budget.js";
import type { StreamClock, StreamTimer } from "./types.js";
import type {
  StatusStreamSink,
  StatusStreamStats,
  StatusSubscription,
  StreamAgentStatus,
  StreamHubConfig,
  StreamStatusMeta,
  StreamStatusSnapshot,
} from "./types.js";
import type { AgentRuntimeState } from "../contracts.js";

export class StatusStream {
  readonly #clock: StreamClock;
  readonly #config: StreamHubConfig;
  readonly #budget: SlidingWindowBudget;
  readonly #entries = new Map<string, StreamAgentStatus>();
  readonly #sinks = new Set<StatusStreamSink>();

  #seq = 0;
  #snapshots = 0;
  #rejected = 0;
  #dirty = false;
  #timer: StreamTimer | null = null;
  #disposed = false;

  constructor(clock: StreamClock, config: StreamHubConfig) {
    this.#clock = clock;
    this.#config = config;
    this.#budget = new SlidingWindowBudget(config.statusEventsPerSecond);
  }

  get lastSeq(): number {
    return this.#seq;
  }

  get subscriberCount(): number {
    return this.#sinks.size;
  }

  /**
   * Meldet einen Agenten-Status. Unveränderte Zustände erzeugen keine neue Sendung.
   */
  set(agentId: string, state: AgentRuntimeState, meta: StreamStatusMeta = {}): void {
    if (this.#disposed || !agentId) return;

    const previous = this.#entries.get(agentId);
    if (!previous && this.#entries.size >= this.#config.maxTrackedAgents) {
      this.#rejected += 1;
      return;
    }

    const queuePosition = meta.queuePosition ?? previous?.queuePosition ?? null;
    const provider = meta.provider ?? previous?.provider ?? null;
    const detail = meta.detail ?? previous?.detail;

    if (
      previous &&
      previous.state === state &&
      previous.queuePosition === queuePosition &&
      previous.provider === provider &&
      previous.detail === detail
    ) {
      return;
    }

    this.#entries.set(agentId, {
      agentId,
      state,
      queuePosition,
      provider,
      ...(detail !== undefined ? { detail } : {}),
      changedAt: new Date(this.#clock.now()).toISOString(),
    });
    this.#markDirty();
  }

  /** Aktueller Zustand eines Agenten (für Diagnose/Tests). */
  get(agentId: string): StreamAgentStatus | undefined {
    return this.#entries.get(agentId);
  }

  /**
   * Abonniert den Status-Stream. Der aktuelle Snapshot geht sofort raus; weitere
   * Snapshot nur gebündelt und budgetiert.
   */
  subscribe(sink: StatusStreamSink): StatusSubscription {
    if (this.#disposed) {
      return { lastSeq: this.#seq, close: () => {} };
    }

    const snapshot = this.#buildSnapshot();
    this.#sinks.add(sink);
    try {
      sink.onSnapshot(snapshot);
    } catch {
      // Eine defekte Senke darf die anderen nicht blockieren.
    }
    this.#schedule();

    let closed = false;
    return {
      lastSeq: snapshot.seq,
      close: () => {
        if (closed) return;
        closed = true;
        this.#sinks.delete(sink);
        if (this.#sinks.size === 0) this.#clearTimer();
      },
    };
  }

  stats(): StatusStreamStats {
    return {
      subscribers: this.#sinks.size,
      trackedAgents: this.#entries.size,
      snapshots: this.#snapshots,
      lastSeq: this.#seq,
      rejected: this.#rejected,
    };
  }

  /** Alle bekannten Agenten (Test/Diagnose). */
  snapshot(): StreamStatusSnapshot {
    return this.#buildSnapshot();
  }

  dispose(): void {
    this.#disposed = true;
    this.#clearTimer();
    this.#sinks.clear();
    this.#entries.clear();
  }

  /* ------------------------------------------------------------------------------------ *
   * Intern
   * ------------------------------------------------------------------------------------ */

  #markDirty(): void {
    this.#dirty = true;
    this.#schedule();
  }

  #schedule(): void {
    if (this.#disposed || !this.#dirty || this.#sinks.size === 0 || this.#timer) return;

    const now = this.#clock.now();
    const at = this.#budget.nextAllowedAt(now);
    const delay = Math.max(1, at - now);
    this.#timer = this.#clock.setTimeout(() => {
      this.#timer = null;
      this.#flush();
    }, delay);
    this.#timer.unref?.();
  }

  #flush(): void {
    if (this.#disposed) return;
    if (this.#sinks.size === 0) {
      this.#dirty = false;
      return;
    }
    if (!this.#dirty) return;

    const now = this.#clock.now();
    if (!this.#budget.canEmit(now)) {
      this.#schedule();
      return;
    }

    this.#budget.record(now);
    this.#dirty = false;

    const snapshot = this.#buildSnapshot();
    for (const sink of [...this.#sinks]) {
      try {
        sink.onSnapshot(snapshot);
      } catch {
        // Siehe oben: defekte Senke ignorieren.
      }
    }

    // Während der Zustellung können neue Status eingetroffen sein.
    this.#schedule();
  }

  #buildSnapshot(): StreamStatusSnapshot {
    this.#seq += 1;
    this.#snapshots += 1;
    const agents = [...this.#entries.values()].sort((a, b) =>
      a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0,
    );
    return {
      type: "status",
      seq: this.#seq,
      at: new Date(this.#clock.now()).toISOString(),
      agents,
    };
  }

  #clearTimer(): void {
    if (this.#timer) {
      this.#clock.clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}
