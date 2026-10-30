/**
 * T3-Bridge / Stream — T3-RPC-Quelle (Lane A12).
 *
 * EIGENTÜMER: A12.
 *
 * Verbindet den Stream-Hub mit dem Sidecar:
 *
 *   T3 `orchestration.subscribeThread` (A03)
 *        → `translateEvent` (A06)
 *        → `StreamSourceHandlers.onChatEvent` (Hub)
 *
 * Wichtig für den Lastschutz: Abonniert wird **nur**, solange ein Chat sichtbar
 * ist. Verlässt der letzte Browser den Chat, wird das Thread-Abonnement nach der
 * Nachsicht des Hubs geschlossen. Die Thread-Zuordnung kommt aus einem Port
 * (`AgentThreadDirectory`); die echte Zuordnung (`t3_thread_map`) gehört A11.
 */

import type { AgentRuntimeState } from "../contracts.js";
import type { T3RpcClient, T3ThreadStreamItem } from "../rpc/index.js";
import type { IThreadMapStore } from "../threads/types.js";
import { makeTranslatorContext, translateEvent } from "../translate/index.js";
import type { TranslatorContext } from "../translate/index.js";
import type {
  AgentThreadDirectory,
  StreamSource,
  StreamSourceHandlers,
} from "./types.js";

/** Schmale Sicht auf den A03-Client — im Test durch einen Stub ersetzbar. */
export type ThreadStreamClient = Pick<T3RpcClient, "subscribeThread">;

export type T3ThreadSourceOptions = {
  readonly client: ThreadStreamClient;
  readonly directory: AgentThreadDirectory;
  /** Name in Diagnose/Logs. */
  readonly name?: string;
};

type ThreadSubscription = {
  readonly close: () => void;
};

type WatchState = {
  readonly threadId: string;
  readonly subscription: ThreadSubscription;
  translator: TranslatorContext;
};

export class T3ThreadSource implements StreamSource {
  readonly name: string;
  readonly #client: ThreadStreamClient;
  readonly #directory: AgentThreadDirectory;
  readonly #watch = new Map<string, WatchState>();
  /** Erhöht sich bei jedem Öffnen/Schließen; schützt vor veralteten async-Antworten. */
  readonly #tokens = new Map<string, number>();
  #handlers: StreamSourceHandlers | null = null;
  #disposed = false;

  constructor(options: T3ThreadSourceOptions) {
    this.name = options.name ?? "t3-rpc-thread";
    this.#client = options.client;
    this.#directory = options.directory;
  }

  attach(handlers: StreamSourceHandlers): void {
    this.#handlers = handlers;
  }

  setVisible(agentId: string, visible: boolean): void {
    if (this.#disposed) return;
    if (!visible) {
      this.#bumpToken(agentId);
      this.#closeSubscription(agentId);
      return;
    }
    void this.#open(agentId);
  }

  /** Nur für Diagnose/Tests. */
  watchedAgents(): string[] {
    return [...this.#watch.keys()];
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const agentId of [...this.#watch.keys()]) {
      this.#bumpToken(agentId);
      this.#closeSubscription(agentId);
    }
    this.#handlers = null;
  }

  /* ------------------------------------------------------------------------------------ *
   * Intern
   * ------------------------------------------------------------------------------------ */

  async #open(agentId: string): Promise<void> {
    const token = this.#bumpToken(agentId);
    this.#closeSubscription(agentId);

    let binding: Awaited<ReturnType<AgentThreadDirectory["resolveThread"]>>;
    try {
      binding = await this.#directory.resolveThread(agentId);
    } catch {
      binding = null;
    }

    if (this.#disposed || this.#tokens.get(agentId) !== token) return;

    if (!binding) {
      // Kein Fallback, keine geratene Thread-Id: der Agent meldet den Zustand.
      this.#handlers?.onStatus(agentId, "error", {
        detail: "Kein T3-Thread für diesen Agenten (A11-Zuordnung fehlt).",
      });
      return;
    }

    const translator = makeTranslatorContext();
    let subscription: ThreadSubscription;
    try {
      subscription = this.#client.subscribeThread(
        { threadId: binding.threadId },
        {
          onEvent: (item) => this.#handleItem(agentId, item, translator, token),
          onEnd: () => this.#handleEnd(agentId, token),
        },
      );
    } catch (error) {
      this.#handlers?.onStatus(agentId, "error", {
        detail: `T3-Thread-Abonnement fehlgeschlagen: ${describeError(error)}`,
      });
      return;
    }

    if (this.#disposed || this.#tokens.get(agentId) !== token) {
      try {
        subscription.close();
      } catch {
        // ignorieren
      }
      return;
    }

    this.#watch.set(agentId, {
      threadId: binding.threadId,
      subscription,
      translator,
    });
  }

  #handleItem(
    agentId: string,
    raw: T3ThreadStreamItem,
    translator: TranslatorContext,
    token: number,
  ): void {
    if (this.#disposed || this.#tokens.get(agentId) !== token) return;
    const watch = this.#watch.get(agentId);
    if (!watch) return;

    const item = raw as {
      readonly kind?: unknown;
      readonly event?: unknown;
      readonly projection?: unknown;
    };

    const kind = typeof item.kind === "string" ? item.kind : undefined;
    if (kind === "snapshot") {
      const state = stateFromProjection(item.projection);
      if (state) this.#handlers?.onStatus(agentId, state);
      return;
    }
    if (kind === "synchronized" || kind === "unknown-event") return;

    const domainEvent = item.event ?? raw;
    const result = translateEvent(domainEvent, watch.translator);
    watch.translator = result.ctx;

    for (const event of result.events) {
      this.#handlers?.onChatEvent(agentId, event);
    }
  }

  #handleEnd(agentId: string, token: number): void {
    if (this.#disposed || this.#tokens.get(agentId) !== token) return;
    const watch = this.#watch.get(agentId);
    if (!watch) return;
    this.#watch.delete(agentId);
    // Der Client muss den Verlauf neu laden: es können Events fehlen.
    this.#handlers?.onResync?.(agentId, "upstream_closed");
  }

  #bumpToken(agentId: string): number {
    const next = (this.#tokens.get(agentId) ?? 0) + 1;
    this.#tokens.set(agentId, next);
    return next;
  }

  #closeSubscription(agentId: string): void {
    const watch = this.#watch.get(agentId);
    if (!watch) return;
    this.#watch.delete(agentId);
    try {
      watch.subscription.close();
    } catch {
      // ignorieren
    }
  }
}

/** Fabrik für A37/Verdrahtung. */
export function createT3ThreadSource(options: T3ThreadSourceOptions): T3ThreadSource {
  return new T3ThreadSource(options);
}

/**
 * Thread-Verzeichnis auf Basis der A11-Zuordnung (`t3_thread_map`).
 *
 * A37/A11 müssen nur den Store übergeben; A12 kennt keine Tabellen und keine DB.
 */
export function createThreadMapDirectory(
  store: Pick<IThreadMapStore, "getActiveThread">,
): AgentThreadDirectory {
  return {
    async resolveThread(agentId: string) {
      const entry = await store.getActiveThread(agentId);
      return entry ? { agentId, threadId: entry.t3ThreadId } : null;
    },
  };
}

/** Liest aus einem T3-Snapshot, ob der Thread gerade arbeitet. */
export function stateFromProjection(projection: unknown): AgentRuntimeState | null {
  if (!isObject(projection)) return null;

  const direct = projection["status"];
  if (typeof direct === "string") {
    const mapped = mapProjectionStatus(direct);
    if (mapped) return mapped;
  }

  // Manche Projektionen tragen den laufenden Turn unter `activeRun` / `currentRun`.
  const activeRun = projection["activeRun"] ?? projection["currentRun"];
  if (isObject(activeRun)) {
    const status = activeRun["status"];
    if (typeof status === "string") {
      const mapped = mapProjectionStatus(status);
      if (mapped) return mapped;
    }
    return "running";
  }

  return null;
}

function mapProjectionStatus(status: string): AgentRuntimeState | null {
  switch (status) {
    case "running":
    case "in_progress":
    case "active":
      return "running";
    case "queued":
    case "pending":
      return "queued";
    case "waiting":
    case "waiting_approval":
      return "waiting_approval";
    case "sleeping":
      return "sleeping";
    case "error":
    case "failed":
      return "error";
    case "idle":
    case "completed":
    case "settled":
      return "idle";
    default:
      return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "unbekannter Fehler";
}
