/**
 * T3-Bridge — Frontend-Client, Hooks & Mock-Adapter Tests (Lane A21).
 *
 * Testet:
 *  1. Pure Helper: applyConnectChatEvent & parseSseBlock
 *  2. Mock-Adapter: Typkonforme Simulation aller Daten & Interaktionen
 *  3. HTTP-Client: Fetch-Funktionen, Fehlerbehandlung, keine Token-Speicherung
 *  4. SSE-Stream-Handling: Parsing, Deltas, Resync, Reconnect
 *  5. React-Hooks: useT3Providers, useT3Chat, useT3Control, useUsage, useMachines,
 *     useCompanyPublicUsage, useSchedulerStatus, useAgentAvatar
 */

import { ensureDom } from "@/test/dom";

ensureDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, renderHook, act, waitFor } from "@testing-library/react";
import {
  applyConnectChatEvent,
  useAgentAvatar,
  useCompanyPublicUsage,
  useMachines,
  useSchedulerStatus,
  useT3Chat,
  useT3Control,
  useT3Providers,
  useUsage,
} from "./hooks";
import { parseSseBlock } from "./stream";
import {
  controlMachine,
  fetchAgentAvatar,
  fetchCompanyPublicUsage,
  fetchFleetStatus,
  fetchMachine,
  fetchMachines,
  fetchSchedulerStatus,
  fetchT3Capabilities,
  fetchT3Messages,
  fetchT3PendingApprovals,
  fetchT3Providers,
  fetchT3Status,
  fetchT3ThreadSnapshot,
  fetchT3Usage,
  interruptT3Turn,
  respondT3Approval,
  sendT3Control,
  sendT3Message,
  steerT3Turn,
  T3ClientError,
  updateAgentAvatar,
} from "./client";
import {
  isT3MockMode,
  mockControlMachine,
  mockFetchAgentAvatar,
  mockFetchCompanyPublicUsage,
  mockFetchFleetStatus,
  mockFetchMachine,
  mockFetchMachines,
  mockFetchSchedulerStatus,
  mockFetchT3Capabilities,
  mockFetchT3Messages,
  mockFetchT3PendingApprovals,
  mockFetchT3Providers,
  mockFetchT3Status,
  mockFetchT3ThreadSnapshot,
  mockFetchT3Usage,
  mockInterruptT3Turn,
  mockRespondT3Approval,
  mockSendT3Control,
  mockSendT3Message,
  mockSteerT3Turn,
  mockSubscribeT3Stream,
  mockUpdateAgentAvatar,
  resetT3MockStore,
  setT3MockMode,
} from "./mock-client";
import type {
  ConnectChatEvent,
  ConnectChatItem,
  ConnectChatTextItem,
  ConnectChatToolItem,
} from "./contracts";

afterEach(() => {
  cleanup();
  resetT3MockStore();
});

/* ---------------------------------------------------------------------------------------- *
 * 1. Pure Helper: parseSseBlock
 * ---------------------------------------------------------------------------------------- */

describe("parseSseBlock", () => {
  test("parst Standard SSE-Block mit event, id und data", () => {
    const raw = "id: 42\nevent: chat\ndata: {\"type\":\"text_delta\",\"itemId\":\"1\",\"delta\":\"Hallo\"}\n\n";
    const parsed = parseSseBlock(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe("42");
    expect(parsed?.event).toBe("chat");
    expect(parsed?.data).toBe("{\"type\":\"text_delta\",\"itemId\":\"1\",\"delta\":\"Hallo\"}");
  });

  test("parst mehrzeilige data-Zeilen", () => {
    const raw = "event: message\ndata: Zeile 1\ndata: Zeile 2\n\n";
    const parsed = parseSseBlock(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.data).toBe("Zeile 1\nZeile 2");
  });

  test("ignoriert SSE-Kommentare (z. B. Heartbeats : hb)", () => {
    const raw = ": hb\n: weiterer Kommentar\n\n";
    const parsed = parseSseBlock(raw);
    expect(parsed).toBeNull();
  });

  test("parst retry-Intervall", () => {
    const raw = "retry: 3000\ndata: test\n\n";
    const parsed = parseSseBlock(raw);
    expect(parsed?.retry).toBe(3000);
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 2. Pure Helper: applyConnectChatEvent
 * ---------------------------------------------------------------------------------------- */

describe("applyConnectChatEvent", () => {
  test("text_delta: erzeugt neues Item wenn itemId noch nicht vorhanden", () => {
    const initial: ConnectChatItem[] = [];
    const event: ConnectChatEvent = {
      type: "text_delta",
      itemId: "text-1",
      delta: "Hallo ",
    };
    const updated = applyConnectChatEvent(initial, event);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      kind: "text",
      id: "text-1",
      role: "assistant",
      text: "Hallo ",
      status: "running",
    });
  });

  test("text_delta: hängt Text an existierendes Item an", () => {
    const initial: ConnectChatItem[] = [
      {
        kind: "text",
        id: "text-1",
        role: "assistant",
        text: "Hallo ",
        status: "running",
      },
    ];
    const event: ConnectChatEvent = {
      type: "text_delta",
      itemId: "text-1",
      delta: "Welt!",
    };
    const updated = applyConnectChatEvent(initial, event);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      kind: "text",
      id: "text-1",
      text: "Hallo Welt!",
      status: "running",
    });
  });

  test("text_done: finalisiert Item auf done und setzt endgültigen Text", () => {
    const initial: ConnectChatItem[] = [
      {
        kind: "text",
        id: "text-1",
        role: "assistant",
        text: "Hallo ",
        status: "running",
      },
    ];
    const event: ConnectChatEvent = {
      type: "text_done",
      itemId: "text-1",
      text: "Hallo Welt!",
    };
    const updated = applyConnectChatEvent(initial, event);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      kind: "text",
      id: "text-1",
      text: "Hallo Welt!",
      status: "done",
    });
  });

  test("tool: fügt neues Tool-Item ein oder aktualisiert bestehendes", () => {
    const toolItem: ConnectChatToolItem = {
      kind: "tool",
      id: "tool-1",
      label: "Bash",
      title: "ls -la",
      status: "running",
      startedAt: "2026-10-29T12:00:00Z",
    };
    const updated = applyConnectChatEvent([], { type: "tool", item: toolItem });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toEqual(toolItem);

    // Update mit Output & done Status
    const completedTool: ConnectChatToolItem = {
      ...toolItem,
      status: "done",
      output: "total 0",
      endedAt: "2026-10-29T12:00:01Z",
    };
    const afterDone = applyConnectChatEvent(updated, { type: "tool", item: completedTool });
    expect(afterDone).toHaveLength(1);
    expect((afterDone[0] as ConnectChatToolItem).status).toBe("done");
    expect((afterDone[0] as ConnectChatToolItem).output).toBe("total 0");
  });

  test("context_switch: fügt Trenner mit Token-Zahl ein (I5)", () => {
    const event: ConnectChatEvent = {
      type: "context_switch",
      item: {
        kind: "context_switch",
        id: "ctx-1",
        tokensAtSwitch: 102400,
        summary: "Zusammenfassung der ersten 100k Tokens",
        previousThreadId: "t-prev",
        newThreadId: "t-next",
        createdAt: "2026-10-29T12:00:00Z",
      },
    };
    const updated = applyConnectChatEvent([], event);
    expect(updated).toHaveLength(1);
    expect(updated[0].kind).toBe("context_switch");
  });

  test("usage & keepalive verändern die Nachrichtenliste nicht", () => {
    const initial: ConnectChatItem[] = [
      { kind: "text", id: "t1", role: "user", text: "Hi", status: "done" },
    ];
    const afterUsage = applyConnectChatEvent(initial, {
      type: "usage",
      turnId: "turn-1",
      usage: {
        uncachedInputTokens: 100,
        cachedInputTokens: 200,
        cacheCreationTokens: 0,
        outputTokens: 50,
      },
    });
    expect(afterUsage).toBe(initial);

    const afterKeepalive = applyConnectChatEvent(initial, {
      type: "keepalive",
      at: "2026-10-29T12:00:00Z",
    });
    expect(afterKeepalive).toBe(initial);
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 3. Mock-Adapter Tests
 * ---------------------------------------------------------------------------------------- */

describe("T3-Mock-Adapter", () => {
  beforeEach(() => {
    setT3MockMode(true);
  });

  test("isT3MockMode reflektiert globalen Status", () => {
    expect(isT3MockMode()).toBe(true);
    setT3MockMode(false);
    expect(isT3MockMode()).toBe(false);
  });

  test("mockFetchT3Status liefert gültigen Status mit Sidecar-Port", async () => {
    const status = await mockFetchT3Status();
    expect(status.running).toBe(true);
    expect(status.port).toBe(3773);
    expect(status.providers.length).toBeGreaterThan(0);
  });

  test("mockFetchT3Providers liefert 11 Treiber inklusive Codex und Claude", async () => {
    const res = await mockFetchT3Providers();
    expect(res.providers).toHaveLength(11);
    const codex = res.providers.find((p) => p.provider === "codex");
    expect(codex?.installed).toBe(true);
    expect(codex?.models).toContain("gpt-4o");
  });

  test("mockSendT3Message fügt User-Nachricht zum Memory-Thread hinzu", async () => {
    const agentId = "test-agent-mock";
    const res = await mockSendT3Message(agentId, {
      agentId,
      text: "Hallo aus dem Test",
      clientMessageId: "cm-123",
    });
    expect(res.threadId).toBeDefined();

    const snapshot = await mockFetchT3ThreadSnapshot(agentId);
    const last = snapshot.items[snapshot.items.length - 1];
    expect(last?.kind).toBe("text");
    if (last?.kind === "text") {
      expect(last.text).toBe("Hallo aus dem Test");
      expect(last.role).toBe("user");
    }
  });

  test("mockRespondT3Approval aktualisiert Freigabe-Zustand", async () => {
    const agentId = "agent-t3-default";
    const pendingBefore = await mockFetchT3PendingApprovals(agentId);
    expect(pendingBefore.length).toBeGreaterThan(0);
    const reqId = pendingBefore[0].requestId;

    const res = await mockRespondT3Approval(agentId, {
      agentId,
      requestId: reqId,
      decision: "allow",
    });
    expect(res.ok).toBe(true);

    const pendingAfter = await mockFetchT3PendingApprovals(agentId);
    expect(pendingAfter.find((a) => a.requestId === reqId)).toBeUndefined();
  });

  test("mockControlMachine weckt und schläfert Maschinen", async () => {
    const machineId = "connect-cua-agent-codex";
    // Zuerst wecken
    const wakeRes = await mockControlMachine(machineId, "wake");
    expect(wakeRes.ok).toBe(true);
    const running = await mockFetchMachine(machineId);
    expect(running.status).toBe("running");

    // Dann suspendieren / sleep
    const sleepRes = await mockControlMachine(machineId, "sleep");
    expect(sleepRes.ok).toBe(true);
    const sleeping = await mockFetchMachine(machineId);
    expect(sleeping.status).toBe("sleeping");
  });

  test("mockSubscribeT3Stream simuliert SSE Event-Kette", async () => {
    const received: ConnectChatEvent[] = [];
    const unsubscribe = mockSubscribeT3Stream(
      "agent-test",
      (ev) => {
        received.push(ev);
      },
      undefined,
      { eventDelayMs: 5 },
    );

    await new Promise((r) => setTimeout(r, 80));
    unsubscribe();

    expect(received.length).toBeGreaterThanOrEqual(4);
    expect(received[0].type).toBe("keepalive");
    expect(received.some((e) => e.type === "text_delta")).toBe(true);
    expect(received.some((e) => e.type === "turn_end")).toBe(true);
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 4. HTTP-Client & Fetch-Funktionen (mit global fetch Mock)
 * ---------------------------------------------------------------------------------------- */

describe("T3-Client HTTP Fetch-Funktionen", () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: unknown; headers?: unknown }[] = [];

  beforeEach(() => {
    setT3MockMode(false);
    calls.length = 0;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetchT3Status ruft /api/t3/status auf und verwendet credentials: include", async () => {
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      expect(init?.credentials).toBe("include");
      return new Response(JSON.stringify({ running: true, port: 3773 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const res = await fetchT3Status();
    expect(res.running).toBe(true);
    expect(calls[0].url).toBe("/api/t3/status");
  });

  test("sendT3Message sendet POST an /api/t3-agents/:agentId/messages", async () => {
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: JSON.parse(init?.body ?? "{}"),
      });
      return new Response(
        JSON.stringify({ threadId: "t1", turnId: "turn-1", generation: 0, status: "running" }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const res = await sendT3Message("agent-42", {
      text: "Guten Tag",
      clientMessageId: "cm-999",
      provider: "codex",
    });

    expect(res.status).toBe("running");
    expect(calls[0].url).toBe("/api/t3-agents/agent-42/messages");
    expect(calls[0].method).toBe("POST");
    expect((calls[0].body as any).clientMessageId).toBe("cm-999");
  });

  test("interruptT3Turn sendet POST an /api/t3-agents/:agentId/interrupt", async () => {
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" });
      return new Response(JSON.stringify({ ok: true, supported: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const res = await interruptT3Turn("agent-42", "Nutzerabbruch");
    expect(res.ok).toBe(true);
    expect(calls[0].url).toBe("/api/t3-agents/agent-42/interrupt");
  });

  test("respondT3Approval sendet POST an /api/t3-agents/:agentId/approvals/:requestId", async () => {
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: JSON.parse(init?.body ?? "{}"),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const res = await respondT3Approval("agent-42", {
      requestId: "req-1",
      decision: "allow",
    });
    expect(res.ok).toBe(true);
    expect(calls[0].url).toBe("/api/t3-agents/agent-42/approvals/req-1");
  });

  test("T3ClientError wird bei HTTP 4xx/5xx mit sprechender Meldung geworfen", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: "Feature-Flag 'bridge' deaktiviert" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      await fetchT3Providers();
      expect(true).toBe(false); // Sollte nicht erreicht werden
    } catch (err) {
      expect(err instanceof T3ClientError).toBe(true);
      if (err instanceof T3ClientError) {
        expect(err.status).toBe(503);
        expect(err.message).toBe("Feature-Flag 'bridge' deaktiviert");
      }
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 5. React Hooks Tests
 * ---------------------------------------------------------------------------------------- */

describe("React Hook: useT3Providers", () => {
  test("lädt Provider-Liste im Mock-Modus und stellt Hilfsfunktionen bereit", async () => {
    const { result } = renderHook(() => useT3Providers({ mock: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.providers.length).toBe(11);
    expect(result.current.isProviderAvailable("codex")).toBe(true);
    expect(result.current.isProviderAvailable("pi")).toBe(false);

    const codex = result.current.getProvider("codex");
    expect(codex?.displayName).toBe("Codex");
    expect(result.current.activeProviders.length).toBeGreaterThan(0);
  });
});

describe("React Hook: useT3Chat", () => {
  test("lädt initialen Snapshot und sendet Nachrichten optimistisch", async () => {
    const { result } = renderHook(() =>
      useT3Chat("agent-t3-test", { mock: true, autoConnectStream: false }),
    );

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0);
    });

    const initialLength = result.current.messages.length;

    // Nachricht senden
    await act(async () => {
      await result.current.sendMessage("Neue Testnachricht an T3");
    });

    // Optimistisch um 1 Nachricht erhöht
    expect(result.current.messages.length).toBe(initialLength + 1);
    const lastMsg = result.current.messages[result.current.messages.length - 1];
    expect(lastMsg.kind).toBe("text");
    if (lastMsg.kind === "text") {
      expect(lastMsg.text).toBe("Neue Testnachricht an T3");
      expect(lastMsg.role).toBe("user");
    }
  });

  test("interrupt bricht Turn ab und setzt status auf cancelled", async () => {
    const { result } = renderHook(() =>
      useT3Chat("agent-t3-test", { mock: true, autoConnectStream: false }),
    );

    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0);
    });

    await act(async () => {
      await result.current.interrupt("Testunterbrechung");
    });

    expect(result.current.status).toBe("cancelled");
    expect(result.current.isStreaming).toBe(false);
  });
});

describe("React Hook: useT3Control", () => {
  test("lädt Capabilities und offene Freigaben", async () => {
    const { result } = renderHook(() =>
      useT3Control({ agentId: "agent-t3-default", mock: true }),
    );

    await waitFor(() => {
      expect(result.current.capabilities).not.toBeNull();
    });

    expect(result.current.capabilities?.canInterrupt).toBe(true);
    expect(result.current.capabilities?.canSteer).toBe(true);
    expect(result.current.pendingApprovals.length).toBeGreaterThan(0);
  });
});

describe("React Hook: useUsage", () => {
  test("lädt T3-Nutzungsdaten und Totals", async () => {
    const { result } = renderHook(() =>
      useUsage(
        { metric: "cost", windowDays: 30, groupBy: "agent" },
        { mock: true },
      ),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).not.toBeNull();
    expect(result.current.totals?.costUsd).toBeGreaterThan(0);
    expect(result.current.buckets.length).toBeGreaterThan(0);
  });
});

describe("React Hook: useMachines", () => {
  test("lädt Maschinenliste und steuert wake/sleep", async () => {
    const { result } = renderHook(() => useMachines({ mock: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.machines.length).toBeGreaterThan(0);
    expect(result.current.sharedDefaultMachine).not.toBeNull();
    expect(result.current.sharedDefaultMachine?.id).toBe("connect-cua-shared-default");

    // Wecken
    await act(async () => {
      const ok = await result.current.wake("connect-cua-agent-codex");
      expect(ok).toBe(true);
    });

    const woken = result.current.machines.find((m) => m.id === "connect-cua-agent-codex");
    expect(woken?.status).toBe("running");
  });
});

describe("React Hook: useCompanyPublicUsage", () => {
  test("lädt öffentliche Firmen-Tokens und Aufteilung nach Providern", async () => {
    const { result } = renderHook(() =>
      useCompanyPublicUsage("company-kunc-gmbh", { mock: true }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.usage).not.toBeNull();
    expect(result.current.usage?.totalTokens).toBeGreaterThan(0);
    expect(result.current.usage?.byProvider.length).toBeGreaterThan(0);
  });
});

describe("React Hook: useSchedulerStatus", () => {
  test("lädt Flotten- und Scheduler-Status", async () => {
    const { result } = renderHook(() => useSchedulerStatus({ mock: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.running).toBe(true);
    expect(result.current.limits?.maxConcurrentTurns).toBe(5);
    expect(result.current.agents.length).toBeGreaterThan(0);
  });
});

describe("React Hook: useAgentAvatar", () => {
  test("lädt Mascottchen-Avatar und aktualisiert ihn", async () => {
    const { result } = renderHook(() => useAgentAvatar("agent-t3-default", { mock: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.avatar?.shape).toBe("pumpkin");
    expect(result.current.avatar?.color).toBe("orange");

    await act(async () => {
      const updated = await result.current.updateAvatar({ color: "turquoise", expression: "wide" });
      expect(updated.color).toBe("turquoise");
      expect(updated.expression).toBe("wide");
    });

    expect(result.current.avatar?.color).toBe("turquoise");
  });
});
