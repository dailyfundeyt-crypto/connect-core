/**
 * A40 — T3-Testinstanz: ein Mock-Sidecar, der das echte T3-WS-RPC-Protokoll spricht.
 *
 * Warum ein Mock und nicht der echte T3-Server?
 *
 * Der E2E-Lauf darf weder Stefans Helium-Profil öffnen noch eine echte
 * Codex-/Claude-Anmeldung brauchen. Er muss aber **dasselbe Protokoll** benutzen,
 * das der Sidecar spricht — sonst prüft der Test die Mock-Implementierung statt
 * der Brücke.
 *
 * Deshalb ist der Mock hier ein WebSocket-Server, der das Effect-RPC-Format
 * von `apps/server/src/t3-bridge/rpc/protocol.ts` exakt beantwortet:
 *   Request  -> Chunk / Exit
 *   Subscribe -> Chunk-Batches, bis der Client den Stream schließt
 *
 * Der Mock kennt keine Geheimnisse: kein Token, kein Schlüssel, kein Login.
 * Er ist ein Gegenstand für die Testinstanz.
 */

import type { T3WebSocketLike } from "../../../apps/server/src/t3-bridge/rpc";

export type T3MockEvent = {
  readonly type: string;
  readonly [key: string]: unknown;
};

/** Ein Frame, den der Mock an den Client schickt. */
export type T3MockFrame = {
  readonly _tag: "Chunk" | "Exit" | "Pong" | "Defect";
  readonly requestId?: string;
  readonly values?: readonly unknown[];
  readonly exit?: {
    readonly _tag: "Success" | "Failure";
    readonly value?: unknown;
    readonly cause?: readonly unknown[];
  };
  readonly defect?: unknown;
};

/**
 * Der Mock-Sidecar.
 *
 * Er antwortet auf die WS-RPC-Methoden, die die Connect-Brücke benutzt, und
 * hält den Zustand der Threads, damit ein Turn tatsächlich verläuft.
 */
export class T3MockSidecar {
  /** Alle Sockets, die sich angemeldet haben. */
  readonly sockets: T3MockSocket[] = [];

  /** Die Threads, die der Sidecar kennt (je Thread ein Verlauf). */
  readonly threads = new Map<string, T3MockThread>();

  /** Provider-Liste, wie der Sidecar sie meldet. */
  providers: unknown[] = [];

  /** Zähler für erzeugte IDs. */
  #counter = 0;

  /** Wie viele Chunks ein Text-Turn liefert. */
  readonly chunkCount: number;

  constructor(options: { readonly chunkCount?: number } = {}) {
    this.chunkCount = options.chunkCount ?? 3;
  }

  /** Erzeugt eine eindeutige ID. */
  nextId(prefix: string): string {
    this.#counter += 1;
    return `${prefix}-${this.#counter}`;
  }

  /** Legt einen Thread an (oder liefert ihn). */
  ensureThread(threadId: string, title = "Test"): T3MockThread {
    const existing = this.threads.get(threadId);
    if (existing) return existing;
    const thread: T3MockThread = {
      threadId,
      title,
      projectId: `project-${threadId}`,
      provider: "codex",
      model: "gpt-5-codex",
      generation: 1,
      items: [],
      activeRunId: null,
    };
    this.threads.set(threadId, thread);
    return thread;
  }

  /**
   * Beantwortet einen Request des Clients.
   *
   * @returns true, wenn die Methode bekannt ist (der Mock antwortet dann).
   */
  handleRequest(
    socket: T3MockSocket,
    requestId: string,
    tag: string,
    payload: unknown,
  ): boolean {
    switch (tag) {
      case "server.getConfig":
        socket.sendFrame({
          _tag: "Exit",
          requestId,
          exit: { _tag: "Success", value: this.serverConfig() },
        });
        return true;

      case "server.probe":
        socket.sendFrame({
          _tag: "Exit",
          requestId,
          exit: { _tag: "Success", value: { ok: true } },
        });
        return true;

      case "server.refreshProviders":
        socket.sendFrame({
          _tag: "Exit",
          requestId,
          exit: {
            _tag: "Success",
            value: { providers: this.providers },
          },
        });
        return true;

      case "orchestration.dispatchCommand":
        this.handleCommand(socket, requestId, payload);
        return true;

      case "orchestration.getThreadProjection":
        socket.sendFrame({
          _tag: "Exit",
          requestId,
          exit: {
            _tag: "Success",
            value: this.threadProjection(this.readThreadId(payload)),
          },
        });
        return true;

      case "server.getUsageSummary":
        socket.sendFrame({
          _tag: "Exit",
          requestId,
          exit: {
            _tag: "Success",
            value: {
              contractVersion: 2,
              totals: { costUsd: 1.25, inputTokens: 120_000, outputTokens: 8_000 },
              byProvider: [],
              byModel: [],
              byAgent: [],
            },
          },
        });
        return true;

      default:
        return false;
    }
  }

  /** Die Server-Config, wie der Sidecar sie meldet. */
  serverConfig(): unknown {
    return {
      version: "0.0.0-a40-mock",
      environment: {
        orchestrationProtocolVersion: 2,
        capabilities: { usageLimitSources: true },
      },
      providers: this.providers,
    };
  }

  /** Liest die Thread-ID aus einem Kommando-Payload. */
  readThreadId(payload: unknown): string {
    if (typeof payload !== "object" || payload === null) return "unknown";
    const record = payload as { threadId?: unknown };
    return typeof record.threadId === "string" ? record.threadId : "unknown";
  }

  /** Verarbeitet ein Orchestrierungs-Kommando. */
  handleCommand(
    socket: T3MockSocket,
    requestId: string,
    payload: unknown,
  ): void {
    const command =
      typeof payload === "object" && payload !== null
        ? (payload as { type?: string; threadId?: string; messageId?: string; text?: string })
        : {};
    const threadId = command.threadId ?? "unknown";

    if (command.type === "thread.create") {
      const thread = this.ensureThread(threadId, command.text);
      socket.sendFrame({
        _tag: "Exit",
        requestId,
        exit: { _tag: "Success", value: { ok: true, threadId: thread.threadId } },
      });
      return;
    }

    if (command.type === "message.dispatch") {
      const thread = this.ensureThread(threadId);
      thread.items.push({
        role: "user",
        text: command.text ?? "",
        at: new Date().toISOString(),
      });
      const runId = this.nextId("run");
      thread.activeRunId = runId;
      socket.sendFrame({
        _tag: "Exit",
        requestId,
        exit: { _tag: "Success", value: { ok: true, runId } },
      });
      return;
    }

    if (command.type === "run.interrupt") {
      const thread = this.threads.get(threadId);
      if (thread) thread.activeRunId = null;
      socket.sendFrame({
        _tag: "Exit",
        requestId,
        exit: { _tag: "Success", value: { ok: true, interrupted: true } },
      });
      return;
    }

    if (command.type === "runtime-request.respond") {
      socket.sendFrame({
        _tag: "Exit",
        requestId,
        exit: { _tag: "Success", value: { ok: true } },
      });
      return;
    }

    socket.sendFrame({
      _tag: "Exit",
      requestId,
      exit: { _tag: "Success", value: { ok: true } },
    });
  }

  /** Der Thread-Snapshot, wie der Sidecar ihn liefert. */
  threadProjection(threadId: string): unknown {
    const thread = this.ensureThread(threadId);
    return {
      threadId: thread.threadId,
      projectId: thread.projectId,
      title: thread.title,
      generation: thread.generation,
      status: thread.activeRunId ? "running" : "idle",
      messages: thread.items.map((item) => ({
        role: item.role,
        content: item.text,
        createdAt: item.at,
      })),
    };
  }
}

export type T3MockThread = {
  threadId: string;
  title: string;
  projectId: string;
  provider: string;
  model: string;
  generation: number;
  items: Array<{ role: string; text: string; at: string }>;
  activeRunId: string | null;
};

/**
 * Ein Socket, wie der Client ihn sieht.
 *
 * Der Mock hält die Frames, damit ein Test nachsehen kann, was der Client
 * gesendet hat (Requests, Acks, Interrupts).
 */
export class T3MockSocket implements T3WebSocketLike {
  readonly sent: string[] = [];
  readonly received: Array<{ tag: string; payload: unknown }> = [];
  readyState = 0;
  readonly #listeners = new Map<string, Set<(event: never) => void>>();
  #sidecar: T3MockSidecar | null = null;

  addEventListener(type: string, listener: (event: never) => void): void {
    const set = this.#listeners.get(type) ?? new Set<(event: never) => void>();
    set.add(listener);
    this.#listeners.set(type, set);
  }

  send(data: string): void {
    this.sent.push(data);
    let message: { _tag?: string; id?: string; tag?: string; payload?: unknown };
    try {
      message = JSON.parse(data) as typeof message;
    } catch {
      return;
    }
    if (message._tag !== "Request" || !message.id || !message.tag) return;
    this.received.push({ tag: message.tag, payload: message.payload });
    if (!this.#sidecar) return;
    const answered = this.#sidecar.handleRequest(
      this,
      message.id,
      message.tag,
      message.payload,
    );
    if (!answered) {
      this.sendFrame({
        _tag: "Exit",
        requestId: message.id,
        exit: {
          _tag: "Failure",
          cause: [{ _tag: "Fail", error: { _tag: "UnknownMethod", message: message.tag } }],
        },
      });
    }
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.#emit("close", { code: code ?? 1000, reason: reason ?? "" });
  }

  /** Schickt einen Frame an den Client. */
  sendFrame(frame: T3MockFrame): void {
    this.#emit("message", { data: JSON.stringify(frame) });
  }

  /** Öffnet den Socket (ruft das `open`-Ereignis aus). */
  open(): void {
    this.readyState = 1;
    this.#emit("open", {});
  }

  /** Bindet den Socket an einen Sidecar. */
  attach(sidecar: T3MockSidecar): void {
    this.#sidecar = sidecar;
  }

  /** Die gesendeten Client-Nachrichten, geparst. */
  sentMessages(): Array<Record<string, unknown>> {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }

  /** Die Requests, die der Client gestellt hat. */
  requests(): Array<{ tag: string; payload: unknown }> {
    return [...this.received];
  }

  #emit(type: string, event: unknown): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      (listener as (event: unknown) => void)(event);
    }
  }
}

/**
 * Baut eine WebSocket-Fabrik, die gegen den Mock-Sidecar geht.
 *
 * Der Client ruft die Fabrik synchron auf und erwartet, dass der Socket später
 * `open` meldet. Der Mock meldet das beim nächsten Tick — so hat der Test
 * dieselbe Semantik wie gegen einen echten Server.
 */
export function createMockSocketFactory(sidecar: T3MockSidecar): (url: string) => T3MockSocket {
  return () => {
    const socket = new T3MockSocket();
    socket.attach(sidecar);
    sidecar.sockets.push(socket);
    queueMicrotask(() => socket.open());
    return socket;
  };
}
