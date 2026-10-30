import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CliAccount,
  QuotaWindow,
  UsageGroupBy,
  UsageRange,
  UsageSummaryResponse,
  TimeSeriesPoint,
} from "@/components/usage/types";
import type {
  ConductorConfig,
  ConductorEvent,
  ConductorRuntimeStatus,
  Transfer,
} from "@/components/conductor/types";
import {
  initialMockAccounts,
  initialMockConfig,
  initialMockEvents,
  initialMockQuotaWindows,
  initialMockRuntimes,
  initialMockTimeSeries,
  initialMockTransfers,
  initialMockUsageSummary,
} from "./mock-data";

export interface ConductorDataState {
  accounts: CliAccount[];
  quotaWindows: QuotaWindow[];
  usageSummary: UsageSummaryResponse;
  timeSeries: TimeSeriesPoint[];
  config: ConductorConfig;
  runtimes: ConductorRuntimeStatus[];
  transfers: Transfer[];
  events: ConductorEvent[];
  isPaused: boolean;
  isLoading: boolean;
  isLiveConnected: boolean;
  range: UsageRange;
  groupBy: UsageGroupBy;
  error: string | null;
  setRange: (range: UsageRange) => void;
  setGroupBy: (groupBy: UsageGroupBy) => void;
  toggleKillSwitch: (activate: boolean, reason?: string) => Promise<void>;
  triggerHandoff: (taskId: string, targetRuntime: string, reason: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useConductorData(): ConductorDataState {
  const [accounts, setAccounts] = useState<CliAccount[]>(initialMockAccounts);
  const [quotaWindows, setQuotaWindows] = useState<QuotaWindow[]>(initialMockQuotaWindows);
  const [usageSummary, setUsageSummary] = useState<UsageSummaryResponse>(initialMockUsageSummary);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>(initialMockTimeSeries);
  const [config, setConfig] = useState<ConductorConfig>(initialMockConfig);
  const [runtimes, setRuntimes] = useState<ConductorRuntimeStatus[]>(initialMockRuntimes);
  const [transfers, setTransfers] = useState<Transfer[]>(initialMockTransfers);
  const [events, setEvents] = useState<ConductorEvent[]>(initialMockEvents);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [range, setRangeState] = useState<UsageRange>("24h");
  const [groupBy, setGroupByState] = useState<UsageGroupBy>("cli");
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  const loadData = useCallback(async (r: UsageRange, g: UsageGroupBy) => {
    setIsLoading(true);
    try {
      // 1. Quota API
      const quotaRes = await fetch("/api/usage/quota").catch(() => null);
      if (quotaRes && quotaRes.ok) {
        const quotaData = await quotaRes.json().catch(() => null);
        if (quotaData?.accounts) setAccounts(quotaData.accounts);
        if (quotaData?.windows) setQuotaWindows(quotaData.windows);
      }

      // 2. Summary API
      const summaryRes = await fetch(`/api/usage/summary?range=${r}&groupBy=${g}`).catch(() => null);
      if (summaryRes && summaryRes.ok) {
        const summaryData = await summaryRes.json().catch(() => null);
        if (summaryData?.items) setUsageSummary(summaryData);
      }

      // 3. Conductor Status API
      const statusRes = await fetch("/api/conductor/status").catch(() => null);
      if (statusRes && statusRes.ok) {
        const statusData = await statusRes.json().catch(() => null);
        if (statusData?.config) setConfig(statusData.config);
        if (statusData?.runtimes) setRuntimes(statusData.runtimes);
        if (statusData?.activeTransfers) setTransfers(statusData.activeTransfers);
        if (statusData?.recentEvents) setEvents(statusData.recentEvents);
        if (typeof statusData?.isPaused === "boolean") setIsPaused(statusData.isPaused);
      }
    } catch (err) {
      console.warn("Could not fetch Conductor API, using mock state:", err);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set range & reload
  const setRange = useCallback((newRange: UsageRange) => {
    setRangeState(newRange);
    void loadData(newRange, groupBy);
  }, [groupBy, loadData]);

  // Set groupBy & reload
  const setGroupBy = useCallback((newGroupBy: UsageGroupBy) => {
    setGroupByState(newGroupBy);
    void loadData(range, newGroupBy);
  }, [range, loadData]);

  // Initial load
  useEffect(() => {
    void loadData(range, groupBy);
  }, [range, groupBy, loadData]);

  // SSE connection for live updates
  useEffect(() => {
    try {
      const es = new EventSource("/api/conductor/events");
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsLiveConnected(true);
      };

      es.onerror = () => {
        setIsLiveConnected(false);
      };

      es.addEventListener("conductor.event", (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          if (parsed) {
            setEvents((prev) => [parsed, ...prev.slice(0, 99)]);
          }
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener("usage.updated", (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          if (parsed?.quotaWindow) {
            setQuotaWindows((prev) => {
              const updated = prev.filter((w) => w.accountId !== parsed.quotaWindow.accountId);
              return [...updated, parsed.quotaWindow];
            });
          }
        } catch {
          // ignore
        }
      });

      return () => {
        es.close();
      };
    } catch {
      setIsLiveConnected(false);
    }
  }, []);

  // Poll fallback every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      void loadData(range, groupBy);
    }, 30000);
    return () => clearInterval(interval);
  }, [range, groupBy, loadData]);

  // Kill Switch Toggle
  const toggleKillSwitch = useCallback(async (activate: boolean, reason?: string) => {
    // Optimistic update
    setConfig((prev) => ({ ...prev, killSwitch: activate }));

    const auditEvent: ConductorEvent = {
      id: `evt_kill_${Date.now()}`,
      eventType: activate ? "kill_switch_engaged" : "kill_switch_disengaged",
      severity: activate ? "warn" : "info",
      message: activate
        ? `Not-Aus (Kill-Switch) aktiviert: ${reason || "Manuelle Auslösung"}`
        : `Conductor wieder aktiviert: ${reason || "Normalbetrieb aufgenommen"}`,
      createdAt: new Date().toISOString(),
    };
    setEvents((prev) => [auditEvent, ...prev]);

    // Backend request
    const path = activate ? "/api/conductor/kill" : "/api/conductor/resume";
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).catch(() => null);
  }, []);

  // Manual Handoff
  const triggerHandoff = useCallback(async (taskId: string, targetRuntime: string, reason: string) => {
    const newTransfer: Transfer = {
      id: `tr_${Date.now()}`,
      swarmTaskId: taskId,
      transferKey: `man_${Math.random().toString(36).substring(2, 10)}`,
      fromRuntime: "codex",
      toRuntime: targetRuntime,
      reason: reason || "Manueller Handoff via Dashboard",
      status: "completed",
      createdAt: new Date().toISOString(),
    };

    setTransfers((prev) => [newTransfer, ...prev]);

    const auditEvent: ConductorEvent = {
      id: `evt_ho_${Date.now()}`,
      taskId,
      eventType: "handoff_triggered",
      severity: "warn",
      message: `Manueller Handoff von Codex an ${targetRuntime} für Task ${taskId}`,
      createdAt: new Date().toISOString(),
    };
    setEvents((prev) => [auditEvent, ...prev]);

    await fetch(`/api/conductor/handoff/${encodeURIComponent(taskId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetRuntime, reason }),
    }).catch(() => null);
  }, []);

  const refresh = useCallback(async () => {
    await loadData(range, groupBy);
  }, [loadData, range, groupBy]);

  return {
    accounts,
    quotaWindows,
    usageSummary,
    timeSeries,
    config,
    runtimes,
    transfers,
    events,
    isPaused,
    isLoading,
    isLiveConnected,
    range,
    groupBy,
    error,
    setRange,
    setGroupBy,
    toggleKillSwitch,
    triggerHandoff,
    refresh,
  };
}
