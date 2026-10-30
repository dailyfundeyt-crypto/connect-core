/**
 * T3-Bridge / Stream — Testsuite (Lane A12).
 *
 * EIGENTÜMER: A12.
 *
 * Geprüft werden die Abnahmekriterien aus dem Masterplan:
 *  1. Lasttest: 40 aktive Agenten, 1 offener Chat → < 25 Events/s an den Browser.
 *  2. Verbindungsabbruch → Wiederaufnahme ab der letzten Event-Id.
 *  3. Nur sichtbare Chats bekommen Text-Deltas, alle anderen nur Status.
 *  4. Budget 20/s je Chat, Coalescing, Heartbeat 15 s.
 *  5. Routen hinter dem Flag `bridge`; Flag aus → 404.
 *  6. Die A03→A06→Hub-Kette übersetzt echte T3-Domain-Events.
 */

import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import type { AppVariables } from "../../auth/guards.js";
import { createT3StreamRoutes, T3_STREAM_PATHS } from "../routes/stream.js";
import { SlidingWindowBudget } from "./budget.js";
import { T3StreamHub } from "./hub.js";
import { encodeSseFrame } from "./sse.js";
import { T3ThreadSource } from "./source.js";
import type { ThreadStreamClient } from "./source.js";
import type {
  ChatSubscription,
  StreamEnvelope,
  StreamResync,
  StreamStatusSnapshot,
} from "./types.js";
import type { T3ThreadStreamItem } from "../rpc/index.js";

/* ---------------------------------------------------------------------------------------- *
 * Hilfen
 * ---------------------------------------------------------------------------------------- */

function collectChat(
  hub: T3StreamHub,
  agentId: string,
  lastEventId = 0,
): { envelopes: StreamEnvelope[]; resyncs: StreamResync[]; subscription: ChatSubscription } {
  const envelopes: StreamEnvelope[] = [];
  const resyncs: StreamResync[] = [];
  const subscription = hub.subscribeChat(agentId, {
    lastEventId,
    sink: {
      onEnvelope: (envelope) => envelopes.push(envelope),
      onResync: (resync) => resyncs.push(resync),
    },
  });
  subscription.activate();
  return { envelopes, resyncs, subscription };
}

function textDelta(itemId: string, delta: string) {
  return { type: "text_delta" as const, itemId, delta };
}

function toolEvent(id: string) {
  return {
    type: "tool" as const,
    item: {
      kind: "tool" as const,
      id,
      label: "Bash",
      title: `Befehl ${id}`,
      status: "done" as const,
    },
  };
}

const AGENTS = Array.from({ length: 40 }, (_, index) => `agent-${String(index).padStart(2, "0")}`);

async function settle(ms = 80): Promise<void> {
  await Bun.sleep(ms);
}

/* ---------------------------------------------------------------------------------------- *
 * 1. Budget und Lasttest
 * ---------------------------------------------------------------------------------------- */

describe("A12: Budget", () => {
  it("erlaubt in einem gleitenden 1-s-Fenster nie mehr als das Limit", () => {
    const budget = new SlidingWindowBudget(20);
    for (let index = 0; index < 20; index += 1) budget.record(1_000);
    expect(budget.canEmit(1_000)).toBe(false);
    expect(budget.nextAllowedAt(1_000)).toBe(2_000);
    expect(budget.canEmit(2_000)).toBe(true);
  });

  it("verteilt Sendungen gleichmäßig (kein 20er-Burst)", () => {
    const budget = new SlidingWindowBudget(20);
    expect(budget.canEmit(0)).toBe(true);
    budget.record(0);
    expect(budget.canEmit(1)).toBe(false);
    expect(budget.nextAllowedAt(1)).toBe(51);
    expect(budget.canEmit(51)).toBe(true);
  });
});

describe("A12: Lasttest 40 Agenten", () => {
  it("hält den Browser bei 40 arbeitenden Agenten unter 25 Events/s", async () => {
    const hub = new T3StreamHub({
      config: { coalesceMs: 10, unseenGraceMs: 0, heartbeatMs: 5_000 },
    });

    try {
      const chat = collectChat(hub, "agent-00");
      const snapshots: StreamStatusSnapshot[] = [];
      const statusSub = hub.subscribeStatus({ onSnapshot: (snapshot) => snapshots.push(snapshot) });

      const startedAt = Date.now();
      const ticks = 30;

      for (let tick = 0; tick < ticks; tick += 1) {
        // Sichtbarer Chat: deutlich mehr Text, als das Budget erlaubt.
        for (let delta = 0; delta < 20; delta += 1) {
          hub.publish("agent-00", textDelta("msg-visible", "x"));
        }
        hub.publish("agent-00", toolEvent(`tool-${tick}`));

        // 39 unsichtbare Agenten arbeiten ebenfalls (Text, Tool, Status).
        for (const agentId of AGENTS.slice(1)) {
          hub.publish(agentId, textDelta("msg-hidden", `${agentId}:`));
          hub.publish(agentId, toolEvent(`${agentId}-tool-${tick}`));
          hub.reportStatus(agentId, tick % 2 === 0 ? "running" : "queued", {
            queuePosition: tick % 2 === 0 ? null : 3,
            provider: "codex",
          });
        }

        await Bun.sleep(50);
      }

      const elapsedSeconds = (Date.now() - startedAt) / 1_000;
      const chatFrames = chat.envelopes.length;
      const statusFrames = snapshots.length;
      const totalRate = (chatFrames + statusFrames) / elapsedSeconds;

      expect(totalRate).toBeLessThan(25);
      expect(chatFrames / elapsedSeconds).toBeLessThanOrEqual(21);
      expect(statusFrames / elapsedSeconds).toBeLessThanOrEqual(4);

      // 39 unsichtbare Agenten haben keinen einzigen Chat-Frame erzeugt.
      expect(hub.chatStats("agent-39")?.emitted ?? 0).toBe(0);
      expect(hub.statusStats().trackedAgents).toBe(40);
      expect(chat.envelopes.every((envelope) => envelope.agentId === "agent-00")).toBe(true);

      statusSub.close();
    } finally {
      hub.dispose();
    }
  }, 10_000);
});

/* ---------------------------------------------------------------------------------------- *
 * 2. Coalescing
 * ---------------------------------------------------------------------------------------- */

describe("A12: Coalescing", () => {
  it("fasst schnelle Text-Deltas desselben Items zu einem Event zusammen", async () => {
    const hub = new T3StreamHub({ config: { coalesceMs: 30, unseenGraceMs: 0 } });
    try {
      const chat = collectChat(hub, "agent-c");
      for (const part of ["Hal", "lo", " ", "Welt"]) {
        hub.publish("agent-c", textDelta("msg-1", part));
      }
      await settle(90);

      const textFrames = chat.envelopes.filter((envelope) => envelope.event.type === "text_delta");
      expect(textFrames.length).toBe(1);
      const event = textFrames[0]!.event;
      expect(event.type).toBe("text_delta");
      if (event.type === "text_delta") {
        expect(event.itemId).toBe("msg-1");
        expect(event.delta).toBe("Hallo Welt");
      }
      expect(hub.chatStats("agent-c")?.coalesced).toBe(4);
    } finally {
      hub.dispose();
    }
  });

  it("liefert Tool-Updates mit derselben Item-Id als Ersatz-Event", async () => {
    const hub = new T3StreamHub({ config: { coalesceMs: 5, unseenGraceMs: 0 } });
    try {
      const chat = collectChat(hub, "agent-t");
      hub.publish("agent-t", {
        type: "tool",
        item: { kind: "tool", id: "t1", label: "Bash", title: "start", status: "running" },
      });
      hub.publish("agent-t", {
        type: "tool",
        item: { kind: "tool", id: "t1", label: "Bash", title: "fertig", status: "done" },
      });
      // Das Budget verteilt die Sendungen (50 ms Abstand); das zweite Update
      // wartet in der Warteschlange und ersetzt dort den ersten Eintrag.
      await settle(120);

      // Bereits gesendete Events werden nicht rückwirkend geändert; A22 ersetzt
      // Zeilen über die stabile Item-Id `t1`.
      expect(chat.envelopes.length).toBe(2);
      const frame = chat.envelopes[1]!.event;
      expect(frame.type).toBe("tool");
      if (frame.type === "tool") {
        expect(frame.item.id).toBe("t1");
        expect(frame.item.status).toBe("done");
        expect(frame.item.title).toBe("fertig");
      }
    } finally {
      hub.dispose();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 3. Sichtbarkeit
 * ---------------------------------------------------------------------------------------- */

describe("A12: Sichtbarkeit", () => {
  it("sendet Text nur an abonnierte Chats, Status aber immer", async () => {
    const hub = new T3StreamHub({
      config: { coalesceMs: 5, unseenGraceMs: 20, statusEventsPerSecond: 20 },
    });
    try {
      const snapshots: StreamStatusSnapshot[] = [];
      const statusSub = hub.subscribeStatus({ onSnapshot: (snapshot) => snapshots.push(snapshot) });

      // Vor dem Abonnement: kein Chat-Frame, aber Status.
      hub.publish("agent-v", textDelta("m", "vorher"));
      await settle(20);
      expect(hub.isVisible("agent-v")).toBe(false);

      const chat = collectChat(hub, "agent-v");
      hub.publish("agent-v", textDelta("m", "sichtbar"));
      await settle(40);
      expect(chat.envelopes.filter((entry) => entry.event.type === "text_delta").length).toBe(1);

      // Verbindung weg → nach der Nachsicht keine Text-Events mehr.
      chat.subscription.close();
      await settle(40);
      expect(hub.isVisible("agent-v")).toBe(false);

      const before = chat.envelopes.length;
      const droppedBefore = hub.chatStats("agent-v")?.dropped ?? 0;

      hub.publish("agent-v", textDelta("m", "unsichtbar"));
      hub.reportStatus("agent-v", "queued", { queuePosition: 2 });
      await settle(80);
      expect(chat.envelopes.length).toBe(before);
      expect(hub.chatStats("agent-v")?.dropped ?? 0).toBeGreaterThan(droppedBefore);

      const last = snapshots[snapshots.length - 1]!;
      const entry = last.agents.find((agent) => agent.agentId === "agent-v");
      expect(entry?.state).toBe("queued");
      expect(entry?.queuePosition).toBe(2);

      statusSub.close();
    } finally {
      hub.dispose();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 4. Wiederaufnahme
 * ---------------------------------------------------------------------------------------- */

describe("A12: Wiederaufnahme ab Last-Event-ID", () => {
  it("liefert nach dem Abbruch genau die fehlenden Events in Reihenfolge", async () => {
    // Hohes Budget, damit der Test die Wiederaufnahme prüft und nicht das Tempo.
    const hub = new T3StreamHub({
      config: { coalesceMs: 1, unseenGraceMs: 1_000, chatEventsPerSecond: 1_000 },
    });
    try {
      const first = collectChat(hub, "agent-r");
      for (let index = 1; index <= 4; index += 1) {
        hub.publish("agent-r", toolEvent(`t${index}`));
      }
      await settle(20);
      expect(first.envelopes.map((envelope) => envelope.id)).toEqual([1, 2, 3, 4]);
      const lastSeen = first.envelopes[3]!.id;

      first.subscription.close();

      // Während der Nachsicht laufen weitere Events ein (Reload-Fall).
      hub.publish("agent-r", toolEvent("t5"));
      hub.publish("agent-r", toolEvent("t6"));
      await settle(20);

      const envelopes: StreamEnvelope[] = [];
      const resumed = hub.subscribeChat("agent-r", {
        lastEventId: lastSeen,
        sink: { onEnvelope: (envelope) => envelopes.push(envelope) },
      });
      expect(resumed.resync).toBeNull();
      expect(resumed.replay.map((envelope) => envelope.id)).toEqual([5, 6]);

      for (const envelope of resumed.replay) envelopes.push(envelope);
      resumed.activate();

      hub.publish("agent-r", toolEvent("t7"));
      expect(envelopes.map((envelope) => envelope.id)).toEqual([5, 6, 7]);
      expect(envelopes.some((envelope) => envelope.id <= lastSeen)).toBe(false);
      resumed.close();
    } finally {
      hub.dispose();
    }
  });

  it("verlangt einen Resync, wenn der Puffer die Lücke nicht mehr deckt", async () => {
    const hub = new T3StreamHub({
      config: {
        coalesceMs: 1,
        logSize: 2,
        unseenGraceMs: 1_000,
        chatEventsPerSecond: 1_000,
      },
    });
    try {
      const first = collectChat(hub, "agent-g");
      for (let index = 1; index <= 5; index += 1) {
        hub.publish("agent-g", toolEvent(`g${index}`));
      }
      await settle(20);
      expect(first.envelopes.length).toBe(5);
      first.subscription.close();

      const gap = hub.subscribeChat("agent-g", {
        lastEventId: 1,
        sink: { onEnvelope: () => {} },
      });
      expect(gap.resync?.reason).toBe("log_gap");
      expect(gap.replay.length).toBe(0);
      gap.close();

      const unknown = hub.subscribeChat("agent-g", {
        lastEventId: 999,
        sink: { onEnvelope: () => {} },
      });
      expect(unknown.resync?.reason).toBe("unknown_event_id");
      unknown.close();

      const covered = hub.subscribeChat("agent-g", {
        lastEventId: 4,
        sink: { onEnvelope: () => {} },
      });
      expect(covered.resync).toBeNull();
      expect(covered.replay.map((envelope) => envelope.id)).toEqual([5]);
      covered.close();
    } finally {
      hub.dispose();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 5. Status-Stream enthält keinen Chat-Inhalt
 * ---------------------------------------------------------------------------------------- */

describe("A12: Status-Stream", () => {
  it("überträgt ausschließlich Zustände, keine Prompts oder Ausgaben", async () => {
    const hub = new T3StreamHub({ config: { statusEventsPerSecond: 20, unseenGraceMs: 0 } });
    try {
      const snapshots: StreamStatusSnapshot[] = [];
      const statusSub = hub.subscribeStatus({ onSnapshot: (snapshot) => snapshots.push(snapshot) });

      for (const agentId of AGENTS) {
        hub.reportStatus(agentId, "running", { provider: "claudeAgent" });
        hub.publish(agentId, textDelta("secret-message", "STRENG GEHEIMER PROMPT"));
        hub.publish(agentId, {
          type: "tool",
          item: {
            kind: "tool",
            id: "secret-tool",
            label: "Bash",
            title: "cat /etc/passwd",
            status: "done",
            output: "root:x:0:0",
          },
        });
      }
      await settle(120);

      const serialized = JSON.stringify(snapshots);
      expect(serialized).not.toContain("STRENG GEHEIMER PROMPT");
      expect(serialized).not.toContain("text_delta");
      expect(serialized).not.toContain("secret-tool");
      expect(serialized).not.toContain("/etc/passwd");

      const last = snapshots[snapshots.length - 1]!;
      expect(last.agents.length).toBe(40);
      expect(last.agents.every((agent) => agent.state === "running")).toBe(true);
      statusSub.close();
    } finally {
      hub.dispose();
    }
  });

  it("leitet den Zustand aus Freigaben und turn_end ab", async () => {
    const hub = new T3StreamHub({ config: { statusEventsPerSecond: 20, unseenGraceMs: 0 } });
    try {
      const snapshots: StreamStatusSnapshot[] = [];
      const statusSub = hub.subscribeStatus({ onSnapshot: (snapshot) => snapshots.push(snapshot) });

      hub.publish("agent-s", {
        type: "approval",
        item: {
          kind: "approval",
          id: "a1",
          requestId: "r1",
          requestKind: "command",
          title: "Befehl",
          prompt: "npm test",
          options: [],
          status: "waiting",
          blocking: true,
        },
      });
      await settle(40);
      expect(snapshots[snapshots.length - 1]!.agents[0]!.state).toBe("waiting_approval");

      hub.publish("agent-s", {
        type: "turn_end",
        item: { kind: "turn_end", id: "run1", status: "completed" },
      });
      await settle(40);
      expect(snapshots[snapshots.length - 1]!.agents[0]!.state).toBe("idle");
      statusSub.close();
    } finally {
      hub.dispose();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 6. A03 → A06 → Hub
 * ---------------------------------------------------------------------------------------- */

describe("A12: T3-RPC-Quelle", () => {
  it("übersetzt echte T3-Domain-Events und abonniert nur sichtbare Chats", async () => {
    const hub = new T3StreamHub({ config: { coalesceMs: 5, unseenGraceMs: 0 } });

    type Capture = {
      input: { threadId: string };
      listeners: {
        onEvent: (event: T3ThreadStreamItem) => void;
        onEnd?: (error: unknown) => void;
      };
      closed: boolean;
    };
    const captured: { value: Capture | null } = { value: null };

    const client: ThreadStreamClient = {
      subscribeThread: (input, listeners) => {
        captured.value = { input, listeners, closed: false };
        return {
          closed: false,
          close: () => {
            if (captured.value) captured.value.closed = true;
          },
        };
      },
    };

    const source = new T3ThreadSource({
      client,
      directory: {
        resolveThread: async (agentId) =>
          agentId === "agent-src" ? { agentId, threadId: "thread-1" } : null,
      },
    });
    hub.attachSource(source);

    try {
      const chat = collectChat(hub, "agent-src");
      await Bun.sleep(0);

      expect(captured.value).not.toBeNull();
      expect(captured.value!.input.threadId).toBe("thread-1");

      captured.value!.listeners.onEvent({
        kind: "event",
        sequence: 1,
        event: {
          id: "evt-1",
          threadId: "thread-1",
          type: "message.updated",
          occurredAt: new Date().toISOString(),
          payload: { id: "msg-1", role: "assistant", text: "Hallo", streaming: true },
        },
      });
      await settle(30);

      const textFrame = chat.envelopes.find((envelope) => envelope.event.type === "text_delta");
      expect(textFrame).toBeDefined();
      if (textFrame && textFrame.event.type === "text_delta") {
        expect(textFrame.event.delta).toBe("Hallo");
      }

      captured.value!.listeners.onEvent({
        kind: "event",
        sequence: 2,
        event: {
          id: "evt-2",
          threadId: "thread-1",
          type: "runtime-request.updated",
          occurredAt: new Date().toISOString(),
          payload: { id: "req-1", kind: "command", status: "pending" },
        },
      });
      await settle(20);
      expect(hub.statusStats().trackedAgents).toBe(1);
      expect(hub.statusOf("agent-src")?.state).toBe("waiting_approval");

      // Letzter Abonnent weg → Nachsicht 0 → Upstream-Abo wird geschlossen.
      chat.subscription.close();
      await Bun.sleep(0);
      expect(captured.value!.closed).toBe(true);
      expect(source.watchedAgents()).toEqual([]);
    } finally {
      hub.dispose();
    }
  });

  it("meldet fehlende Thread-Zuordnung als Fehler, ohne zu raten", async () => {
    const hub = new T3StreamHub({ config: { unseenGraceMs: 0 } });
    const source = new T3ThreadSource({
      client: {
        subscribeThread: () => {
          throw new Error("darf nicht aufgerufen werden");
        },
      },
      directory: { resolveThread: async () => null },
    });
    hub.attachSource(source);
    try {
      const sub = hub.subscribeChat("agent-x", { sink: { onEnvelope: () => {} } });
      sub.activate();
      await Bun.sleep(10);
      expect(source.watchedAgents()).toEqual([]);
      expect(hub.statusOf("agent-x")?.state).toBe("error");
      expect(hub.statusOf("agent-x")?.detail).toContain("Kein T3-Thread");
      sub.close();
    } finally {
      hub.dispose();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 7. SSE-Kodierung und Routen
 * ---------------------------------------------------------------------------------------- */

describe("A12: SSE", () => {
  it("kodiert id, retry, event und data korrekt", () => {
    const frame = encodeSseFrame({
      id: 7,
      retry: 2_000,
      event: "chat",
      data: { id: 7, agentId: "a", event: { type: "text_delta", itemId: "m", delta: "x" } },
    });
    expect(frame.startsWith("id: 7\nretry: 2000\nevent: chat\ndata: ")).toBe(true);
    expect(frame.endsWith("\n\n")).toBe(true);
  });

  it("sendet Heartbeats (Standard 15 s, im Test 20 ms)", async () => {
    const hub = new T3StreamHub({ config: { heartbeatMs: 20, unseenGraceMs: 0 } });
    const app = new Hono<{ Variables: AppVariables }>();
    app.route("/api", createT3StreamRoutes({ hub }));

    const flags = process.env.CONNECT_FLAGS_T3;
    const dev = process.env.CONNECT_DEV_NO_AUTH;
    process.env.CONNECT_FLAGS_T3 = "bridge";
    process.env.CONNECT_DEV_NO_AUTH = "true";

    try {
      const path = `/api${T3_STREAM_PATHS.chat.replace(":agentId", "agent-hb")}`;
      const response = await app.request(path);
      const text = await readUntil(response, "event: keepalive", 4);
      expect(text).toContain(": hb ");
      expect(text).toContain("event: keepalive");
      expect(text).toContain('"type":"keepalive"');
    } finally {
      restoreEnv("CONNECT_FLAGS_T3", flags);
      restoreEnv("CONNECT_DEV_NO_AUTH", dev);
      hub.dispose();
    }
  });

  it("liefert Chat- und Status-Stream als text/event-stream", async () => {
    const hub = new T3StreamHub({ config: { heartbeatMs: 1_000, unseenGraceMs: 0 } });
    const app = new Hono<{ Variables: AppVariables }>();
    app.route("/api", createT3StreamRoutes({ hub }));

    const flags = process.env.CONNECT_FLAGS_T3;
    const dev = process.env.CONNECT_DEV_NO_AUTH;
    process.env.CONNECT_FLAGS_T3 = "bridge";
    process.env.CONNECT_DEV_NO_AUTH = "true";

    try {
      const statusResponse = await app.request(`/api${T3_STREAM_PATHS.status}`);
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.headers.get("content-type")).toContain("text/event-stream");
      const statusText = await readUntil(statusResponse, "event: status", 4);
      expect(statusText).toContain("event: ready");
      expect(statusText).toContain('"stream":"status"');
      expect(statusText).toContain("event: status");

      const chatPath = `/api${T3_STREAM_PATHS.chat.replace(":agentId", "agent-route")}`;
      const chatResponse = await app.request(chatPath, {
        headers: { "last-event-id": "0" },
      });
      expect(chatResponse.status).toBe(200);
      const chatText = await readFirstChunk(chatResponse);
      expect(chatText).toContain("event: ready");
      expect(chatText).toContain('"stream":"chat"');
      expect(chatText).toContain('"agentId":"agent-route"');

      // Alias-Pfad des Auftrags (`/api/t3/agents/:agentId/stream`).
      const aliasResponse = await app.request("/api/t3/agents/agent-route/stream");
      expect(aliasResponse.status).toBe(200);
      await readFirstChunk(aliasResponse);

      const badResponse = await app.request(
        `/api${T3_STREAM_PATHS.chat.replace(":agentId", encodeURIComponent("agent id"))}`,
      );
      expect(badResponse.status).toBe(400);
    } finally {
      restoreEnv("CONNECT_FLAGS_T3", flags);
      restoreEnv("CONNECT_DEV_NO_AUTH", dev);
      hub.dispose();
    }
  });

  it("ist bei ausgeschaltetem Flag und ohne Anmeldung zu", async () => {
    const hub = new T3StreamHub();
    const app = new Hono<{ Variables: AppVariables }>();
    app.route("/api", createT3StreamRoutes({ hub }));

    const flags = process.env.CONNECT_FLAGS_T3;
    const dev = process.env.CONNECT_DEV_NO_AUTH;
    const single = process.env.CONNECT_SINGLE_USER;

    try {
      process.env.CONNECT_FLAGS_T3 = "no-bridge";
      delete process.env.CONNECT_DEV_NO_AUTH;
      delete process.env.CONNECT_SINGLE_USER;
      const off = await app.request(`/api${T3_STREAM_PATHS.status}`);
      expect(off.status).toBe(404);

      process.env.CONNECT_FLAGS_T3 = "bridge";
      const unauthorized = await app.request(`/api${T3_STREAM_PATHS.status}`);
      expect(unauthorized.status).toBe(401);
    } finally {
      restoreEnv("CONNECT_FLAGS_T3", flags);
      restoreEnv("CONNECT_DEV_NO_AUTH", dev);
      restoreEnv("CONNECT_SINGLE_USER", single);
      hub.dispose();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * Hilfsfunktionen
 * ---------------------------------------------------------------------------------------- */

async function readFirstChunk(response: Response): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  try {
    const { value } = await reader.read();
    return value ? new TextDecoder().decode(value) : "";
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Liest Chunks, bis das erwartete Frame da ist (ready und Snapshot sind getrennt). */
async function readUntil(response: Response, marker: string, maxChunks: number): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (let index = 0; index < maxChunks; index += 1) {
      const { value, done } = await reader.read();
      if (done) break;
      text += value ? decoder.decode(value) : "";
      if (text.includes(marker)) break;
    }
    return text;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}
