/**
 * Unit-Tests für den T3-WS-RPC-Client.
 *
 * Lane: A03 (Welle W1).
 *
 * Getestet wird gegen einen Mock-WS-Server (kein echter Socket): der Test
 * injiziert eine WebSocket-Fabrik und steuert die Frames von Hand. Damit
 * lassen sich Reconnect, Timeouts, Ack-Flow und Fehlerfälle deterministisch
 * prüfen.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  T3RpcClient,
  T3RpcTransport,
  buildT3SocketUrl,
  decodeT3Messages,
  encodeT3Message,
  isT3RpcError,
  normalizeProviderList,
  type T3WebSocketLike,
} from "./index";
import { T3_ORCHESTRATION_PROTOCOL_VERSION } from "./types";

/* ---------------------------------------------------------------------------------------- *
 * Mock-WS-Server
 * ---------------------------------------------------------------------------------------- */

type Listener = (event: never) => void;

class MockSocket implements T3WebSocketLike {
  readonly sent: string[] = [];
  readyState = 1;
  closed = false;
  readonly #listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    const set = this.#listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.#listeners.set(type, set);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    this.readyState = 3;
    this.#emit("close", { code: code ?? 1000, reason: reason ?? "" });
  }

  /** Löst das `open`-Ereignis aus. */
  open(): void {
    this.readyState = 1;
    this.#emit("open", {});
  }

  /** Schickt einen Frame an den Client. */
  push(message: unknown): void {
    this.#emit("message", { data: typeof message === "string" ? message : JSON.stringify(message) });
  }

  /** Liest alle gesendeten Client-Nachrichten. */
  sentMessages(): Array<Record<string, unknown>> {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }

  #emit(type: string, event: unknown): void {
    for (const listener of this.#listeners.get(type) ?? []) {
      (listener as (event: unknown) => void)(event);
    }
  }
}

/** Ein Mock-Server, der mehrere Sockets nacheinander annimmt. */
class MockWsServer {
  readonly sockets: MockSocket[] = [];
  #factory: (url: string) => T3WebSocketLike = () => {
    const socket = new MockSocket();
    this.sockets.push(socket);
    return socket;
  };

  factory = (url: string): T3WebSocketLike => this.#factory(url);

  /** Verwendet ab dem nächsten Aufruf eine andere Fabrik. */
  setFactory(factory: (url: string) => T3WebSocketLike): void {
    this.#factory = factory;
  }

  /** Der zuletzt erzeugte Socket. */
  get last(): MockSocket {
    const socket = this.sockets[this.sockets.length - 1];
    if (!socket) throw new Error("Mock-Server hat noch keinen Socket erzeugt.");
    return socket;
  }

  /** Wartet, bis ein Socket existiert. */
  async waitForSocket(index = 0): Promise<MockSocket> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (this.sockets[index]) return this.sockets[index];
      await Bun.sleep(5);
    }
    throw new Error("Mock-Server hat keinen Socket erzeugt.");
  }
}

const ORIGINAL_FLAGS = process.env.CONNECT_FLAGS_T3;

function enableBridge(): void {
  process.env.CONNECT_FLAGS_T3 = "all";
}

function disableBridge(): void {
  process.env.CONNECT_FLAGS_T3 = "";
}

afterEach(() => {
  if (ORIGINAL_FLAGS === undefined) delete process.env.CONNECT_FLAGS_T3;
  else process.env.CONNECT_FLAGS_T3 = ORIGINAL_FLAGS;
});

/* ---------------------------------------------------------------------------------------- *
 * URL-Aufbau
 * ---------------------------------------------------------------------------------------- */

describe("T3-WS-RPC URL-Aufbau", () => {
  test("setzt Protokoll-Version und Pfad", () => {
    const url = new URL(buildT3SocketUrl("http://127.0.0.1:3773"));
    expect(url.protocol).toBe("ws:");
    expect(url.pathname).toBe("/ws");
    expect(url.searchParams.get("orchestrationProtocol")).toBe(
      String(T3_ORCHESTRATION_PROTOCOL_VERSION),
    );
    expect(url.searchParams.get("wsTicket")).toBeNull();
  });

  test("hängt das Ticket als Query-Parameter an", () => {
    const url = new URL(
      buildT3SocketUrl("http://127.0.0.1:3773", { wsTicket: "t-123" }),
    );
    expect(url.searchParams.get("wsTicket")).toBe("t-123");
  });

  test("https wird zu wss", () => {
    const url = new URL(buildT3SocketUrl("https://127.0.0.1:3773"));
    expect(url.protocol).toBe("wss:");
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Protokoll
 * ---------------------------------------------------------------------------------------- */

describe("T3-WS-RPC Protokoll", () => {
  test("kodiert Client-Nachrichten als JSON ohne Newline", () => {
    const encoded = encodeT3Message({ _tag: "Ping" });
    expect(encoded).toBe('{"_tag":"Ping"}');
    expect(encoded.includes("\n")).toBe(false);
  });

  test("dekodiert nur bekannte Server-Nachrichten", () => {
    expect(decodeT3Messages('{"_tag":"Pong"}')).toHaveLength(1);
    expect(decodeT3Messages('{"_tag":"Unbekannt"}')).toHaveLength(0);
    expect(decodeT3Messages("kein json")).toHaveLength(0);
  });

  test("dekodiert ein Array von Nachrichten", () => {
    const messages = decodeT3Messages('[{"_tag":"Pong"},{"_tag":"Chunk","requestId":"a","values":[]}]');
    expect(messages).toHaveLength(2);
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Transport
 * ---------------------------------------------------------------------------------------- */

describe("T3-WS-RPC Transport", () => {
  test("meldet ohne Token einen Auth-Fehler", async () => {
    const server = new MockWsServer();
    const transport = new T3RpcTransport({
      origin: "http://127.0.0.1:3773",
      webSocketFactory: server.factory,
    });
    await expect(transport.connect()).rejects.toMatchObject({
      _tag: "T3RpcAuthError",
    });
  });

  test("fragt ein Ticket an und benutzt es beim Verbinden", async () => {
    const server = new MockWsServer();
    const requested: string[] = [];
    const transport = new T3RpcTransport({
      origin: "http://127.0.0.1:3773",
      bearerToken: "secret-token",
      requestWsTicket: async (origin, token) => {
        requested.push(origin);
        expect(token).toBe("secret-token");
        return "ticket-42";
      },
      webSocketFactory: server.factory,
    });

    const connecting = transport.connect();
    const socket = await server.waitForSocket();
    expect(server.factory).toBeDefined();
    socket.open();
    await connecting;

    expect(requested).toEqual(["http://127.0.0.1:3773"]);
    expect(transport.isOpen).toBe(true);
    transport.close();
  });

  test("beantwortet einen Request mit dem Exit-Wert", async () => {
    const server = new MockWsServer();
    const transport = new T3RpcTransport({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = transport.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await connecting;

    const pending = transport.request("server.getConfig", {});
    await Bun.sleep(5);
    const request = socket.sentMessages().find((m) => m._tag === "Request");
    expect(request?.tag).toBe("server.getConfig");
    socket.push({
      _tag: "Exit",
      requestId: request?.id,
      exit: { _tag: "Success", value: { providers: [] } },
    });

    await expect(pending).resolves.toEqual({ providers: [] });
    transport.close();
  });

  test("meldet einen typisierten Serverfehler als T3RpcRemoteError", async () => {
    const server = new MockWsServer();
    const transport = new T3RpcTransport({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = transport.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await connecting;

    const pending = transport.request("server.getConfig", {});
    await Bun.sleep(5);
    const request = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: request?.id,
      exit: {
        _tag: "Failure",
        cause: [{ _tag: "Fail", error: { _tag: "UnauthorizedError", message: "nope" } }],
      },
    });

    await expect(pending).rejects.toMatchObject({
      _tag: "T3RpcRemoteError",
      remoteTag: "UnauthorizedError",
    });
    transport.close();
  });

  test("bricht einen Request nach Timeout ab und sendet ein Interrupt", async () => {
    const server = new MockWsServer();
    const transport = new T3RpcTransport({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      requestTimeoutMs: 40,
      webSocketFactory: server.factory,
    });

    const connecting = transport.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await connecting;

    await expect(transport.request("server.getConfig", {})).rejects.toMatchObject({
      _tag: "T3RpcTimeoutError",
      method: "server.getConfig",
    });
    expect(socket.sentMessages().some((m) => m._tag === "Interrupt")).toBe(true);
    transport.close();
  });

  test("schickt bei einem Stream-Chunk ein Ack zurück", async () => {
    const server = new MockWsServer();
    const transport = new T3RpcTransport({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = transport.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await connecting;

    const values: unknown[] = [];
    const subscription = transport.subscribe("orchestration.subscribeThread", { threadId: "t1" }, {
      onValue: (value) => values.push(value),
    });
    await Bun.sleep(5);
    const request = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Chunk",
      requestId: request?.id,
      values: [{ type: "message.updated" }],
    });
    await Bun.sleep(5);

    expect(values).toEqual([{ type: "message.updated" }]);
    expect(socket.sentMessages().some((m) => m._tag === "Ack" && m.requestId === request?.id)).toBe(
      true,
    );
    subscription.close();
    transport.close();
  });

  test("verbindet sich nach einem Verbindungsabbruch neu (Backoff)", async () => {
    const server = new MockWsServer();
    const transport = new T3RpcTransport({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      reconnectBaseMs: 10,
      reconnectMaxMs: 20,
      random: () => 0,
      webSocketFactory: server.factory,
    });

    const connecting = transport.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await connecting;

    // Server bricht die Verbindung ab.
    socket.close(1006, "weg");
    await Bun.sleep(30);

    const second = await server.waitForSocket(1);
    expect(second).toBeDefined();
    second.open();
    await Bun.sleep(10);
    expect(transport.isOpen).toBe(true);
    transport.close();
  });

  test("schließt offene Requests beim close() mit T3RpcClosedError", async () => {
    const server = new MockWsServer();
    const transport = new T3RpcTransport({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = transport.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await connecting;

    const pending = transport.request("server.getConfig", {});
    await Bun.sleep(5);
    transport.close();
    await expect(pending).rejects.toMatchObject({ _tag: "T3RpcClosedError" });
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Client
 * ---------------------------------------------------------------------------------------- */

describe("T3-WS-RPC Client", () => {
  test("verbindet sich nicht, wenn das Feature-Flag aus ist", async () => {
    disableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      webSocketFactory: server.factory,
    });
    await expect(client.connect()).resolves.toBeNull();
    expect(server.sockets).toHaveLength(0);
    client.close();
  });

  test("liest die Provider-Liste und normalisiert sie", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);

    const request = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: request?.id,
      exit: {
        _tag: "Success",
        value: {
          environment: {
            environmentId: "local",
            label: "Lokal",
            serverVersion: "0.1.0",
            orchestrationProtocolVersion: T3_ORCHESTRATION_PROTOCOL_VERSION,
            capabilities: { usageLimitSources: true },
          },
          providers: [
            {
              instanceId: "codex-1",
              driver: "codex",
              displayName: "Codex",
              enabled: true,
              installed: true,
              version: "1.2.3",
              auth: { authenticated: true },
              models: [{ id: "gpt-5" }],
              usageLimits: {
                windows: [{ id: "w1", kind: "weekly", label: "Woche", usedPercent: 42 }],
              },
            },
            {
              instanceId: "claude-1",
              driver: "claudeAgent",
              enabled: true,
              installed: false,
              unavailableReason: "Nicht installiert",
            },
          ],
        },
      },
    });

    await connecting;
    const providers = await client.listProviders();
    expect(providers).toHaveLength(2);
    expect(providers[0].providerId).toBe("codex");
    expect(providers[0].authenticated).toBe(true);
    expect(providers[0].models).toEqual(["gpt-5"]);
    expect(providers[0].usageWindows[0].usedPercent).toBe(42);
    expect(providers[1].providerId).toBe("claudeAgent");
    expect(providers[1].installed).toBe(false);
    expect(providers[1].reason).toBe("Nicht installiert");
    expect(providers[1].authenticated).toBeNull();

    client.close();
  });

  test("meldet eine abweichende Protokoll-Version", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const request = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: request?.id,
      exit: {
        _tag: "Success",
        value: {
          environment: {
            environmentId: "local",
            label: "Lokal",
            serverVersion: "9.9.9",
            orchestrationProtocolVersion: 99,
          },
          providers: [],
        },
      },
    });
    await connecting;

    const status = client.checkContract();
    expect(status.contractCompatible).toBe(false);
    expect(status.mismatches.length).toBeGreaterThan(0);
    expect(status.mismatches[0]).toContain("Orchestration-Protokoll");
    client.close();
  });

  test("bestätigt passende Contract-Versionen", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const request = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: request?.id,
      exit: {
        _tag: "Success",
        value: {
          environment: {
            environmentId: "local",
            label: "Lokal",
            serverVersion: "0.1.0",
            orchestrationProtocolVersion: T3_ORCHESTRATION_PROTOCOL_VERSION,
          },
          providers: [],
        },
      },
    });
    await connecting;

    expect(client.checkContract().contractCompatible).toBe(true);
    client.close();
  });

  test("dispatcht ein message.dispatch-Kommando", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const configRequest = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: configRequest?.id,
      exit: { _tag: "Success", value: { providers: [] } },
    });
    await connecting;

    const pending = client.startTurn({
      commandId: "cmd-1",
      threadId: "thread-1",
      messageId: "msg-1",
      text: "Hallo",
    });
    await Bun.sleep(5);
    const dispatch = socket
      .sentMessages()
      .find((m) => m.tag === "orchestration.dispatchCommand");
    expect(dispatch?.payload).toMatchObject({
      type: "message.dispatch",
      threadId: "thread-1",
      text: "Hallo",
    });
    socket.push({
      _tag: "Exit",
      requestId: dispatch?.id,
      exit: { _tag: "Success", value: { ok: true } },
    });
    await expect(pending).resolves.toEqual({ ok: true });
    client.close();
  });

  test("steuert einen Turn mit steer_active", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const configRequest = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: configRequest?.id,
      exit: { _tag: "Success", value: { providers: [] } },
    });
    await connecting;

    const pending = client.steerTurn({
      commandId: "cmd-2",
      threadId: "thread-1",
      messageId: "msg-2",
      text: "anders",
      targetRunId: "run-7",
    });
    await Bun.sleep(5);
    const dispatch = socket
      .sentMessages()
      .find((m) => m.tag === "orchestration.dispatchCommand");
    expect(dispatch?.payload).toMatchObject({
      deliveryIntent: "steer",
      dispatchMode: { type: "steer_active", targetRunId: "run-7" },
    });
    socket.push({
      _tag: "Exit",
      requestId: dispatch?.id,
      exit: { _tag: "Success", value: { ok: true } },
    });
    await pending;
    client.close();
  });

  test("bricht einen Turn ab (run.interrupt)", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const configRequest = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: configRequest?.id,
      exit: { _tag: "Success", value: { providers: [] } },
    });
    await connecting;

    const pending = client.interruptTurn({
      commandId: "cmd-3",
      threadId: "thread-1",
      runId: "run-7",
    });
    await Bun.sleep(5);
    const dispatch = socket
      .sentMessages()
      .find((m) => m.tag === "orchestration.dispatchCommand");
    expect(dispatch?.payload).toMatchObject({
      type: "run.interrupt",
      runId: "run-7",
    });
    socket.push({
      _tag: "Exit",
      requestId: dispatch?.id,
      exit: { _tag: "Success", value: { ok: true } },
    });
    await pending;
    client.close();
  });

  test("liest den Thread-Snapshot", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const configRequest = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: configRequest?.id,
      exit: { _tag: "Success", value: { providers: [] } },
    });
    await connecting;

    const pending = client.getThreadSnapshot({ threadId: "thread-1" });
    await Bun.sleep(5);
    const request = socket
      .sentMessages()
      .find((m) => m.tag === "orchestration.getThreadProjection");
    expect(request?.payload).toEqual({ threadId: "thread-1" });
    socket.push({
      _tag: "Exit",
      requestId: request?.id,
      exit: {
        _tag: "Success",
        value: { thread: { id: "thread-1", title: "Titel" }, runs: [] },
      },
    });
    const snapshot = await pending;
    expect(snapshot.thread?.title).toBe("Titel");
    client.close();
  });

  test("liest die Usage-Zusammenfassung", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const configRequest = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: configRequest?.id,
      exit: { _tag: "Success", value: { providers: [] } },
    });
    await connecting;

    const pending = client.getUsageSummary({
      sinceDay: "2026-10-01",
      untilDay: "2026-10-29",
      timeZone: "Europe/Berlin",
    });
    await Bun.sleep(5);
    const request = socket.sentMessages().find((m) => m.tag === "server.getUsageSummary");
    expect(request?.payload).toMatchObject({
      sinceDay: "2026-10-01",
      untilDay: "2026-10-29",
    });
    socket.push({
      _tag: "Exit",
      requestId: request?.id,
      exit: { _tag: "Success", value: { buckets: [], sources: [] } },
    });
    const summary = await pending;
    expect(summary.buckets).toEqual([]);
    client.close();
  });

  test("antwortet auf eine Runtime-Anfrage", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const configRequest = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: configRequest?.id,
      exit: { _tag: "Success", value: { providers: [] } },
    });
    await connecting;

    const pending = client.respondToRuntimeRequest({
      commandId: "cmd-4",
      threadId: "thread-1",
      requestId: "req-1",
      decision: "accept",
    });
    await Bun.sleep(5);
    const dispatch = socket
      .sentMessages()
      .find((m) => m.tag === "orchestration.dispatchCommand");
    expect(dispatch?.payload).toMatchObject({
      type: "runtime-request.respond",
      requestId: "req-1",
      decision: "accept",
    });
    socket.push({
      _tag: "Exit",
      requestId: dispatch?.id,
      exit: { _tag: "Success", value: { ok: true } },
    });
    await pending;
    client.close();
  });

  test("schickt createdBy/creationSource und dispatchMode mit", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const configRequest = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: configRequest?.id,
      exit: { _tag: "Success", value: { providers: [] } },
    });
    await connecting;

    const pending = client.startTurn({
      commandId: "cmd-x",
      threadId: "thread-1",
      messageId: "msg-1",
      text: "Hallo",
    });
    await Bun.sleep(5);
    const dispatch = socket
      .sentMessages()
      .find((m) => m.tag === "orchestration.dispatchCommand");
    expect(dispatch?.payload).toMatchObject({
      createdBy: "user",
      creationSource: "mcp",
      dispatchMode: { type: "start_immediately" },
    });
    socket.push({
      _tag: "Exit",
      requestId: dispatch?.id,
      exit: { _tag: "Success", value: { sequence: 1 } },
    });
    await pending;
    client.close();
  });

  test("cacht die Usage-Limit-Quellen aus dem Stream-Event", async () => {
    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const configRequest = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: configRequest?.id,
      exit: { _tag: "Success", value: { providers: [] } },
    });
    await connecting;

    const events: unknown[] = [];
    const subscription = client.subscribeServerConfig({ usageLimitSources: true }, {
      onEvent: (event) => events.push(event),
    });
    await Bun.sleep(5);
    const request = socket
      .sentMessages()
      .find((m) => m.tag === "subscribeServerConfig");
    expect(request?.payload).toEqual({ usageLimitSources: true });

    socket.push({
      _tag: "Chunk",
      requestId: request?.id,
      values: [
        { type: "snapshot", version: 1, config: { providers: [] } },
        {
          type: "usageLimitSourcesUpdated",
          version: 1,
          payload: { sources: [{ id: "codex", kind: "provider" }] },
        },
      ],
    });
    await Bun.sleep(5);

    expect(events).toHaveLength(2);
    expect(client.getUsageLimitSources().sources).toEqual([{ id: "codex", kind: "provider" }]);
    subscription.close();
    client.close();
  });

  test("subscribed Thread-Events", async () => {    enableBridge();
    const server = new MockWsServer();
    const client = new T3RpcClient({
      origin: "http://127.0.0.1:3773",
      wsTicket: "ticket",
      webSocketFactory: server.factory,
    });

    const connecting = client.connect();
    const socket = await server.waitForSocket();
    socket.open();
    await Bun.sleep(5);
    const configRequest = socket.sentMessages().find((m) => m._tag === "Request");
    socket.push({
      _tag: "Exit",
      requestId: configRequest?.id,
      exit: { _tag: "Success", value: { providers: [] } },
    });
    await connecting;

    const events: unknown[] = [];
    const subscription = client.subscribeThread({ threadId: "thread-1" }, {
      onEvent: (event) => events.push(event),
    });
    await Bun.sleep(5);
    const request = socket
      .sentMessages()
      .find((m) => m.tag === "orchestration.subscribeThread");
    socket.push({
      _tag: "Chunk",
      requestId: request?.id,
      values: [{ type: "message.updated", sequence: 1 }],
    });
    await Bun.sleep(5);
    expect(events).toEqual([{ type: "message.updated", sequence: 1 }]);
    subscription.close();
    client.close();
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Guards
 * ---------------------------------------------------------------------------------------- */

describe("T3-WS-RPC Guards", () => {
  test("normalisiert eine Provider-Liste defensiv", () => {
    const providers = normalizeProviderList([
      { instanceId: "a", driver: "codex", auth: { status: "authenticated" } },
      { instanceId: "b", driver: "unbekannt" },
      "kein Objekt",
    ]);
    expect(providers).toHaveLength(2);
    expect(providers[0].authenticated).toBe(true);
    expect(providers[0].providerId).toBe("codex");
    expect(providers[1].providerId).toBeNull();
    expect(providers[1].authenticated).toBeNull();
  });

  test("erkennt Client-Fehler am _tag", () => {
    expect(isT3RpcError({ _tag: "T3RpcTimeoutError", message: "x" })).toBe(true);
    expect(isT3RpcError({ message: "x" })).toBe(false);
    expect(isT3RpcError(null)).toBe(false);
  });
});
