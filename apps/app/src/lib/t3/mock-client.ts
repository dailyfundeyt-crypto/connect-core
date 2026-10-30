/**
 * T3-Bridge — Mock-Adapter für isolierte Frontend-Entwicklung (Lane A21).
 *
 * Ermöglicht es allen W3-Agenten (A22–A36), Komponenten vollständig ohne laufenden
 * Server zu implementieren, rendern und testen.
 *
 * Kann global per `setT3MockMode(true)` oder situationsbedingt je Hook aktiviert werden.
 */

import type {
  AgentAvatar,
  CompanyPublicUsage,
  ConnectChatApprovalItem,
  ConnectChatEvent,
  ConnectChatItem,
  ConnectChatTextItem,
  ConnectChatTurnEndItem,
  FleetAgentState,
  Machine,
  MachineListResponse,
  SchedulerLimits,
  T3ApprovalRequest,
  T3ApprovalResponse,
  T3Capabilities,
  T3ControlRequest,
  T3ControlResponse,
  T3MessageRequest,
  T3MessageResponse,
  T3ProviderListResponse,
  T3StatusResponse,
  T3ThreadSnapshot,
  UsageQuery,
  UsageResponse,
} from "./contracts";
import {
  MOCK_AGENT_AVATAR,
  MOCK_CHAT_ITEMS,
  MOCK_COMPANY_PUBLIC_USAGE,
  MOCK_FLEET_AGENTS,
  MOCK_MACHINES,
  MOCK_SCHEDULER_LIMITS,
  MOCK_T3_CAPABILITIES,
  MOCK_T3_PROVIDER_LIST_RESPONSE,
  MOCK_T3_STATUS,
  MOCK_T3_THREAD_SNAPSHOT,
  MOCK_T3_USAGE_RESPONSE,
} from "./mock-data";

/* ---------------------------------------------------------------------------------------- *
 * Mock-Zustand & Steuerung
 * ---------------------------------------------------------------------------------------- */

let mockModeEnabled = false;

/**
 * Aktiviert oder deaktiviert den globalen T3-Mock-Modus.
 */
export function setT3MockMode(enabled: boolean): void {
  mockModeEnabled = enabled;
}

/**
 * Gibt zurück, ob der globale Mock-Modus aktuell aktiv ist.
 */
export function isT3MockMode(): boolean {
  if (mockModeEnabled) return true;
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("t3mock") === "true" || urlParams.get("t3mock") === "1") {
      return true;
    }
  }
  return false;
}

/* ---------------------------------------------------------------------------------------- *
 * In-Memory Mock Stores (zustandsbehaftet für Interaktionen)
 * ---------------------------------------------------------------------------------------- */

let memoryThreads = new Map<string, T3ThreadSnapshot>();
let memoryMachines = new Map<string, Machine>();
let memoryAvatars = new Map<string, AgentAvatar>();
let memoryPendingApprovals = new Map<string, ConnectChatApprovalItem[]>();

function initDefaultMemory(): void {
  memoryThreads.clear();
  memoryMachines.clear();
  memoryAvatars.clear();
  memoryPendingApprovals.clear();

  for (const m of MOCK_MACHINES) {
    memoryMachines.set(m.id, { ...m });
  }

  // Standard-Approval für agent-t3-default
  const approvals = MOCK_CHAT_ITEMS.filter(
    (item): item is ConnectChatApprovalItem => item.kind === "approval",
  );
  memoryPendingApprovals.set("agent-t3-default", approvals.map((a) => ({ ...a })));
}

initDefaultMemory();

/**
 * Setzt den In-Memory-Mock-Store auf den Ursprungszustand zurück (für Unit-Tests).
 */
export function resetT3MockStore(): void {
  mockModeEnabled = false;
  initDefaultMemory();
}

/* ---------------------------------------------------------------------------------------- *
 * Mock API Funktionen
 * ---------------------------------------------------------------------------------------- */

export async function mockFetchT3Status(): Promise<T3StatusResponse> {
  await new Promise((r) => setTimeout(r, 10));
  return { ...MOCK_T3_STATUS };
}

export async function mockFetchT3Providers(): Promise<T3ProviderListResponse> {
  await new Promise((r) => setTimeout(r, 10));
  return { ...MOCK_T3_PROVIDER_LIST_RESPONSE, fetchedAt: new Date().toISOString() };
}

export async function mockFetchT3ThreadSnapshot(agentId: string): Promise<T3ThreadSnapshot> {
  await new Promise((r) => setTimeout(r, 15));
  const existing = memoryThreads.get(agentId);
  if (existing) {
    return { ...existing };
  }
  const defaultSnapshot: T3ThreadSnapshot = {
    ...MOCK_T3_THREAD_SNAPSHOT,
    threadId: `mock-thread-${agentId}`,
    items: [...MOCK_CHAT_ITEMS],
    updatedAt: new Date().toISOString(),
  };
  memoryThreads.set(agentId, defaultSnapshot);
  return { ...defaultSnapshot };
}

export async function mockFetchT3Messages(
  agentId: string,
  _options?: { cursor?: string; limit?: number },
): Promise<{ items: ConnectChatItem[]; nextCursor?: string }> {
  const snapshot = await mockFetchT3ThreadSnapshot(agentId);
  return {
    items: [...snapshot.items],
    nextCursor: undefined,
  };
}

export async function mockSendT3Message(
  agentId: string,
  req: T3MessageRequest,
): Promise<T3MessageResponse> {
  await new Promise((r) => setTimeout(r, 20));

  let snapshot = memoryThreads.get(agentId);
  if (!snapshot) {
    snapshot = await mockFetchT3ThreadSnapshot(agentId);
  }

  const userItem: ConnectChatTextItem = {
    kind: "text",
    id: `msg-${Date.now()}`,
    role: "user",
    text: req.text,
    status: "done",
  };

  const updatedItems = [...snapshot.items, userItem];
  snapshot = {
    ...snapshot,
    items: updatedItems,
    tokens: snapshot.tokens + Math.ceil(req.text.length / 4),
    updatedAt: new Date().toISOString(),
  };
  memoryThreads.set(agentId, snapshot);

  return {
    threadId: snapshot.threadId,
    turnId: `turn-${Date.now()}`,
    generation: snapshot.generation,
    status: "running",
  };
}

export async function mockSendT3Control(
  agentId: string,
  req: T3ControlRequest,
): Promise<T3ControlResponse> {
  await new Promise((r) => setTimeout(r, 10));

  if (req.action === "interrupt") {
    const snapshot = memoryThreads.get(agentId);
    if (snapshot) {
      const items = [...snapshot.items];
      const lastItem = items[items.length - 1];
      if (
        lastItem &&
        "status" in lastItem &&
        (lastItem.status === "running" || lastItem.status === "waiting")
      ) {
        items[items.length - 1] = { ...lastItem, status: "cancelled" } as ConnectChatItem;
        memoryThreads.set(agentId, { ...snapshot, items });
      }
    }
    return { ok: true, supported: true, reason: "Turn erfolgreich unterbrochen" };
  }

  if (req.action === "steer") {
    return { ok: true, supported: true, reason: "Steuerungsanweisung übermittelt" };
  }

  return { ok: true, supported: true };
}

export async function mockInterruptT3Turn(
  agentId: string,
  reason?: string,
): Promise<T3ControlResponse> {
  return mockSendT3Control(agentId, { agentId, action: "interrupt", text: reason });
}

export async function mockSteerT3Turn(
  agentId: string,
  text: string,
): Promise<T3ControlResponse> {
  return mockSendT3Control(agentId, { agentId, action: "steer", text });
}

export async function mockFetchT3Capabilities(_agentId: string): Promise<T3Capabilities> {
  await new Promise((r) => setTimeout(r, 10));
  return { ...MOCK_T3_CAPABILITIES };
}

export async function mockRespondT3Approval(
  agentId: string,
  req: T3ApprovalRequest,
): Promise<T3ApprovalResponse> {
  await new Promise((r) => setTimeout(r, 15));

  // Ausstehende Freigaben aktualisieren
  const pending = memoryPendingApprovals.get(agentId) ?? [];
  const updatedPending = pending.filter((a) => a.requestId !== req.requestId);
  memoryPendingApprovals.set(agentId, updatedPending);

  // Snapshot aktualisieren
  const snapshot = memoryThreads.get(agentId);
  if (snapshot) {
    const updatedItems = snapshot.items.map((item) => {
      if (item.kind === "approval" && item.requestId === req.requestId) {
        return {
          ...item,
          status: req.decision === "deny" ? ("cancelled" as const) : ("done" as const),
        };
      }
      return item;
    });
    memoryThreads.set(agentId, { ...snapshot, items: updatedItems });
  }

  return { ok: true };
}

export async function mockFetchT3PendingApprovals(
  agentId: string,
): Promise<ConnectChatApprovalItem[]> {
  await new Promise((r) => setTimeout(r, 10));
  const list = memoryPendingApprovals.get(agentId);
  return list ? [...list] : [];
}

export async function mockFetchT3Usage(
  query: UsageQuery,
): Promise<UsageResponse> {
  await new Promise((r) => setTimeout(r, 20));
  return {
    ...MOCK_T3_USAGE_RESPONSE,
    metric: query.metric,
    windowDays: query.windowDays,
    groupBy: query.groupBy,
    readAt: new Date().toISOString(),
  };
}

export async function mockFetchCompanyPublicUsage(
  companyId: string,
): Promise<CompanyPublicUsage> {
  await new Promise((r) => setTimeout(r, 15));
  return {
    ...MOCK_COMPANY_PUBLIC_USAGE,
    companyId,
    computedAt: new Date().toISOString(),
  };
}

export async function mockFetchMachines(): Promise<MachineListResponse> {
  await new Promise((r) => setTimeout(r, 15));
  return {
    machines: Array.from(memoryMachines.values()),
    sharedDefaultId: "connect-cua-shared-default",
  };
}

export async function mockFetchMachine(machineId: string): Promise<Machine> {
  await new Promise((r) => setTimeout(r, 10));
  const m = memoryMachines.get(machineId);
  if (!m) {
    throw new Error(`Maschine '${machineId}' nicht gefunden.`);
  }
  return { ...m };
}

export async function mockControlMachine(
  machineId: string,
  action: "wake" | "sleep",
): Promise<{ ok: boolean }> {
  await new Promise((r) => setTimeout(r, 15));
  const m = memoryMachines.get(machineId);
  if (!m) {
    throw new Error(`Maschine '${machineId}' nicht gefunden.`);
  }
  const nextStatus = action === "wake" ? "running" : "sleeping";
  memoryMachines.set(machineId, {
    ...m,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
}

export async function mockFetchAgentAvatar(agentId: string): Promise<AgentAvatar> {
  await new Promise((r) => setTimeout(r, 10));
  const existing = memoryAvatars.get(agentId);
  if (existing) {
    return { ...existing };
  }
  const defaultAvatar: AgentAvatar = {
    ...MOCK_AGENT_AVATAR,
    agentId,
    updatedAt: new Date().toISOString(),
  };
  memoryAvatars.set(agentId, defaultAvatar);
  return { ...defaultAvatar };
}

export async function mockUpdateAgentAvatar(
  agentId: string,
  patch: Partial<AgentAvatar>,
): Promise<AgentAvatar> {
  await new Promise((r) => setTimeout(r, 15));
  const current = await mockFetchAgentAvatar(agentId);
  const updated: AgentAvatar = {
    ...current,
    ...patch,
    agentId,
    updatedAt: new Date().toISOString(),
  };
  memoryAvatars.set(agentId, updated);
  return { ...updated };
}

export async function mockFetchFleetStatus(): Promise<{
  agents: FleetAgentState[];
  limits: SchedulerLimits;
}> {
  await new Promise((r) => setTimeout(r, 15));
  return {
    agents: [...MOCK_FLEET_AGENTS],
    limits: { ...MOCK_SCHEDULER_LIMITS },
  };
}

export async function mockFetchSchedulerStatus(): Promise<{
  running: boolean;
  limits: SchedulerLimits;
  agents: FleetAgentState[];
}> {
  await new Promise((r) => setTimeout(r, 15));
  return {
    running: true,
    limits: { ...MOCK_SCHEDULER_LIMITS },
    agents: [...MOCK_FLEET_AGENTS],
  };
}

/* ---------------------------------------------------------------------------------------- *
 * Mock SSE Stream Simulation (für interaktives Streaming in Tests und UI)
 * ---------------------------------------------------------------------------------------- */

export type MockStreamOptions = {
  /** Verzögerung zwischen Events in ms (Standard: 40ms) */
  eventDelayMs?: number;
  /** Benutzerdefinierte Event-Sequenz */
  customEvents?: ConnectChatEvent[];
};

/**
 * Simuliert einen echten SSE-Stream für einen T3-Agenten.
 * Sendet nach und nach Deltas, Tool-Events und ein Turn-End-Event an den Callback.
 */
export function mockSubscribeT3Stream(
  _agentId: string,
  onEvent: (event: ConnectChatEvent) => void,
  _onError?: (err: Error) => void,
  options: MockStreamOptions = {},
): () => void {
  let isCancelled = false;
  const delay = options.eventDelayMs ?? 30;

  const events: ConnectChatEvent[] = options.customEvents ?? [
    { type: "keepalive", at: new Date().toISOString() },
    {
      type: "text_delta",
      itemId: "stream-text-1",
      delta: "Ich analysiere ",
    },
    {
      type: "text_delta",
      itemId: "stream-text-1",
      delta: "die aktuellen Daten...",
    },
    {
      type: "text_done",
      itemId: "stream-text-1",
      text: "Ich analysiere die aktuellen Daten...",
    },
    {
      type: "turn_end",
      item: {
        kind: "turn_end",
        id: "stream-turn-end",
        status: "completed",
        durationMs: 1500,
        usage: {
          uncachedInputTokens: 120,
          cachedInputTokens: 800,
          cacheCreationTokens: 0,
          outputTokens: 45,
          costUsd: 0.0012,
        },
      } satisfies ConnectChatTurnEndItem,
    },
  ];

  const timerIds: ReturnType<typeof setTimeout>[] = [];

  events.forEach((ev, idx) => {
    const tid = setTimeout(() => {
      if (!isCancelled) {
        onEvent(ev);
      }
    }, (idx + 1) * delay);
    timerIds.push(tid);
  });

  return () => {
    isCancelled = true;
    for (const tid of timerIds) {
      clearTimeout(tid);
    }
  };
}
