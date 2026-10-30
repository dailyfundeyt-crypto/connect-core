import { EventEmitter } from "node:events";
import {
  type AccountIsolation,
  type Checkpoint,
  type CliAccount,
  type CliKind,
  type ConductorConfig,
  type ConductorEvent,
  type ConductorEventSeverity,
  type ConductorRuntimeStatus,
  type QuotaWindow,
  type Transfer,
  type UsageSample,
  DEFAULT_CONDUCTOR_CONFIG,
  computeTransferKey,
} from "../../contracts/conductor/types";
import {
  type ConductorEventSseEvent,
  type ConductorHandoffResponse,
  type ConductorKillResponse,
  type ConductorResumeResponse,
  type ConductorStatusResponse,
  type UsageGroupBy,
  type UsageQuotaQuery,
  type UsageQuotaResponse,
  type UsageRange,
  type UsageSummaryItem,
  type UsageSummaryQuery,
  type UsageSummaryResponse,
  type UsageUpdatedSseEvent,
} from "../../contracts/conductor/api";
import {
  mockCliAccounts,
  mockConductorConfig,
  mockConductorEvents,
  mockQuotaWindows,
  mockRuntimeStatuses,
  mockUsageSamples,
} from "../../contracts/conductor/mocks";
import type { ConductorSupervisor } from "../../conductor/supervisor";

/**
 * ConductorService coordinates runtime state, usage metrics, quota tracking,
 * and failover state (kill-switch, checkpoints, transfers).
 *
 * Implements a hybrid model:
 * - Direct in-memory state initialized with canonical mock data for instant readiness
 * - Seamless integration with ConductorSupervisor (Lane 3) when provided/active
 * - Support for live ingestion from Usage Collectors (Lanes 1 & 2)
 * - Real-time SSE broadcasting for usage.updated and conductor.event
 */
export class ConductorService {
  private accounts: CliAccount[] = [];
  private quotaWindows: QuotaWindow[] = [];
  private usageSamples: UsageSample[] = [];
  private config: ConductorConfig = { ...DEFAULT_CONDUCTOR_CONFIG, paidApiFallback: false };
  private runtimes: ConductorRuntimeStatus[] = [];
  private checkpoints: Checkpoint[] = [];
  private transfers: Transfer[] = [];
  private events: ConductorEvent[] = [];
  private emitter: EventEmitter = new EventEmitter();
  private supervisor?: ConductorSupervisor;

  constructor(supervisor?: ConductorSupervisor) {
    this.supervisor = supervisor;
    this.resetToMocks();
  }

  /**
   * Connects or updates the active ConductorSupervisor instance.
   */
  public setSupervisor(supervisor: ConductorSupervisor | undefined): void {
    this.supervisor = supervisor;
  }

  public getSupervisor(): ConductorSupervisor | undefined {
    return this.supervisor;
  }

  /**
   * Resets the in-memory state to the canonical mock data.
   */
  public resetToMocks(): void {
    this.accounts = JSON.parse(JSON.stringify(mockCliAccounts));
    this.quotaWindows = JSON.parse(JSON.stringify(mockQuotaWindows));
    this.usageSamples = JSON.parse(JSON.stringify(mockUsageSamples));
    this.config = { ...JSON.parse(JSON.stringify(mockConductorConfig)), paidApiFallback: false };
    this.runtimes = JSON.parse(JSON.stringify(mockRuntimeStatuses));
    this.checkpoints = [];
    this.transfers = [];
    this.events = JSON.parse(JSON.stringify(mockConductorEvents));
  }

  /* ======================================================================== */
  /* Real-Time Event Subscription (SSE)                                       */
  /* ======================================================================== */

  public subscribeUsage(listener: (event: UsageUpdatedSseEvent) => void): () => void {
    this.emitter.on("usage.updated", listener);
    return () => {
      this.emitter.off("usage.updated", listener);
    };
  }

  public subscribeConductor(listener: (event: ConductorEventSseEvent) => void): () => void {
    this.emitter.on("conductor.event", listener);
    return () => {
      this.emitter.off("conductor.event", listener);
    };
  }

  public emitUsageUpdated(data: UsageUpdatedSseEvent["data"]): void {
    const event: UsageUpdatedSseEvent = {
      type: "usage.updated",
      data,
    };
    this.emitter.emit("usage.updated", event);
  }

  public emitConductorEvent(event: ConductorEvent): void {
    this.events.unshift(event);
    if (this.events.length > 500) {
      this.events.pop();
    }
    const sseEvent: ConductorEventSseEvent = {
      type: "conductor.event",
      data: event,
    };
    this.emitter.emit("conductor.event", sseEvent);
  }

  /* ======================================================================== */
  /* Usage Summary & Quota                                                    */
  /* ======================================================================== */

  public getUsageSummary(query: UsageSummaryQuery): UsageSummaryResponse {
    const groupBy: UsageGroupBy = query.groupBy || "cli";
    const range: UsageRange = query.range || "24h";

    // Filter samples according to query criteria
    let samples = [...this.usageSamples];
    if (query.cliKind) {
      samples = samples.filter((s) => s.cliKind === query.cliKind);
    }
    if (query.accountId) {
      samples = samples.filter((s) => s.accountId === query.accountId);
    }
    if (query.agentId) {
      samples = samples.filter((s) => s.agentId === query.agentId);
    }

    const itemsMap = new Map<string, UsageSummaryItem>();

    const getCliLabel = (kind: CliKind): string => {
      switch (kind) {
        case "codex":
          return "OpenAI Codex CLI";
        case "claude":
          return "Anthropic Claude Code CLI";
        case "antigravity":
          return "Google Antigravity CLI";
        case "gemini":
        case "gemini-cli":
          return "Google Gemini CLI";
        case "hermes":
          return "Hermes Agent CLI";
        case "freebuff":
          return "Freebuff CLI";
        default:
          return `${kind} CLI`;
      }
    };

    const getCliIsolation = (kind: CliKind): AccountIsolation => {
      return kind === "codex" || kind === "claude" ? "per_agent" : "shared";
    };

    // Pre-populate itemsMap to ensure all active CLIs / Accounts are visible
    if (groupBy === "cli") {
      const allKinds: CliKind[] = ["codex", "claude", "antigravity", "gemini", "hermes", "freebuff"];
      for (const kind of allKinds) {
        if (!query.cliKind || query.cliKind === kind) {
          itemsMap.set(kind, {
            key: kind,
            label: getCliLabel(kind),
            cliKind: kind,
            isolation: getCliIsolation(kind),
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            reasoningTokens: 0,
            runsCount: 0,
            durationSeconds: 0,
          });
        }
      }
    } else if (groupBy === "account") {
      for (const acc of this.accounts) {
        if (
          (!query.accountId || query.accountId === acc.id) &&
          (!query.cliKind || query.cliKind === acc.cliKind)
        ) {
          itemsMap.set(acc.id, {
            key: acc.id,
            label: acc.label,
            accountId: acc.id,
            cliKind: acc.cliKind,
            isolation: acc.isolation,
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            reasoningTokens: 0,
            runsCount: 0,
            durationSeconds: 0,
          });
        }
      }
    }

    // Aggregate samples into items
    for (const sample of samples) {
      let key = "";
      let label = "";
      let cliKind = sample.cliKind;
      let accountId = sample.accountId;
      let agentId = sample.agentId || undefined;
      let isolation = getCliIsolation(sample.cliKind);

      if (groupBy === "cli") {
        key = sample.cliKind;
        label = getCliLabel(sample.cliKind);
      } else if (groupBy === "account") {
        key = sample.accountId;
        const matchedAcc = this.accounts.find((a) => a.id === sample.accountId);
        label = matchedAcc ? matchedAcc.label : `Account ${sample.accountId}`;
        isolation = matchedAcc ? matchedAcc.isolation : isolation;
      } else {
        key = sample.agentId || "unassigned";
        label = sample.agentId ? `Agent ${sample.agentId}` : "Unassigned Sessions";
      }

      let item = itemsMap.get(key);
      if (!item) {
        item = {
          key,
          label,
          cliKind,
          accountId,
          agentId,
          isolation,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          runsCount: 0,
          durationSeconds: 0,
        };
        itemsMap.set(key, item);
      }

      item.totalTokens += sample.totalTokens || 0;
      item.inputTokens += sample.inputTokens || 0;
      item.outputTokens += sample.outputTokens || 0;
      item.cachedTokens = (item.cachedTokens || 0) + (sample.cachedTokens || 0);
      item.reasoningTokens = (item.reasoningTokens || 0) + (sample.reasoningTokens || 0);
      item.runsCount += 1;
      item.durationSeconds += Math.max(30, Math.round((sample.totalTokens || 100) / 40));
    }

    const items = Array.from(itemsMap.values());

    const totals = {
      totalTokens: items.reduce((acc, i) => acc + i.totalTokens, 0),
      inputTokens: items.reduce((acc, i) => acc + i.inputTokens, 0),
      outputTokens: items.reduce((acc, i) => acc + i.outputTokens, 0),
      cachedTokens: items.reduce((acc, i) => acc + (i.cachedTokens || 0), 0),
      reasoningTokens: items.reduce((acc, i) => acc + (i.reasoningTokens || 0), 0),
      runsCount: items.reduce((acc, i) => acc + i.runsCount, 0),
      durationSeconds: items.reduce((acc, i) => acc + i.durationSeconds, 0),
    };

    return {
      success: true,
      range,
      groupBy,
      items,
      totals,
    };
  }

  public getUsageQuota(query: UsageQuotaQuery): UsageQuotaResponse {
    let accounts = [...this.accounts];
    let windows = [...this.quotaWindows];

    if (query.accountId) {
      accounts = accounts.filter((a) => a.id === query.accountId);
      windows = windows.filter((w) => w.accountId === query.accountId);
    }
    if (query.cliKind) {
      accounts = accounts.filter((a) => a.cliKind === query.cliKind);
      const matchingAccountIds = new Set(accounts.map((a) => a.id));
      windows = windows.filter((w) => matchingAccountIds.has(w.accountId));
    }

    const items = accounts.map((acc) => ({
      account: acc,
      windows: windows.filter((w) => w.accountId === acc.id),
    }));

    return {
      success: true,
      accounts,
      windows,
      items,
    };
  }

  public recordUsageSample(sample: UsageSample): void {
    this.usageSamples.unshift(sample);
    this.emitUsageUpdated({
      accountId: sample.accountId,
      cliKind: sample.cliKind,
      sample,
      timestamp: new Date().toISOString(),
    });
  }

  public updateQuotaWindows(windows: QuotaWindow[]): void {
    for (const qw of windows) {
      const idx = this.quotaWindows.findIndex((w) => w.accountId === qw.accountId && w.windowKind === qw.windowKind);
      if (idx >= 0) {
        this.quotaWindows[idx] = qw;
      } else {
        this.quotaWindows.push(qw);
      }
    }
  }

  /* ======================================================================== */
  /* Conductor State, Kill-Switch & Failover                                   */
  /* ======================================================================== */

  public getConductorStatus(): ConductorStatusResponse {
    const isPaused =
      this.config.killSwitch ||
      this.runtimes.every((r) => r.state === "unavailable" || r.state === "cooldown" || r.state === "paused");

    return {
      success: true,
      config: { ...this.config, paidApiFallback: false },
      runtimes: [...this.runtimes],
      activeTransfers: this.transfers.filter((t) => t.status === "pending" || t.status === "in_progress"),
      recentEvents: this.events.slice(0, 50),
      isPaused,
      activeKillSwitch: this.config.killSwitch,
    };
  }

  public async getConductorStatusAsync(): Promise<ConductorStatusResponse> {
    if (this.supervisor) {
      try {
        const supStatus = await this.supervisor.getStatus();
        const activeTransfers = await this.supervisor.store.listTransfers();
        const recentEvents = await this.supervisor.store.listEvents({ limit: 50 });
        const isPaused = supStatus.systemState === "paused" || supStatus.killSwitch.engaged;

        return {
          success: true,
          config: { ...supStatus.config, paidApiFallback: false },
          runtimes: supStatus.runtimes,
          activeTransfers: activeTransfers.filter((t) => t.status === "pending" || t.status === "in_progress"),
          recentEvents,
          isPaused,
          activeKillSwitch: supStatus.killSwitch.engaged,
        };
      } catch (err) {
        console.warn("[ConductorService] Error fetching status from supervisor, fallback to in-memory:", err);
      }
    }
    return this.getConductorStatus();
  }

  public killConductor(reason?: string): ConductorKillResponse {
    const timestamp = new Date().toISOString();
    this.config.killSwitch = true;
    this.config.updatedAt = timestamp;

    const event: ConductorEvent = {
      id: `evt_kill_${Date.now()}`,
      eventType: "kill_switch_engaged",
      severity: "critical",
      message: reason || "Conductor kill-switch engaged manually",
      payload: { reason, killSwitch: true },
      createdAt: timestamp,
    };
    this.emitConductorEvent(event);

    return {
      success: true,
      killSwitch: true,
      message: reason || "Conductor kill switch engaged. Automated claims and handoffs halted.",
      timestamp,
    };
  }

  public async killConductorAsync(reason?: string): Promise<ConductorKillResponse> {
    if (this.supervisor) {
      try {
        await this.supervisor.kill(reason);
      } catch (err) {
        console.warn("[ConductorService] Error delegating kill to supervisor:", err);
      }
    }
    return this.killConductor(reason);
  }

  public resumeConductor(reason?: string): ConductorResumeResponse {
    const timestamp = new Date().toISOString();
    this.config.killSwitch = false;
    this.config.updatedAt = timestamp;

    const event: ConductorEvent = {
      id: `evt_resume_${Date.now()}`,
      eventType: "kill_switch_resumed",
      severity: "info",
      message: reason || "Conductor resumed manually",
      payload: { reason, killSwitch: false },
      createdAt: timestamp,
    };
    this.emitConductorEvent(event);

    return {
      success: true,
      killSwitch: false,
      message: reason || "Conductor resumed successfully. Operational claims and handoffs active.",
      timestamp,
    };
  }

  public async resumeConductorAsync(reason?: string): Promise<ConductorResumeResponse> {
    if (this.supervisor) {
      try {
        await this.supervisor.resume(reason);
      } catch (err) {
        console.warn("[ConductorService] Error delegating resume to supervisor:", err);
      }
    }
    return this.resumeConductor(reason);
  }

  public handoffTask(taskId: string, targetRuntime?: string, reason?: string): ConductorHandoffResponse {
    const timestamp = new Date().toISOString();
    const fromRuntime = this.config.primary || "codex";
    const toRuntime = targetRuntime || this.config.standby || "claude";

    const checkpoint: Checkpoint = {
      id: `cp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      swarmTaskId: taskId,
      fromRuntime,
      summary: reason || `Manual handoff initiated for task ${taskId}`,
      filesTouched: [],
      nextSteps: `Resume task execution on standby runtime ${toRuntime}`,
      createdAt: timestamp,
    };
    this.checkpoints.push(checkpoint);

    const transferKey = computeTransferKey(taskId, fromRuntime, toRuntime, checkpoint.id);

    const existing = this.transfers.find((t) => t.transferKey === transferKey);
    if (existing) {
      return {
        success: true,
        taskId,
        transfer: existing,
        checkpoint,
        message: `Existing transfer reused via deduplication key ${transferKey.slice(0, 12)}...`,
      };
    }

    const transfer: Transfer = {
      id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      swarmTaskId: taskId,
      transferKey,
      fromRuntime,
      toRuntime,
      checkpointId: checkpoint.id,
      reason: reason || `Manual handoff from ${fromRuntime} to ${toRuntime}`,
      status: "in_progress",
      createdAt: timestamp,
    };
    this.transfers.push(transfer);

    const event: ConductorEvent = {
      id: `evt_handoff_${Date.now()}`,
      taskId,
      eventType: "handoff_triggered",
      severity: "warn",
      message: `Handoff triggered for task ${taskId}: ${fromRuntime} -> ${toRuntime}`,
      payload: {
        taskId,
        fromRuntime,
        toRuntime,
        transferKey,
        checkpointId: checkpoint.id,
        reason,
      },
      createdAt: timestamp,
    };
    this.emitConductorEvent(event);

    return {
      success: true,
      taskId,
      transfer,
      checkpoint,
      message: `Task ${taskId} successfully transferred from ${fromRuntime} to ${toRuntime}`,
    };
  }

  public async handoffTaskAsync(
    taskId: string,
    targetRuntime?: string,
    reason?: string
  ): Promise<ConductorHandoffResponse> {
    if (this.supervisor) {
      try {
        const transRes = await this.supervisor.triggerManualHandoff(taskId, targetRuntime, reason);
        if (transRes.transferId) {
          const transfer = await this.supervisor.store.getTransfer(transRes.transferId);
          const checkpoint = transRes.checkpointId
            ? await this.supervisor.store.getCheckpoint(transRes.checkpointId)
            : null;
          if (transfer) {
            return {
              success: true,
              taskId,
              transfer,
              checkpoint: checkpoint ?? undefined,
              message: `Task ${taskId} handed off via ConductorSupervisor`,
            };
          }
        }
      } catch (err) {
        console.warn("[ConductorService] Error delegating handoff to supervisor, fallback to in-memory:", err);
      }
    }
    return this.handoffTask(taskId, targetRuntime, reason);
  }

  public getEvents(filter?: { severity?: ConductorEventSeverity; taskId?: string; limit?: number }): ConductorEvent[] {
    let list = [...this.events];
    if (filter?.severity) {
      list = list.filter((e) => e.severity === filter.severity);
    }
    if (filter?.taskId) {
      list = list.filter((e) => e.taskId === filter.taskId);
    }
    const limit = filter?.limit || 50;
    return list.slice(0, limit);
  }

  public getAccounts(): CliAccount[] {
    return [...this.accounts];
  }

  public getQuotaWindows(): QuotaWindow[] {
    return [...this.quotaWindows];
  }

  public getConfig(): ConductorConfig {
    return { ...this.config, paidApiFallback: false };
  }
}

/**
 * Singleton instance of ConductorService for route handlers and MCP tools.
 */
export const conductorService = new ConductorService();
