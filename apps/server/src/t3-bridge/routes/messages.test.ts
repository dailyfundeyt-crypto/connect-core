/**
 * T3-Bridge — Nachrichten & Threads: HTTP-Routen-Tests (A11)
 *
 * Testet:
 *  - POST /api/t3/agents/:agentId/messages (Turn starten, 202 Accepted)
 *  - Zweimal dieselbe clientMessageId -> idempotente 202-Antwort ohne doppelten Turn
 *  - GET  /api/t3/agents/:agentId/messages (Verlauf über Generationen)
 *  - GET  /api/t3/agents/:agentId/thread (Snapshot)
 *  - Deaktiviertes Flag liefert 503
 *  - Fehlerhafte Payloads liefern 400
 */

import { describe, expect, it } from "bun:test";
import { createScheduler } from "../scheduler/index.js";
import { MemoryThreadMapStore } from "../threads/store.js";
import { T3ThreadService } from "../threads/service.js";
import { createT3MessagesRoutes } from "./messages.js";
import type { T3ProviderId } from "../contracts.js";
import type { WorkspaceOutcome } from "../workspaces/index.js";

function makeMockWorkspace(agentId: string, path: string): WorkspaceOutcome {
  return {
    ok: true,
    enabled: true,
    created: false,
    workspace: {
      agentId,
      agentName: `Agent ${agentId}`,
      slug: `agent-${agentId}`,
      path,
      kind: "default",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    },
  };
}

class MockRpcForRoutes {
  turnCount = 0;
  async ensureProject() {
    return { projectId: "p", workspaceRoot: "/tmp" };
  }
  async createThread() {
    return { ok: true };
  }
  async startTurn() {
    this.turnCount++;
    return { ok: true };
  }
  async getThreadSnapshot(input: { threadId: string }) {
    return {
      thread: { id: input.threadId },
      messages: [
        { id: "m-snap-1", role: "user", text: "Hallo Snapshot", createdAt: new Date().toISOString() },
        { id: "m-snap-2", role: "assistant", text: "Antwort Snapshot", createdAt: new Date().toISOString() },
      ],
      turnItems: [],
      tokens: 1200,
    };
  }
}

describe("A11: Nachrichten & Threads HTTP-Routen (/api/t3/agents/:agentId/messages)", () => {
  it("POST liefert 202 Accepted und startet Turn", async () => {
    const mockRpc = new MockRpcForRoutes();
    const service = new T3ThreadService({
      rpcClient: mockRpc,
      scheduler: createScheduler({ bypassWhenFlagDisabled: true }),
      store: new MemoryThreadMapStore(),
      ensureWorkspaceFn: async (input: { agentId: string; agentName?: string }) =>
        makeMockWorkspace(input.agentId, "/tmp"),
      bypassFlagCheckForTests: true,
    });

    const app = createT3MessagesRoutes({ service });

    const res = await app.request("/agents/agent-42/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Guten Tag!",
        clientMessageId: "req-msg-001",
        provider: "codex",
      }),
    });

    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.turnId).toBe("turn-req-msg-001");
    expect(["queued", "running"]).toContain(body.status);
    expect(mockRpc.turnCount).toBe(1);
  });

  it("Zweimal dieselbe clientMessageId über HTTP -> nur ein Turn (Idempotenz)", async () => {
    const mockRpc = new MockRpcForRoutes();
    const service = new T3ThreadService({
      rpcClient: mockRpc,
      scheduler: createScheduler({ bypassWhenFlagDisabled: true }),
      store: new MemoryThreadMapStore(),
      ensureWorkspaceFn: async (input: { agentId: string; agentName?: string }) =>
        makeMockWorkspace(input.agentId, "/tmp"),
      bypassFlagCheckForTests: true,
    });

    const app = createT3MessagesRoutes({ service });

    const payload = JSON.stringify({
      text: "Idempotenter Text",
      clientMessageId: "dedup-msg-777",
    });

    // 1. Request
    const res1 = await app.request("/agents/agent-42/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    expect(res1.status).toBe(202);

    // 2. Request mit identischer clientMessageId
    const res2 = await app.request("/agents/agent-42/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    expect(res2.status).toBe(202);

    const body1 = (await res1.json()) as any;
    const body2 = (await res2.json()) as any;

    expect(body1.turnId).toBe(body2.turnId);
    expect(body1.threadId).toBe(body2.threadId);

    // Genau ein Turn über RPC
    expect(mockRpc.turnCount).toBe(1);
  });

  it("GET /agents/:agentId/messages liefert 200 mit Verlauf aus T3-Snapshot", async () => {
    const mockRpc = new MockRpcForRoutes();
    const store = new MemoryThreadMapStore();
    await store.saveThread({
      agentId: "agent-snap",
      channelId: null,
      t3ThreadId: "thread-snap-99",
      generation: 0,
      projectId: "p",
      cwd: "/tmp",
      provider: "codex",
      model: "gpt-4o",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const service = new T3ThreadService({
      rpcClient: mockRpc,
      store,
      bypassFlagCheckForTests: true,
    });

    const app = createT3MessagesRoutes({ service });

    const res = await app.request("/agents/agent-snap/messages");
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.messages.length).toBe(2);
    expect(data.messages[0].text).toBe("Hallo Snapshot");
    expect(data.messages[1].text).toBe("Antwort Snapshot");
    expect(data.tokens).toBe(1200);
  });

  it("GET /agents/:agentId/thread liefert 200 mit Snapshot-Struktur", async () => {
    const mockRpc = new MockRpcForRoutes();
    const store = new MemoryThreadMapStore();
    await store.saveThread({
      agentId: "agent-thread",
      channelId: null,
      t3ThreadId: "thread-100",
      generation: 0,
      projectId: "p",
      cwd: "/tmp",
      provider: "codex",
      model: "gpt-4o",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const service = new T3ThreadService({
      rpcClient: mockRpc,
      store,
      bypassFlagCheckForTests: true,
    });

    const app = createT3MessagesRoutes({ service });

    const res = await app.request("/agents/agent-thread/thread");
    expect(res.status).toBe(200);

    const snapshot = (await res.json()) as any;
    expect(snapshot.threadId).toBe("thread-100");
    expect(snapshot.generation).toBe(0);
    expect(snapshot.provider).toBe("codex");
    expect(snapshot.items.length).toBeGreaterThan(0);
  });

  it("POST ohne clientMessageId oder Text liefert 400 Bad Request", async () => {
    const mockRpc = new MockRpcForRoutes();
    const service = new T3ThreadService({
      rpcClient: mockRpc,
      bypassFlagCheckForTests: true,
    });

    const app = createT3MessagesRoutes({ service });

    // clientMessageId fehlt
    const resNoId = await app.request("/agents/agent-42/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hallo" }),
    });
    expect(resNoId.status).toBe(400);

    // Text fehlt
    const resNoText = await app.request("/agents/agent-42/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientMessageId: "abc" }),
    });
    expect(resNoText.status).toBe(400);
  });

  it("Deaktiviertes Feature-Flag liefert 503", async () => {
    const mockRpc = new MockRpcForRoutes();
    const service = new T3ThreadService({
      rpcClient: mockRpc,
      bypassFlagCheckForTests: false, // Flag prüft getT3Flag("bridge") -> false
    });

    const app = createT3MessagesRoutes({ service });

    const res = await app.request("/agents/agent-42/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hallo", clientMessageId: "c1" }),
    });
    expect(res.status).toBe(503);
  });
});
