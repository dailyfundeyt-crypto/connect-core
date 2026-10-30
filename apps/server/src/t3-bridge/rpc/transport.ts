/**
 * T3-WS-RPC — WebSocket-Transport.
 *
 * Lane: A03 (Welle W1).
 *
 * Verantwortlichkeiten:
 *  - WebSocket öffnen (mit WebSocket-Ticket und Protokoll-Parameter)
 *  - Ping/Pong-Keepalive (T3: Ping alle 5 s, 15 s ohne Frame ⇒ Verbindung tot)
 *  - Requests verwalten: Id → Promise, Timeout, Abbruch
 *  - Streams: `Chunk`-Batches sammeln und an Abonnenten weiterreichen
 *  - `Ack` zurücksenden (T3 wartet auf die Bestätigung, bevor es den nächsten
 *    Batch schickt — ohne Ack steht der Stream)
 *  - Reconnect mit exponentiellem Backoff
 *
 * Der Transport kennt bewusst **keine** T3-Methoden. Er ist ein generischer
 * Effect-RPC-Kanal; die Methoden liegen in `client.ts`.
 */

import {
  decodeT3Messages,
  encodeT3Message,
  readT3ExitFailure,
  t3Request,
  type T3ClientMessage,
  type T3Exit,
  type T3ServerMessage,
} from "./protocol";
import {
  T3_ORCHESTRATION_PROTOCOL_PARAM,
  T3_ORCHESTRATION_PROTOCOL_VERSION,
  T3_WS_PATH,
  T3_WS_TICKET_PARAM,
  T3_WS_TICKET_PATH,
} from "./types";
import {
  type T3RpcAbortError,
  type T3RpcAuthError,
  type T3RpcClosedError,
  type T3RpcRemoteError,
  type T3RpcTimeoutError,
  type T3RpcTransportError,
} from "./errors";

/** Ein Callback für einen Stream-Wert. */
export type T3StreamListener = (value: unknown) => void;

/** Ein Callback für das Ende (oder den Fehler) eines Streams. */
export type T3StreamEndListener = (
  error: T3RpcRemoteError | T3RpcTransportError | T3RpcClosedError | null,
) => void;

/** Ein laufender Stream (Abonnement). */
export interface T3StreamSubscription {
  /** Meldet, ob der Stream noch läuft. */
  readonly closed: boolean;
  /** Beendet das Abonnement. */
  readonly close: () => void;
}

/** Ein laufender Unary-Request. */
interface PendingRequest {
  readonly method: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
}

/** Optionen des Transports. */
export type T3RpcTransportOptions = {
  /** Ursprung des T3-Servers, z. B. `http://127.0.0.1:3773`. Nur Loopback erlaubt. */
  readonly origin: string;
  /**
   * Bearer-Token, mit dem das WebSocket-Ticket gemintet wird.
   * Wird **nicht** geloggt. Fehlt der Token, verbindet sich der Transport
   * nur mit einem direkt übergebenen Ticket (siehe `wsTicket`).
   */
  readonly bearerToken?: string | null;
  /** Fertiges WebSocket-Ticket (überspringt die Ticket-Anforderung). */
  readonly wsTicket?: string | null;
  /** Erzeugt ein WebSocket-Ticket. Standard: HTTP gegen den T3-Server. */
  readonly requestWsTicket?: (origin: string, bearerToken: string) => Promise<string>;
  /** Timeout für die Ticket-Anforderung (ms). */
  readonly ticketTimeoutMs?: number;
  /** Timeout für das Öffnen des Sockets (ms). */
  readonly connectTimeoutMs?: number;
  /** Standard-Timeout für Unary-Requests (ms). */
  readonly requestTimeoutMs?: number;
  /** Intervall der Pings (ms). */
  readonly pingIntervalMs?: number;
  /** Zeitfenster, in dem ein Frame kommen muss (ms). */
  readonly pingTimeoutMs?: number;
  /** Basis für den Reconnect-Backoff (ms). */
  readonly reconnectBaseMs?: number;
  /** Obergrenze für den Reconnect-Backoff (ms). */
  readonly reconnectMaxMs?: number;
  /** Maximum Anzahl Reconnect-Versuche (0 = unendlich). */
  readonly maxReconnectAttempts?: number;
  /** Zufallsquelle für den Jitter (0..1). Zum Testen injizierbar. */
  readonly random?: () => number;
  /** Logger. Bekommt **nie** Tokens. */
  readonly log?: (message: string, detail?: Record<string, unknown>) => void;
};

/** Standardwerte, an T3 (`PING_TIMEOUT` in `packages/client-runtime/src/rpc/protocol.ts`). */
export const T3_RPC_DEFAULTS = {
  connectTimeoutMs: 15_000,
  requestTimeoutMs: 30_000,
  ticketTimeoutMs: 10_000,
  pingIntervalMs: 5_000,
  pingTimeoutMs: 15_000,
  reconnectBaseMs: 500,
  reconnectMaxMs: 30_000,
  maxReconnectAttempts: 0,
} as const;

/** Zustand der Verbindung. */
export type T3RpcConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

/** Öffentlicher Zustand des Transports. */
export type T3RpcTransportStatus = {
  readonly state: T3RpcConnectionState;
  readonly origin: string;
  readonly reconnectAttempts: number;
  readonly lastError: string | null;
};

/** WebSocket-Fabrik — injizierbar, damit Tests einen Mock einsetzen können. */
export type T3WebSocketFactory = (url: string) => T3WebSocketLike;

/** Minimale WebSocket-Schnittstelle, die der Transport braucht. */
export interface T3WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: never) => void): void;
  readonly readyState: number;
}

const WS_OPEN = 1;

function defaultWebSocketFactory(url: string): T3WebSocketLike {
  const socket = new WebSocket(url);
  return socket as unknown as T3WebSocketLike;
}

function toErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}

/**
 * Rechnet eine HTTP-Origin in die WS-URL des T3-Servers um.
 *
 * Erwartet wird `http://127.0.0.1:3773` → `ws://127.0.0.1:3773/ws?...`.
 */
export function buildT3SocketUrl(
  origin: string,
  options: { readonly wsTicket?: string | null; readonly orchestrationProtocol?: number } = {},
): string {
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = T3_WS_PATH;
  url.search = "";
  url.searchParams.set(
    T3_ORCHESTRATION_PROTOCOL_PARAM,
    String(options.orchestrationProtocol ?? T3_ORCHESTRATION_PROTOCOL_VERSION),
  );
  if (options.wsTicket) {
    url.searchParams.set(T3_WS_TICKET_PARAM, options.wsTicket);
  }
  return url.toString();
}

/**
 * Der Effect-RPC-Kanal zum T3-Server.
 *
 * Er ist zustandsbehaftet (Socket, laufende Requests, Streams) und wird von
 * `client.ts` gekapselt. Es gibt bewusst keine Singleton-Instanz: der Client
 * verwaltet die Lebensdauer selbst.
 */
export class T3RpcTransport {
  readonly #options: Required<
    Pick<
      T3RpcTransportOptions,
      | "origin"
      | "connectTimeoutMs"
      | "requestTimeoutMs"
      | "ticketTimeoutMs"
      | "pingIntervalMs"
      | "pingTimeoutMs"
      | "reconnectBaseMs"
      | "reconnectMaxMs"
      | "maxReconnectAttempts"
    >
  > &
    T3RpcTransportOptions;

  readonly #webSocketFactory: T3WebSocketFactory;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #streams = new Map<
    string,
    { readonly listeners: Set<T3StreamListener>; readonly ends: Set<T3StreamEndListener> }
  >();
  readonly #streamValues = new Map<string, unknown[]>();

  #socket: T3WebSocketLike | null = null;
  #state: T3RpcConnectionState = "idle";
  #requestCounter = 0;
  #reconnectAttempts = 0;
  #lastError: string | null = null;
  #pingTimer: ReturnType<typeof setInterval> | null = null;
  #pingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #closedByUser = false;
  #connecting: Promise<void> | null = null;

  constructor(options: T3RpcTransportOptions & { readonly webSocketFactory?: T3WebSocketFactory }) {
    this.#options = {
      ...options,
      connectTimeoutMs: options.connectTimeoutMs ?? T3_RPC_DEFAULTS.connectTimeoutMs,
      requestTimeoutMs: options.requestTimeoutMs ?? T3_RPC_DEFAULTS.requestTimeoutMs,
      ticketTimeoutMs: options.ticketTimeoutMs ?? T3_RPC_DEFAULTS.ticketTimeoutMs,
      pingIntervalMs: options.pingIntervalMs ?? T3_RPC_DEFAULTS.pingIntervalMs,
      pingTimeoutMs: options.pingTimeoutMs ?? T3_RPC_DEFAULTS.pingTimeoutMs,
      reconnectBaseMs: options.reconnectBaseMs ?? T3_RPC_DEFAULTS.reconnectBaseMs,
      reconnectMaxMs: options.reconnectMaxMs ?? T3_RPC_DEFAULTS.reconnectMaxMs,
      maxReconnectAttempts: options.maxReconnectAttempts ?? T3_RPC_DEFAULTS.maxReconnectAttempts,
    };
    this.#webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory;
  }

  /** Aktueller Zustand. */
  get status(): T3RpcTransportStatus {
    return {
      state: this.#state,
      origin: this.#options.origin,
      reconnectAttempts: this.#reconnectAttempts,
      lastError: this.#lastError,
    };
  }

  /** `true`, wenn der Socket offen ist. */
  get isOpen(): boolean {
    return this.#state === "open" && this.#socket !== null;
  }

  /**
   * Öffnet die Verbindung.
   *
   * Mehrfachaufrufe teilen sich denselben Verbindungsversuch.
   */
  async connect(): Promise<void> {
    if (this.#state === "open") return;
    if (this.#connecting) return this.#connecting;
    this.#closedByUser = false;
    this.#connecting = this.#connectOnce().finally(() => {
      this.#connecting = null;
    });
    return this.#connecting;
  }

  async #connectOnce(): Promise<void> {
    this.#state = "connecting";
    let ticket = this.#options.wsTicket ?? null;
    if (!ticket) {
      ticket = await this.#requestTicket();
    }
    const url = buildT3SocketUrl(this.#options.origin, { wsTicket: ticket });
    await this.#openSocket(url);
  }

  async #requestTicket(): Promise<string> {
    const token = this.#options.bearerToken;
    if (!token) {
      throw {
        _tag: "T3RpcAuthError",
        message: "Kein Bearer-Token für den T3-Sidecar konfiguriert.",
        status: null,
      } satisfies T3RpcAuthError;
    }
    const requester =
      this.#options.requestWsTicket ?? defaultRequestWsTicket;
    try {
      return await withTimeout(
        requester(this.#options.origin, token),
        this.#options.ticketTimeoutMs,
        () =>
          ({
            _tag: "T3RpcTimeoutError",
            message: "Das WebSocket-Ticket vom T3-Sidecar kam zu spät.",
            method: "auth.websocket-ticket",
            timeoutMs: this.#options.ticketTimeoutMs,
          }) satisfies T3RpcTimeoutError,
      );
    } catch (cause) {
      if (isErrorWithTag(cause, "T3RpcTimeoutError")) throw cause;
      throw {
        _tag: "T3RpcAuthError",
        message: "Der T3-Sidecar hat kein WebSocket-Ticket herausgegeben.",
        status: null,
        cause,
      } satisfies T3RpcAuthError;
    }
  }

  #openSocket(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let socket: T3WebSocketLike;
      try {
        socket = this.#webSocketFactory(url);
      } catch (cause) {
        reject({
          _tag: "T3RpcTransportError",
          message: "Der WebSocket zum T3-Sidecar konnte nicht geöffnet werden.",
          origin: this.#options.origin,
          cause,
        } satisfies T3RpcTransportError);
        return;
      }
      this.#socket = socket;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          socket.close(1000, "connect timeout");
        } catch {
          /* ignore */
        }
        reject({
          _tag: "T3RpcTimeoutError",
          message: "Die Verbindung zum T3-Sidecar hat zu lange gedauert.",
          method: "connect",
          timeoutMs: this.#options.connectTimeoutMs,
        } satisfies T3RpcTimeoutError);
      }, this.#options.connectTimeoutMs);

      socket.addEventListener("open", (() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#state = "open";
        this.#reconnectAttempts = 0;
        this.#lastError = null;
        this.#startPing();
        this.#options.log?.("T3-Sidecar verbunden.", { origin: this.#options.origin });
        resolve();
      }) as (event: never) => void);

      socket.addEventListener("message", ((event: { data: unknown }) => {
        this.#handleFrame(event.data);
      }) as (event: never) => void);

      socket.addEventListener("error", (() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject({
          _tag: "T3RpcTransportError",
          message: "Die Verbindung zum T3-Sidecar ist fehlgeschlagen.",
          origin: this.#options.origin,
        } satisfies T3RpcTransportError);
      }) as (event: never) => void);

      socket.addEventListener("close", ((event: { code?: number; reason?: string }) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject({
            _tag: "T3RpcTransportError",
            message: "Die Verbindung zum T3-Sidecar wurde vor dem Öffnen geschlossen.",
            origin: this.#options.origin,
          } satisfies T3RpcTransportError);
          return;
        }
        this.#handleClose(event.code ?? null, event.reason ?? null);
      }) as (event: never) => void);
    });
  }

  #handleFrame(data: unknown): void {
    this.#resetPingTimeout();
    const raw = typeof data === "string" ? data : String(data);
    for (const message of decodeT3Messages(raw)) {
      this.#handleMessage(message);
    }
  }

  #handleMessage(message: T3ServerMessage): void {
    switch (message._tag) {
      case "Pong":
        return;
      case "Chunk": {
        this.#handleChunk(message.requestId, message.values);
        return;
      }
      case "Exit": {
        this.#handleExit(message.requestId, message.exit);
        return;
      }
      case "Defect": {
        this.#failPendingByDefect(message.defect);
        return;
      }
      case "ClientProtocolError": {
        this.#failPendingByDefect(message.error);
        return;
      }
      case "Request": {
        // Der T3-Server stellt keine Server→Client-Requests ohne vorherige
        // Zustimmung. Wir antworten nicht und melden das als Defekt.
        this.#options.log?.("Unerwartete Server-Anfrage vom T3-Sidecar.", {
          tag: message.tag,
        });
        return;
      }
    }
  }

  #handleChunk(requestId: string, values: ReadonlyArray<unknown>): void {
    const subscription = this.#streams.get(requestId);
    if (!subscription) {
      // Kein Abonnement (z. B. eine späte Antwort nach Abbruch) — trotzdem
      // bestätigen, damit der Server weiterarbeiten kann.
      this.#sendAck(requestId);
      return;
    }
    const buffered = this.#streamValues.get(requestId) ?? [];
    buffered.push(...values);
    this.#streamValues.set(requestId, buffered);
    for (const value of values) {
      for (const listener of subscription.listeners) {
        try {
          listener(value);
        } catch (cause) {
          this.#options.log?.("Ein Stream-Listener hat geworfen.", toErrorDetails(cause));
        }
      }
    }
    this.#sendAck(requestId);
  }

  #handleExit(requestId: string, exit: T3Exit): void {
    const pending = this.#pending.get(requestId);
    if (pending) {
      this.#pending.delete(requestId);
      if (pending.timer !== null) clearTimeout(pending.timer);
      pending.settled = true;
      if (exit._tag === "Success") {
        pending.resolve(exit.value);
        return;
      }
      const failure = readT3ExitFailure(exit);
      pending.reject({
        _tag: "T3RpcRemoteError",
        message: describeRemoteFailure(pending.method, failure?.error),
        method: pending.method,
        error: failure?.error,
        remoteTag: readTag(failure?.error),
      } satisfies T3RpcRemoteError);
      return;
    }
    const subscription = this.#streams.get(requestId);
    if (subscription) {
      this.#streams.delete(requestId);
      this.#streamValues.delete(requestId);
      const failure = exit._tag === "Success" ? null : readT3ExitFailure(exit);
      const error: T3RpcRemoteError | null =
        exit._tag === "Success"
          ? null
          : ({
              _tag: "T3RpcRemoteError",
              message: describeRemoteFailure("stream", failure?.error),
              method: "stream",
              error: failure?.error,
              remoteTag: readTag(failure?.error),
            } satisfies T3RpcRemoteError);
      for (const end of subscription.ends) {
        try {
          end(error);
        } catch (cause) {
          this.#options.log?.("Ein Stream-Ende-Listener hat geworfen.", toErrorDetails(cause));
        }
      }
    }
  }

  #failPendingByDefect(defect: unknown): void {
    for (const [id, pending] of [...this.#pending.entries()]) {
      this.#pending.delete(id);
      if (pending.timer !== null) clearTimeout(pending.timer);
      pending.settled = true;
      pending.reject({
        _tag: "T3RpcDefectError",
        message: `Der T3-Sidecar hat einen Defect gemeldet: ${describeRemoteFailure(pending.method, defect)}`,
        method: pending.method,
        defect,
      });
    }
    for (const [, subscription] of [...this.#streams.entries()]) {
      for (const end of subscription.ends) {
        try {
          end({
            _tag: "T3RpcRemoteError",
            message: "Der T3-Sidecar hat den Stream mit einem Defect beendet.",
            method: "stream",
            error: defect,
            remoteTag: null,
          } satisfies T3RpcRemoteError);
        } catch {
          /* ignore */
        }
      }
    }
    this.#streams.clear();
    this.#streamValues.clear();
  }

  #sendAck(requestId: string): void {
    this.#write({ _tag: "Ack", requestId });
  }

  #write(message: T3ClientMessage): void {
    const socket = this.#socket;
    if (!socket || socket.readyState !== WS_OPEN) return;
    try {
      socket.send(encodeT3Message(message));
    } catch (cause) {
      this.#options.log?.("Senden zum T3-Sidecar fehlgeschlagen.", toErrorDetails(cause));
    }
  }

  #startPing(): void {
    this.#stopPing();
    this.#pingTimer = setInterval(() => {
      this.#write({ _tag: "Ping" });
      this.#resetPingTimeout();
    }, this.#options.pingIntervalMs);
    // Bun hält den Prozess wegen eines offenen Interval-Timers wach; der
    // Timer wird deshalb als `unref` markiert, wo die Laufzeit das kann.
    (this.#pingTimer as { unref?: () => void }).unref?.();
  }

  #resetPingTimeout(): void {
    if (this.#pingTimeoutTimer !== null) clearTimeout(this.#pingTimeoutTimer);
    this.#pingTimeoutTimer = setTimeout(() => {
      this.#options.log?.("Der T3-Sidecar hat zu lange nicht geantwortet.");
      this.#handleClose(null, "ping timeout");
    }, this.#options.pingTimeoutMs);
    (this.#pingTimeoutTimer as { unref?: () => void }).unref?.();
  }

  #stopPing(): void {
    if (this.#pingTimer !== null) {
      clearInterval(this.#pingTimer);
      this.#pingTimer = null;
    }
    if (this.#pingTimeoutTimer !== null) {
      clearTimeout(this.#pingTimeoutTimer);
      this.#pingTimeoutTimer = null;
    }
  }

  #handleClose(code: number | null, reason: string | null): void {
    this.#stopPing();
    const wasOpen = this.#state === "open";
    this.#state = this.#closedByUser ? "closed" : "reconnecting";
    this.#socket = null;
    const closedError: T3RpcClosedError = {
      _tag: "T3RpcClosedError",
      message: `Die Verbindung zum T3-Sidecar wurde geschlossen${reason ? `: ${reason}` : "."}`,
      code,
      reason,
    };
    for (const [id, pending] of [...this.#pending.entries()]) {
      this.#pending.delete(id);
      if (pending.timer !== null) clearTimeout(pending.timer);
      pending.settled = true;
      pending.reject(closedError);
    }
    for (const [, subscription] of [...this.#streams.entries()]) {
      for (const end of subscription.ends) {
        try {
          end(closedError);
        } catch {
          /* ignore */
        }
      }
    }
    this.#streams.clear();
    this.#streamValues.clear();
    if (!this.#closedByUser && wasOpen) {
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect(): void {
    const max = this.#options.maxReconnectAttempts;
    if (max > 0 && this.#reconnectAttempts >= max) {
      this.#state = "closed";
      this.#lastError = "Maximale Zahl der Reconnect-Versuche erreicht.";
      return;
    }
    const attempt = this.#reconnectAttempts;
    this.#reconnectAttempts += 1;
    const delay = Math.min(
      this.#options.reconnectBaseMs * 2 ** attempt,
      this.#options.reconnectMaxMs,
    );
    // Jitter: bis zu 30 % Streuung, damit viele Connect-Instanzen nicht
    // gleichzeitig wieder anklopfen.
    const jitter = 1 + (this.#options.random?.() ?? Math.random()) * 0.3;
    const wait = Math.round(delay * jitter);
    this.#options.log?.("Reconnect zum T3-Sidecar geplant.", { attempt, wait });
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      if (this.#closedByUser) return;
      this.#connecting = this.#connectOnce()
        .catch((cause) => {
          this.#lastError = describeRemoteFailure("connect", cause);
          this.#scheduleReconnect();
        })
        .finally(() => {
          this.#connecting = null;
        });
    }, wait);
    (this.#reconnectTimer as { unref?: () => void }).unref?.();
  }

  /**
   * Führt einen Unary-Request aus.
   */
  request(
    method: string,
    payload: unknown,
    options: { readonly timeoutMs?: number; readonly signal?: AbortSignal } = {},
  ): Promise<unknown> {
    if (!this.isOpen) {
      return Promise.reject({
        _tag: "T3RpcNotConnectedError",
        message: "Es gibt keine Verbindung zum T3-Sidecar.",
        origin: this.#options.origin,
      });
    }
    const timeoutMs = options.timeoutMs ?? this.#options.requestTimeoutMs;
    const id = `t3-${Date.now().toString(36)}-${(this.#requestCounter += 1).toString(36)}`;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        this.#write({ _tag: "Interrupt", requestId: id, interruptors: [] });
        reject({
          _tag: "T3RpcTimeoutError",
          message: `Der T3-Sidecar hat "${method}" nicht rechtzeitig beantwortet.`,
          method,
          timeoutMs,
        } satisfies T3RpcTimeoutError);
      }, timeoutMs);
      (timer as { unref?: () => void }).unref?.();

      const pending: PendingRequest = {
        method,
        resolve,
        reject,
        timer,
        settled: false,
      };
      this.#pending.set(id, pending);

      if (options.signal) {
        const onAbort = () => {
          if (pending.settled) return;
          pending.settled = true;
          this.#pending.delete(id);
          clearTimeout(timer);
          this.#write({ _tag: "Interrupt", requestId: id, interruptors: [] });
          reject({
            _tag: "T3RpcAbortError",
            message: `Der Aufruf von "${method}" wurde abgebrochen.`,
            method,
          } satisfies T3RpcAbortError);
        };
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      this.#write(t3Request(id, method, payload));
    });
  }

  /**
   * Startet ein Stream-Abonnement.
   */
  subscribe(
    method: string,
    payload: unknown,
    listeners: {
      readonly onValue: T3StreamListener;
      readonly onEnd?: T3StreamEndListener;
    },
  ): T3StreamSubscription {
    const id = `t3-${Date.now().toString(36)}-${(this.#requestCounter += 1).toString(36)}`;
    const subscription = {
      listeners: new Set<T3StreamListener>([listeners.onValue]),
      ends: new Set<T3StreamEndListener>(),
    };
    if (listeners.onEnd) subscription.ends.add(listeners.onEnd);
    this.#streams.set(id, subscription);
    this.#streamValues.set(id, []);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      this.#streams.delete(id);
      this.#streamValues.delete(id);
      this.#write({ _tag: "Interrupt", requestId: id, interruptors: [] });
    };

    if (!this.isOpen) {
      closed = true;
      this.#streams.delete(id);
      this.#streamValues.delete(id);
      queueMicrotask(() => {
        listeners.onEnd?.({
          _tag: "T3RpcRemoteError",
          message: "Es gibt keine Verbindung zum T3-Sidecar.",
          method,
          error: null,
          remoteTag: null,
        });
      });
      return { closed: true, close };
    }

    this.#write(t3Request(id, method, payload));
    return {
      get closed() {
        return closed;
      },
      close,
    };
  }

  /** Schließt die Verbindung endgültig (kein Reconnect). */
  close(): void {
    this.#closedByUser = true;
    this.#stopPing();
    if (this.#reconnectTimer !== null) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    const socket = this.#socket;
    this.#socket = null;
    this.#state = "closed";
    if (socket) {
      try {
        socket.close(1000, "client closed");
      } catch {
        /* ignore */
      }
    }
    for (const [id, pending] of [...this.#pending.entries()]) {
      this.#pending.delete(id);
      if (pending.timer !== null) clearTimeout(pending.timer);
      pending.settled = true;
      pending.reject({
        _tag: "T3RpcClosedError",
        message: "Die Verbindung zum T3-Sidecar wurde geschlossen.",
        code: 1000,
        reason: "client closed",
      });
    }
    for (const [, subscription] of [...this.#streams.entries()]) {
      for (const end of subscription.ends) {
        try {
          end(null);
        } catch {
          /* ignore */
        }
      }
    }
    this.#streams.clear();
    this.#streamValues.clear();
  }
}

/**
 * Standard-Implementierung: fordert über HTTP ein WebSocket-Ticket an.
 *
 * Der Bearer-Token wird nur als `Authorization`-Header gesendet und nie
 * protokolliert.
 */
export async function defaultRequestWsTicket(origin: string, bearerToken: string): Promise<string> {
  const response = await fetch(new URL(T3_WS_TICKET_PATH, origin), {
    method: "POST",
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
  if (!response.ok) {
    throw {
      _tag: "T3RpcAuthError",
      message: "Der T3-Sidecar hat das WebSocket-Ticket verweigert.",
      status: response.status,
    };
  }
  const body = (await response.json()) as { ticket?: unknown };
  if (typeof body.ticket !== "string" || body.ticket.length === 0) {
    throw {
      _tag: "T3RpcAuthError",
      message: "Der T3-Sidecar hat kein WebSocket-Ticket zurückgegeben.",
      status: response.status,
    };
  }
  return body.ticket;
}

function readTag(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const tag = (value as { _tag?: unknown })._tag;
  return typeof tag === "string" ? tag : null;
}

function describeRemoteFailure(method: string, error: unknown): string {
  if (error === null || error === undefined) {
    return `Der T3-Sidecar hat "${method}" ohne Ergebnis beendet.`;
  }
  if (typeof error === "object") {
    const candidate = error as { message?: unknown; _tag?: unknown };
    if (typeof candidate.message === "string" && candidate.message.length > 0) {
      return candidate.message;
    }
    if (typeof candidate._tag === "string") {
      return `Der T3-Sidecar meldet für "${method}": ${candidate._tag}.`;
    }
  }
  return `Der T3-Sidecar hat für "${method}" einen Fehler gemeldet.`;
}

function isErrorWithTag(value: unknown, tag: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { _tag?: unknown })._tag === tag
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  makeError: () => T3RpcTimeoutError,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(makeError()), timeoutMs);
        (timer as { unref?: () => void }).unref?.();
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
