/**
 * T3-Bridge — Nachrichten & Threads (A11): Integrationstests
 *
 * Testet alle Kern-Akzeptanzkriterien von A11:
 *  1. Integrationstest gegen Mock-RPC.
 *  2. Zweimal dieselbe clientMessageId → nur ein Turn (Idempotenz).
 *  3. Verlauf aus T3-Snapshot (Quelle T3) über alle Kontext-Generationen hinweg (I5).
 *  4. Statusmodell: sending / waiting / running / answered / failed wie Cloud-Agents.
 *  5. Agent-Arbeitsordner (A07) und Provider/CLI-Wahl.
 *  6. Feature-Flag 'bridge': Deaktivierung blockiert Turns und hält Altzustand ein.
 */

import { describe, expect, it } from "bun:test";
import { createScheduler } from "../scheduler/index.js";
import {
  createThreadMapStore,
  MemoryThreadMapStore,
  type IThreadMapStore,
} from "./store.js";
import { IdempotencyManager } from "./idempotency.js";
import {
  T3ThreadService,
  type IT3RpcThreadClient,
} from "./service.js";
import type { T3ProviderId } from "../contracts.js";
import { fromConnectChatItemStatus, toConnectChatItemStatus } from "./status.js";
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

/**
 * Mock-RPC-Client für kontrollierte Integrationstests.
 */
class MockT3RpcClient implements IT3RpcThreadClient {
  readonly createdThreads: Array<{
    commandId: string;
    threadId: string;
    projectId: string;
    title: string;
    provider: T3ProviderId;
    model: string;
    cwd?: string | null;
  }> = [];

  readonly startedTurns: Array<{
    commandId: string;
    threadId: string;
    messageId: string;
    text: string;
    provider?: T3ProviderId;
    model?: string;
  }> = [];

  readonly ensuredProjects: Array<{
    projectId: string;
    workspaceRoot: string;
  }> = [];

  // Speicher für simulierte Snapshots je Thread
  readonly threadSnapshots = new Map<string, Record<string, unknown>>();

  async ensureProject(input: {
    projectId: string;
    title: string;
    workspaceRoot: string;
  }) {
    this.ensuredProjects.push(input);
    return { projectId: input.projectId, workspaceRoot: input.workspaceRoot };
  }

  async createThread(command: {
    commandId: string;
    threadId: string;
    projectId: string;
    title: string;
    provider: T3ProviderId;
    model: string;
    cwd?: string | null;
  }) {
    this.createdThreads.push(command);
    return { ok: true, threadId: command.threadId };
  }

  async startTurn(command: {
    commandId: string;
    threadId: string;
    messageId: string;
    text: string;
    provider?: T3ProviderId;
    model?: string;
  }) {
    this.startedTurns.push(command);
    return { ok: true, turnId: `turn-${command.messageId}` };
  }

  async getThreadSnapshot(input: { threadId: string }) {
    return this.threadSnapshots.get(input.threadId) ?? {
      thread: { id: input.threadId },
      messages: [],
      turnItems: [],
      tokens: 42,
    };
  }

  setSnapshot(threadId: string, snapshot: Record<string, unknown>) {
    this.threadSnapshots.set(threadId, snapshot);
  }
}

describe("A11: Nachrichten & Threads (Integrationstests)", () => {
  it("erstellt einen neuen Thread und startet einen Turn mit Arbeitsordner und CLI", async () => {
    const mockRpc = new MockT3RpcClient();
    const scheduler = createScheduler({ bypassWhenFlagDisabled: true });
    const store = new MemoryThreadMapStore();

    let workspaceEnsured = false;
    const mockEnsureWorkspace = async (input: { agentId: string; agentName?: string }) => {
      workspaceEnsured = true;
      return makeMockWorkspace(input.agentId, `C:\\TestWorkspaces\\agent-${input.agentId}`);
    };

    const service = new T3ThreadService({
      rpcClient: mockRpc,
      scheduler,
      store,
      ensureWorkspaceFn: mockEnsureWorkspace,
      defaultProvider: "codex",
      defaultModel: "gpt-4o",
      bypassFlagCheckForTests: true,
    });

    const response = await service.sendMessage({
      agentId: "agent-alpha",
      text: "Hallo Stefan, wie kann ich helfen?",
      clientMessageId: "msg-001",
      provider: "codex",
      model: "gpt-4o",
    });

    // 1. Antwort prüfen
    expect(["queued", "running"]).toContain(response.status);
    expect(response.generation).toBe(0);
    expect(response.threadId).toContain("agent-alpha");
    expect(response.turnId).toBe("turn-msg-001");

    // 2. Arbeitsordner sichergestellt?
    expect(workspaceEnsured).toBe(true);

    // 3. Thread in Mock-RPC erstellt?
    expect(mockRpc.createdThreads.length).toBe(1);
    expect(mockRpc.createdThreads[0].provider).toBe("codex");
    expect(mockRpc.createdThreads[0].cwd).toBe("C:\\TestWorkspaces\\agent-agent-alpha");

    // 4. Turn über Scheduler gestartet?
    expect(mockRpc.startedTurns.length).toBe(1);
    expect(mockRpc.startedTurns[0].messageId).toBe("msg-001");
    expect(mockRpc.startedTurns[0].text).toBe("Hallo Stefan, wie kann ich helfen?");

    // 5. Zuordnung in t3_thread_map persistiert?
    const threadMap = await store.getActiveThread("agent-alpha");
    expect(threadMap).not.toBeNull();
    expect(threadMap?.agentId).toBe("agent-alpha");
    expect(threadMap?.provider).toBe("codex");
    expect(threadMap?.generation).toBe(0);
  });

  it("AKZEPTANZKRITERIUM: Zweimal dieselbe clientMessageId -> nur ein Turn", async () => {
    const mockRpc = new MockT3RpcClient();
    const scheduler = createScheduler({ bypassWhenFlagDisabled: true });
    const store = new MemoryThreadMapStore();

    const service = new T3ThreadService({
      rpcClient: mockRpc,
      scheduler,
      store,
      ensureWorkspaceFn: async (input: { agentId: string; agentName?: string }) =>
        makeMockWorkspace(input.agentId, "/tmp"),
      bypassFlagCheckForTests: true,
    });

    // Erster Aufruf
    const res1 = await service.sendMessage({
      agentId: "agent-idempotent",
      text: "Idempotente Nachricht",
      clientMessageId: "same-client-msg-id-123",
    });

    // Zweiter Aufruf mit GENAU derselben clientMessageId
    const res2 = await service.sendMessage({
      agentId: "agent-idempotent",
      text: "Idempotente Nachricht Wiederholung",
      clientMessageId: "same-client-msg-id-123",
    });

    // Beide Antworten müssen sich auf denselben Turn und denselben Thread beziehen
    expect(res1.turnId).toBe(res2.turnId);
    expect(res1.threadId).toBe(res2.threadId);
    expect(res1.generation).toBe(res2.generation);

    // Es darf GENAU EIN Turn über RPC gestartet worden sein!
    expect(mockRpc.startedTurns.length).toBe(1);
    expect(mockRpc.startedTurns[0].messageId).toBe("same-client-msg-id-123");
  });

  it("AKZEPTANZKRITERIUM: Parallele Doppel-Requests mit gleicher clientMessageId -> nur ein Turn", async () => {
    const mockRpc = new MockT3RpcClient();
    const scheduler = createScheduler({ bypassWhenFlagDisabled: true });
    const store = new MemoryThreadMapStore();

    const service = new T3ThreadService({
      rpcClient: mockRpc,
      scheduler,
      store,
      ensureWorkspaceFn: async (input: { agentId: string; agentName?: string }) =>
        makeMockWorkspace(input.agentId, "/tmp"),
      bypassFlagCheckForTests: true,
    });

    // Zwei Requests gleichzeitig abfeuern
    const [resA, resB] = await Promise.all([
      service.sendMessage({
        agentId: "agent-concurrent",
        text: "Gleichzeitiger Request A",
        clientMessageId: "concurrent-msg-456",
      }),
      service.sendMessage({
        agentId: "agent-concurrent",
        text: "Gleichzeitiger Request B",
        clientMessageId: "concurrent-msg-456",
      }),
    ]);

    expect(resA.turnId).toBe(resB.turnId);
    expect(mockRpc.startedTurns.length).toBe(1);
  });

  it("AKZEPTANZKRITERIUM: Statusmodell sending / running / waiting / answered / failed", () => {
    expect(toConnectChatItemStatus("sending")).toBe("queued");
    expect(toConnectChatItemStatus("waiting")).toBe("waiting");
    expect(toConnectChatItemStatus("running")).toBe("running");
    expect(toConnectChatItemStatus("answered")).toBe("done");
    expect(toConnectChatItemStatus("failed")).toBe("error");

    expect(fromConnectChatItemStatus("queued")).toBe("waiting");
    expect(fromConnectChatItemStatus("waiting")).toBe("waiting");
    expect(fromConnectChatItemStatus("running")).toBe("running");
    expect(fromConnectChatItemStatus("done")).toBe("answered");
    expect(fromConnectChatItemStatus("error")).toBe("failed");
    expect(fromConnectChatItemStatus("cancelled")).toBe("failed");
  });

  it("AKZEPTANZKRITERIUM: Verlauf aus T3-Snapshot über alle Kontext-Generationen hinweg (I5)", async () => {
    const mockRpc = new MockT3RpcClient();
    const store = new MemoryThreadMapStore();

    // Generation 0 simulieren
    const threadGen0 = "t3-thread-gen0";
    await store.saveThread({
      agentId: "agent-multi-gen",
      channelId: "c1",
      t3ThreadId: threadGen0,
      generation: 0,
      projectId: "p1",
      cwd: "/cwd",
      provider: "codex",
      model: "gpt-4o",
      createdAt: "2026-10-29T10:00:00.000Z",
      updatedAt: "2026-10-29T10:15:00.000Z",
    });

    mockRpc.setSnapshot(threadGen0, {
      thread: { id: threadGen0 },
      messages: [
        { id: "m1", role: "user", text: "Nachricht in Fenster 1", createdAt: "2026-10-29T10:01:00.000Z" },
        { id: "m2", role: "assistant", text: "Antwort in Fenster 1", createdAt: "2026-10-29T10:02:00.000Z" },
      ],
      turnItems: [
        { kind: "tool", id: "t1", label: "Bash", title: "ls -la" },
      ],
      tokens: 100_000,
    });

    // Kontext-Rotation durchführen (Generation 0 -> Generation 1)
    const threadGen1 = "t3-thread-gen1";
    await store.rotateThread({
      agentId: "agent-multi-gen",
      newThreadId: threadGen1,
      tokensAtSwitch: 100_000,
      summaryText: "Zusammenfassung der ersten 100.000 Tokens",
    });

    mockRpc.setSnapshot(threadGen1, {
      thread: { id: threadGen1 },
      messages: [
        { id: "m3", role: "user", text: "Nachricht in Fenster 2", createdAt: "2026-10-29T10:20:00.000Z" },
        { id: "m4", role: "assistant", text: "Antwort in Fenster 2", createdAt: "2026-10-29T10:21:00.000Z" },
      ],
      turnItems: [],
      tokens: 15_000,
    });

    const service = new T3ThreadService({
      rpcClient: mockRpc,
      store,
      bypassFlagCheckForTests: true,
    });

    // Verlauf abfragen
    const history = await service.getMessageHistory("agent-multi-gen");

    // Prüfen: Verlauf enthält Nachrichten aus BEIDEN Generationen!
    expect(history.messages.length).toBe(4);
    expect(history.messages[0].text).toBe("Nachricht in Fenster 1");
    expect(history.messages[1].text).toBe("Antwort in Fenster 1");
    expect(history.messages[2].text).toBe("Nachricht in Fenster 2");
    expect(history.messages[3].text).toBe("Antwort in Fenster 2");

    // Prüfen: Items enthalten das Trenn-Element 'context_switch' zwischen Gen 0 und Gen 1!
    const contextSwitchItems = history.items.filter((item) => item.kind === "context_switch");
    expect(contextSwitchItems.length).toBe(1);
    const switchItem = contextSwitchItems[0] as any;
    expect(switchItem.tokensAtSwitch).toBe(100_000);
    expect(switchItem.summary).toBe("Zusammenfassung der ersten 100.000 Tokens");
    expect(switchItem.previousThreadId).toBe(threadGen0);
    expect(switchItem.newThreadId).toBe(threadGen1);

    // Aktuelle Generation ist 1
    expect(history.generation).toBe(1);
    expect(history.threadId).toBe(threadGen1);
  });

  it("AKZEPTANZKRITERIUM: Deaktiviertes Flag blockiert Aufrufe sauber", async () => {
    const mockRpc = new MockT3RpcClient();
    const service = new T3ThreadService({
      rpcClient: mockRpc,
      bypassFlagCheckForTests: false, // Flag aktiv prüfen (Standard: bridge = false)
    });

    const sendRes = await service.sendMessage({
      agentId: "agent-blocked",
      text: "Sollte blockiert werden",
      clientMessageId: "msg-blocked-1",
    });

    expect(sendRes.status).toBe("error");
    expect(sendRes.error).toContain("Feature-Flag 'bridge'");

    const historyRes = await service.getMessageHistory("agent-blocked");
    expect(historyRes.messages.length).toBe(0);
  });
});
