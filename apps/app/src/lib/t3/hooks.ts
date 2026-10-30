/**
 * T3-Bridge — React Hooks (Lane A21).
 *
 * Alle Hooks für das Connect-Frontend:
 *  1. useT3Providers: Provider-Liste, Verfügbarkeit & Modelle
 *  2. useT3Chat: Lückenloser Verlauf + SSE Stream + Senden + Approvals
 *  3. useT3Control: Steuerung (Interrupt, Steer) & Capabilities
 *  4. useUsage: Kosten, Tokens & Limits (Lane A17/A24)
 *  5. useMachines: Cua Sandboxen & Lokale Maschinen (Lane A19/A26)
 *  6. useCompanyPublicUsage: Öffentliche Firmen-Token-Summen (Lane A20/A35)
 *  7. useSchedulerStatus: Flottenzustand & Scheduler-Limits (Lane A20/A28)
 *  8. useAgentAvatar: Mascottchen-Avatar Form/Farbe/Ausdruck (Lane A20/A29)
 *
 * Enthält pure Reducer-Funktionen (wie `applyConnectChatEvent`) für 100% Testbarkeit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentAvatar,
  type CompanyPublicUsage,
  type ConnectChatApprovalItem,
  type ConnectChatEvent,
  type ConnectChatItem,
  type ConnectChatItemStatus,
  type ConnectChatTextItem,
  type ConnectChatToolItem,
  type ConnectChatUsage,
  type FleetAgentState,
  getT3Flag,
  type Machine,
  type SchedulerLimits,
  type T3ApprovalDecision,
  type T3ApprovalResponse,
  type T3Capabilities,
  type T3ControlResponse,
  type T3MessageRequest,
  type T3MessageResponse,
  type T3ProviderId,
  type T3ProviderStatus,
  type T3ThreadSnapshot,
  type UsageBucket,
  type UsageQuery,
  type UsageResponse,
} from "./contracts";
import {
  controlMachine,
  fetchAgentAvatar,
  fetchCompanyPublicUsage,
  fetchFleetStatus,
  fetchMachine,
  fetchMachines,
  fetchSchedulerStatus,
  fetchT3Capabilities,
  fetchT3PendingApprovals,
  fetchT3Providers,
  fetchT3Status,
  fetchT3ThreadSnapshot,
  fetchT3Usage,
  interruptT3Turn,
  respondT3Approval,
  sendT3Message,
  steerT3Turn,
  updateAgentAvatar,
} from "./client";
import { subscribeT3Stream } from "./stream";

/* ---------------------------------------------------------------------------------------- *
 * Pure Hilfsfunktion: applyConnectChatEvent
 * ---------------------------------------------------------------------------------------- */

/**
 * Wendet ein eintreffendes SSE `ConnectChatEvent` deterministisch auf die bestehende
 * Item-Liste an.
 */
export function applyConnectChatEvent(
  items: ConnectChatItem[],
  event: ConnectChatEvent,
): ConnectChatItem[] {
  switch (event.type) {
    case "text_delta": {
      const existingIdx = items.findIndex((i) => i.id === event.itemId);
      if (existingIdx !== -1) {
        const item = items[existingIdx];
        if (item && item.kind === "text") {
          const updated: ConnectChatTextItem = {
            ...item,
            text: item.text + event.delta,
            delta: event.delta,
            status: "running",
          };
          const next = [...items];
          next[existingIdx] = updated;
          return next;
        }
      }
      // Neues Text-Item für den Stream anlegen
      const newItem: ConnectChatTextItem = {
        kind: "text",
        id: event.itemId,
        role: "assistant",
        text: event.delta,
        delta: event.delta,
        status: "running",
      };
      return [...items, newItem];
    }

    case "text_done": {
      const existingIdx = items.findIndex((i) => i.id === event.itemId);
      if (existingIdx !== -1) {
        const item = items[existingIdx];
        if (item && item.kind === "text") {
          const updated: ConnectChatTextItem = {
            ...item,
            text: event.text,
            delta: undefined,
            status: "done",
          };
          const next = [...items];
          next[existingIdx] = updated;
          return next;
        }
      }
      const newItem: ConnectChatTextItem = {
        kind: "text",
        id: event.itemId,
        role: "assistant",
        text: event.text,
        status: "done",
      };
      return [...items, newItem];
    }

    case "tool": {
      const existingIdx = items.findIndex((i) => i.id === event.item.id);
      if (existingIdx !== -1) {
        const next = [...items];
        next[existingIdx] = { ...event.item };
        return next;
      }
      return [...items, { ...event.item }];
    }

    case "approval": {
      const existingIdx = items.findIndex((i) => i.id === event.item.id);
      if (existingIdx !== -1) {
        const next = [...items];
        next[existingIdx] = { ...event.item };
        return next;
      }
      return [...items, { ...event.item }];
    }

    case "context_switch": {
      const existingIdx = items.findIndex((i) => i.id === event.item.id);
      if (existingIdx !== -1) {
        const next = [...items];
        next[existingIdx] = { ...event.item };
        return next;
      }
      return [...items, { ...event.item }];
    }

    case "plan": {
      const existingIdx = items.findIndex((i) => i.id === event.item.id);
      if (existingIdx !== -1) {
        const next = [...items];
        next[existingIdx] = { ...event.item };
        return next;
      }
      return [...items, { ...event.item }];
    }

    case "subagent": {
      const existingIdx = items.findIndex((i) => i.id === event.item.id);
      if (existingIdx !== -1) {
        const next = [...items];
        next[existingIdx] = { ...event.item };
        return next;
      }
      return [...items, { ...event.item }];
    }

    case "error": {
      const existingIdx = items.findIndex((i) => i.id === event.item.id);
      if (existingIdx !== -1) {
        const next = [...items];
        next[existingIdx] = { ...event.item };
        return next;
      }
      return [...items, { ...event.item }];
    }

    case "turn_end": {
      const existingIdx = items.findIndex((i) => i.id === event.item.id);
      if (existingIdx !== -1) {
        const next = [...items];
        next[existingIdx] = { ...event.item };
        return next;
      }
      return [...items, { ...event.item }];
    }

    case "usage":
    case "keepalive":
      // Keine Items in der Nachrichtenliste
      return items;

    default:
      return items;
  }
}

/* ---------------------------------------------------------------------------------------- *
 * 1. Hook: useT3Providers
 * ---------------------------------------------------------------------------------------- */

export type UseT3ProvidersOptions = {
  refreshInterval?: number;
  mock?: boolean;
};

export type UseT3ProvidersResult = {
  providers: T3ProviderStatus[];
  unknownDrivers: string[];
  activeProviders: T3ProviderStatus[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  isProviderAvailable: (providerId: T3ProviderId | string) => boolean;
  getProvider: (providerId: T3ProviderId | string) => T3ProviderStatus | undefined;
};

export function useT3Providers(options: UseT3ProvidersOptions = {}): UseT3ProvidersResult {
  const [providers, setProviders] = useState<T3ProviderStatus[]>([]);
  const [unknownDrivers, setUnknownDrivers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchT3Providers({ mock: options.mock });
      setProviders(res.providers);
      setUnknownDrivers(res.unknownDrivers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [options.mock]);

  useEffect(() => {
    load();
    if (options.refreshInterval && options.refreshInterval > 0) {
      const timer = setInterval(load, options.refreshInterval);
      return () => clearInterval(timer);
    }
  }, [load, options.refreshInterval]);

  const isProviderAvailable = useCallback(
    (providerId: T3ProviderId | string): boolean => {
      const found = providers.find((p) => p.provider === providerId || p.driver === providerId);
      if (!found) return false;
      if (found.availability) return found.availability === "available";
      return found.installed && found.authenticated !== false;
    },
    [providers],
  );

  const getProvider = useCallback(
    (providerId: T3ProviderId | string): T3ProviderStatus | undefined => {
      return providers.find((p) => p.provider === providerId || p.driver === providerId);
    },
    [providers],
  );

  const activeProviders = useMemo(() => {
    return providers.filter((p) => {
      if (p.availability) return p.availability === "available";
      return p.installed && p.authenticated !== false;
    });
  }, [providers]);

  return {
    providers,
    unknownDrivers,
    activeProviders,
    loading,
    error,
    refetch: load,
    isProviderAvailable,
    getProvider,
  };
}

/* ---------------------------------------------------------------------------------------- *
 * 2. Hook: useT3Chat
 * ---------------------------------------------------------------------------------------- */

export type UseT3ChatOptions = {
  mock?: boolean;
  autoConnectStream?: boolean;
};

export type UseT3ChatResult = {
  messages: ConnectChatItem[];
  thread: T3ThreadSnapshot | null;
  status: ConnectChatItemStatus;
  isStreaming: boolean;
  pendingApprovals: ConnectChatApprovalItem[];
  currentUsage: ConnectChatUsage | null;
  error: Error | null;
  sendMessage: (
    text: string,
    options?: {
      clientMessageId?: string;
      attachmentIds?: string[];
      model?: string;
      provider?: T3ProviderId;
    },
  ) => Promise<T3MessageResponse>;
  interrupt: (reason?: string) => Promise<T3ControlResponse>;
  steer: (text: string) => Promise<T3ControlResponse>;
  respondApproval: (
    requestId: string,
    decision: T3ApprovalDecision,
    options?: { feedback?: string; answers?: Record<string, string> },
  ) => Promise<T3ApprovalResponse>;
  refetchHistory: () => Promise<void>;
};

export function useT3Chat(agentId: string, options: UseT3ChatOptions = {}): UseT3ChatResult {
  const [messages, setMessages] = useState<ConnectChatItem[]>([]);
  const [thread, setThread] = useState<T3ThreadSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectChatItemStatus>("done");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentUsage, setCurrentUsage] = useState<ConnectChatUsage | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const autoConnect = options.autoConnectStream ?? true;
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Initialen Verlauf / Snapshot laden
  const refetchHistory = useCallback(async () => {
    if (!agentId) return;
    try {
      setError(null);
      const snapshot = await fetchT3ThreadSnapshot(agentId, { mock: options.mock });
      setThread(snapshot);
      setMessages(snapshot.items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [agentId, options.mock]);

  useEffect(() => {
    refetchHistory();
  }, [refetchHistory]);

  // Event-Handler für SSE Stream
  const handleEvent = useCallback((event: ConnectChatEvent) => {
    setMessages((prev) => applyConnectChatEvent(prev, event));

    if (event.type === "text_delta") {
      setIsStreaming(true);
      setStatus("running");
    } else if (event.type === "turn_end") {
      setIsStreaming(false);
      setStatus(event.item.status === "completed" ? "done" : "error");
      if (event.item.usage) {
        setCurrentUsage(event.item.usage);
      }
    } else if (event.type === "usage") {
      setCurrentUsage(event.usage);
    } else if (event.type === "approval") {
      setStatus("waiting");
    } else if (event.type === "error") {
      setStatus("error");
    }
  }, []);

  // SSE Stream abonnieren
  useEffect(() => {
    if (!agentId || !autoConnect) return;

    const unsubscribe = subscribeT3Stream(agentId, {
      mock: options.mock,
      onEvent: handleEvent,
      onResync: () => {
        refetchHistory();
      },
      onError: (err) => {
        setError(err);
      },
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
      unsubscribeRef.current = null;
    };
  }, [agentId, autoConnect, options.mock, handleEvent, refetchHistory]);

  // Ausstehende Freigaben ableiten
  const pendingApprovals = useMemo(() => {
    return messages.filter(
      (m): m is ConnectChatApprovalItem => m.kind === "approval" && m.status === "waiting",
    );
  }, [messages]);

  // Nachricht senden
  const sendMessage = useCallback(
    async (
      text: string,
      sendOptions?: {
        clientMessageId?: string;
        attachmentIds?: string[];
        model?: string;
        provider?: T3ProviderId;
      },
    ): Promise<T3MessageResponse> => {
      const clientMessageId =
        sendOptions?.clientMessageId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Optimistisches User-Item
      const userItem: ConnectChatTextItem = {
        kind: "text",
        id: clientMessageId,
        role: "user",
        text,
        status: "done",
      };
      setMessages((prev) => [...prev, userItem]);
      setStatus("running");
      setIsStreaming(true);

      try {
        const res = await sendT3Message(
          agentId,
          {
            clientMessageId,
            text,
            attachmentIds: sendOptions?.attachmentIds,
            model: sendOptions?.model,
            provider: sendOptions?.provider,
          },
          { mock: options.mock },
        );
        return res;
      } catch (err) {
        const errorInstance = err instanceof Error ? err : new Error(String(err));
        setError(errorInstance);
        setStatus("error");
        setIsStreaming(false);
        throw errorInstance;
      }
    },
    [agentId, options.mock],
  );

  // Turn unterbrechen
  const interrupt = useCallback(
    async (reason?: string): Promise<T3ControlResponse> => {
      const res = await interruptT3Turn(agentId, reason, { mock: options.mock });
      setIsStreaming(false);
      setStatus("cancelled");
      return res;
    },
    [agentId, options.mock],
  );

  // Turn lenken
  const steer = useCallback(
    async (text: string): Promise<T3ControlResponse> => {
      return steerT3Turn(agentId, text, { mock: options.mock });
    },
    [agentId, options.mock],
  );

  // Freigabe beantworten
  const respondApproval = useCallback(
    async (
      requestId: string,
      decision: T3ApprovalDecision,
      approvalOptions?: { feedback?: string; answers?: Record<string, string> },
    ): Promise<T3ApprovalResponse> => {
      // Optimistisch aktualisieren
      setMessages((prev) =>
        prev.map((item) => {
          if (item.kind === "approval" && item.requestId === requestId) {
            return {
              ...item,
              status: decision === "deny" ? "cancelled" : "done",
            };
          }
          return item;
        }),
      );

      const res = await respondT3Approval(
        agentId,
        {
          requestId,
          decision,
          feedback: approvalOptions?.feedback,
          answers: approvalOptions?.answers,
        },
        { mock: options.mock },
      );

      setStatus("running");
      return res;
    },
    [agentId, options.mock],
  );

  return {
    messages,
    thread,
    status,
    isStreaming,
    pendingApprovals,
    currentUsage,
    error,
    sendMessage,
    interrupt,
    steer,
    respondApproval,
    refetchHistory,
  };
}

/* ---------------------------------------------------------------------------------------- *
 * 3. Hook: useT3Control
 * ---------------------------------------------------------------------------------------- */

export type UseT3ControlOptions = {
  agentId?: string;
  mock?: boolean;
};

export type UseT3ControlResult = {
  capabilities: T3Capabilities | null;
  pendingApprovals: ConnectChatApprovalItem[];
  loading: boolean;
  error: Error | null;
  interrupt: (targetAgentId?: string, reason?: string) => Promise<T3ControlResponse>;
  steer: (targetAgentId?: string, text?: string) => Promise<T3ControlResponse>;
  respondApproval: (
    targetAgentId: string,
    requestId: string,
    decision: T3ApprovalDecision,
    options?: { feedback?: string; answers?: Record<string, string> },
  ) => Promise<T3ApprovalResponse>;
  refetch: () => Promise<void>;
};

export function useT3Control(options: UseT3ControlOptions = {}): UseT3ControlResult {
  const [capabilities, setCapabilities] = useState<T3Capabilities | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ConnectChatApprovalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!options.agentId) return;
    try {
      setLoading(true);
      setError(null);
      const [caps, approvals] = await Promise.all([
        fetchT3Capabilities(options.agentId, { mock: options.mock }),
        fetchT3PendingApprovals(options.agentId, { mock: options.mock }),
      ]);
      setCapabilities(caps);
      setPendingApprovals(approvals);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [options.agentId, options.mock]);

  useEffect(() => {
    load();
  }, [load]);

  const interrupt = useCallback(
    async (targetAgentId?: string, reason?: string): Promise<T3ControlResponse> => {
      const id = targetAgentId || options.agentId;
      if (!id) throw new Error("agentId ist erforderlich für interrupt");
      return interruptT3Turn(id, reason, { mock: options.mock });
    },
    [options.agentId, options.mock],
  );

  const steer = useCallback(
    async (targetAgentId?: string, text?: string): Promise<T3ControlResponse> => {
      const id = targetAgentId || options.agentId;
      if (!id || !text) throw new Error("agentId und text sind erforderlich für steer");
      return steerT3Turn(id, text, { mock: options.mock });
    },
    [options.agentId, options.mock],
  );

  const handleRespondApproval = useCallback(
    async (
      targetAgentId: string,
      requestId: string,
      decision: T3ApprovalDecision,
      respOptions?: { feedback?: string; answers?: Record<string, string> },
    ): Promise<T3ApprovalResponse> => {
      const res = await respondT3Approval(
        targetAgentId,
        {
          requestId,
          decision,
          feedback: respOptions?.feedback,
          answers: respOptions?.answers,
        },
        { mock: options.mock },
      );
      setPendingApprovals((prev) => prev.filter((a) => a.requestId !== requestId));
      return res;
    },
    [options.mock],
  );

  return {
    capabilities,
    pendingApprovals,
    loading,
    error,
    interrupt,
    steer,
    respondApproval: handleRespondApproval,
    refetch: load,
  };
}

/* ---------------------------------------------------------------------------------------- *
 * 4. Hook: useUsage
 * ---------------------------------------------------------------------------------------- */

export type UseUsageOptions = {
  enabled?: boolean;
  refetchInterval?: number;
  mock?: boolean;
};

export type UseUsageResult = {
  data: UsageResponse | null;
  totals: UsageBucket | null;
  buckets: UsageBucket[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useUsage(query: UsageQuery, options: UseUsageOptions = {}): UseUsageResult {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const isEnabled = options.enabled ?? true;

  const queryMetric = query.metric;
  const queryWindowDays = query.windowDays;
  const queryGroupBy = query.groupBy;
  const queryAgentId = query.agentId;
  const queryCompanyId = query.companyId;
  const queryProvider = query.provider;
  const queryModel = query.model;
  const queryTimeZone = query.timeZone;

  const load = useCallback(async () => {
    if (!isEnabled) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchT3Usage(
        {
          metric: queryMetric,
          windowDays: queryWindowDays,
          groupBy: queryGroupBy,
          agentId: queryAgentId,
          companyId: queryCompanyId,
          provider: queryProvider,
          model: queryModel,
          timeZone: queryTimeZone,
        },
        { mock: options.mock },
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [
    isEnabled,
    queryMetric,
    queryWindowDays,
    queryGroupBy,
    queryAgentId,
    queryCompanyId,
    queryProvider,
    queryModel,
    queryTimeZone,
    options.mock,
  ]);

  useEffect(() => {
    load();
    if (options.refetchInterval && options.refetchInterval > 0 && isEnabled) {
      const timer = setInterval(load, options.refetchInterval);
      return () => clearInterval(timer);
    }
  }, [load, options.refetchInterval, isEnabled]);

  return {
    data,
    totals: data?.totals ?? null,
    buckets: data?.buckets ?? [],
    loading,
    error,
    refetch: load,
  };
}

/* ---------------------------------------------------------------------------------------- *
 * 5. Hook: useMachines
 * ---------------------------------------------------------------------------------------- */

export type UseMachinesOptions = {
  refetchInterval?: number;
  mock?: boolean;
};

export type UseMachinesResult = {
  machines: Machine[];
  sharedDefaultId: string | null;
  sharedDefaultMachine: Machine | null;
  loading: boolean;
  error: Error | null;
  wake: (machineId: string) => Promise<boolean>;
  sleep: (machineId: string) => Promise<boolean>;
  refetch: () => Promise<void>;
};

export function useMachines(options: UseMachinesOptions = {}): UseMachinesResult {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [sharedDefaultId, setSharedDefaultId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchMachines({ mock: options.mock });
      setMachines(res.machines);
      setSharedDefaultId(res.sharedDefaultId);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [options.mock]);

  useEffect(() => {
    load();
    if (options.refetchInterval && options.refetchInterval > 0) {
      const timer = setInterval(load, options.refetchInterval);
      return () => clearInterval(timer);
    }
  }, [load, options.refetchInterval]);

  const wake = useCallback(
    async (machineId: string): Promise<boolean> => {
      // Optimistisch auf running setzen
      setMachines((prev) =>
        prev.map((m) => (m.id === machineId ? { ...m, status: "running" as const } : m)),
      );
      try {
        const res = await controlMachine(machineId, "wake", { mock: options.mock });
        return res.ok;
      } catch (err) {
        load();
        throw err;
      }
    },
    [load, options.mock],
  );

  const sleep = useCallback(
    async (machineId: string): Promise<boolean> => {
      // Optimistisch auf sleeping setzen
      setMachines((prev) =>
        prev.map((m) => (m.id === machineId ? { ...m, status: "sleeping" as const } : m)),
      );
      try {
        const res = await controlMachine(machineId, "sleep", { mock: options.mock });
        return res.ok;
      } catch (err) {
        load();
        throw err;
      }
    },
    [load, options.mock],
  );

  const sharedDefaultMachine = useMemo(() => {
    if (!sharedDefaultId) return null;
    return machines.find((m) => m.id === sharedDefaultId) ?? null;
  }, [machines, sharedDefaultId]);

  return {
    machines,
    sharedDefaultId,
    sharedDefaultMachine,
    loading,
    error,
    wake,
    sleep,
    refetch: load,
  };
}

/* ---------------------------------------------------------------------------------------- *
 * 6. Hook: useCompanyPublicUsage
 * ---------------------------------------------------------------------------------------- */

export type UseCompanyPublicUsageOptions = {
  enabled?: boolean;
  mock?: boolean;
};

export type UseCompanyPublicUsageResult = {
  usage: CompanyPublicUsage | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useCompanyPublicUsage(
  companyId: string,
  options: UseCompanyPublicUsageOptions = {},
): UseCompanyPublicUsageResult {
  const [usage, setUsage] = useState<CompanyPublicUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const isEnabled = (options.enabled ?? true) && !!companyId;

  const load = useCallback(async () => {
    if (!isEnabled) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchCompanyPublicUsage(companyId, { mock: options.mock });
      setUsage(res);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [companyId, isEnabled, options.mock]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    usage,
    loading,
    error,
    refetch: load,
  };
}

/* ---------------------------------------------------------------------------------------- *
 * 7. Hook: useSchedulerStatus
 * ---------------------------------------------------------------------------------------- */

export type UseSchedulerStatusOptions = {
  refetchInterval?: number;
  mock?: boolean;
};

export type UseSchedulerStatusResult = {
  running: boolean;
  limits: SchedulerLimits | null;
  agents: FleetAgentState[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function useSchedulerStatus(
  options: UseSchedulerStatusOptions = {},
): UseSchedulerStatusResult {
  const [running, setRunning] = useState(true);
  const [limits, setLimits] = useState<SchedulerLimits | null>(null);
  const [agents, setAgents] = useState<FleetAgentState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchSchedulerStatus({ mock: options.mock });
      setRunning(res.running);
      setLimits(res.limits);
      setAgents(res.agents);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [options.mock]);

  useEffect(() => {
    load();
    if (options.refetchInterval && options.refetchInterval > 0) {
      const timer = setInterval(load, options.refetchInterval);
      return () => clearInterval(timer);
    }
  }, [load, options.refetchInterval]);

  return {
    running,
    limits,
    agents,
    loading,
    error,
    refetch: load,
  };
}

/* ---------------------------------------------------------------------------------------- *
 * 8. Hook: useAgentAvatar
 * ---------------------------------------------------------------------------------------- */

export type UseAgentAvatarOptions = {
  mock?: boolean;
};

export type UseAgentAvatarResult = {
  avatar: AgentAvatar | null;
  loading: boolean;
  error: Error | null;
  updateAvatar: (patch: Partial<AgentAvatar>) => Promise<AgentAvatar>;
  refetch: () => Promise<void>;
};

export function useAgentAvatar(
  agentId: string,
  options: UseAgentAvatarOptions = {},
): UseAgentAvatarResult {
  const [avatar, setAvatar] = useState<AgentAvatar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAgentAvatar(agentId, { mock: options.mock });
      setAvatar(res);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [agentId, options.mock]);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback(
    async (patch: Partial<AgentAvatar>): Promise<AgentAvatar> => {
      // Optimistisches Update
      if (avatar) {
        setAvatar({ ...avatar, ...patch, updatedAt: new Date().toISOString() });
      }
      const updated = await updateAgentAvatar(agentId, patch, { mock: options.mock });
      setAvatar(updated);
      return updated;
    },
    [agentId, avatar, options.mock],
  );

  return {
    avatar,
    loading,
    error,
    updateAvatar: update,
    refetch: load,
  };
}
