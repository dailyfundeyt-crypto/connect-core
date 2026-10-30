/**
 * Conductor Supervisor.
 *
 * Central coordinator for runtime health, failover state machine, single-owner claims,
 * checkpoints, and transfers.
 *
 * Strictly exports the `conductorHooks` interface without modifying `swarm-controller.ts`.
 */

import { randomUUID } from "node:crypto";
import {
  type ConductorConfig,
  type ConductorEvent,
  type ConductorRuntimeStatus,
  DEFAULT_CONDUCTOR_CONFIG,
  type RuntimeState,
} from "../contracts/conductor/types";
import { CheckpointManager } from "./checkpoint";
import { type Clock, RealClock } from "./clock";
import { evaluateKillSwitch, isKillSwitchEngaged, type KillSwitchStatus } from "./kill-switch";
import { ConductorProbe } from "./probe";
import { ConductorStateMachine, type TransitionResult } from "./state-machine";
import { InMemoryConductorStore, type ConductorStore } from "./store";
import { TransferManager } from "./transfer";

export interface ConductorSupervisorOptions {
  store?: ConductorStore;
  clock?: Clock;
  autoStart?: boolean;
}

export interface ConductorHooks {
  onTaskQueued(taskId: string, context?: Record<string, unknown>): Promise<void>;
  onTaskClaim(taskId: string, botId: string, leaseDurationMs?: number): Promise<boolean>;
  onTaskFailure(
    taskId: string,
    error: unknown,
    context?: Record<string, unknown>,
  ): Promise<{ handoff: boolean; newOwner?: string; retry?: boolean }>;
  onTaskSuccess(taskId: string, result: unknown, context?: Record<string, unknown>): Promise<void>;
}

export class ConductorSupervisor {
  readonly store: ConductorStore;
  readonly clock: Clock;
  readonly checkpoints: CheckpointManager;
  readonly transfers: TransferManager;
  readonly probe: ConductorProbe;
  readonly stateMachine: ConductorStateMachine;

  private eventListeners: Array<(event: ConductorEvent) => void> = [];

  constructor(options: ConductorSupervisorOptions = {}) {
    this.clock = options.clock ?? new RealClock();
    this.store = options.store ?? new InMemoryConductorStore();
    this.checkpoints = new CheckpointManager(this.store);
    this.transfers = new TransferManager(this.store);
    this.probe = new ConductorProbe(this.store, this.clock, (alert) => {
      this.notifyListeners({
        id: `evt_${randomUUID()}`,
        eventType: alert.type,
        severity: alert.severity as any,
        message: alert.message,
        createdAt: new Date(this.clock.now()).toISOString(),
      });
    });
    this.stateMachine = new ConductorStateMachine(
      this.store,
      this.checkpoints,
      this.transfers,
      this.clock,
    );

    if (options.autoStart) {
      this.start();
    }
  }

  start(): void {
    this.probe.start();
  }

  stop(): void {
    this.probe.stop();
  }

  getKillSwitchStatus(): KillSwitchStatus {
    return evaluateKillSwitch();
  }

  async kill(reason = "Kill-switch manually triggered via API"): Promise<void> {
    await this.store.updateConfig({ killSwitch: true });
    await this.store.insertEvent({
      id: `evt_${randomUUID()}`,
      eventType: "conductor.kill_switch.engaged",
      severity: "warn",
      message: `Kill-switch engaged: ${reason}`,
      createdAt: new Date(this.clock.now()).toISOString(),
    });
  }

  async resume(reason = "Conductor resumed via API"): Promise<void> {
    await this.store.updateConfig({ killSwitch: false, enabled: true });
    this.probe.setPaused(false);
    await this.store.insertEvent({
      id: `evt_${randomUUID()}`,
      eventType: "conductor.resumed",
      severity: "info",
      message: `Conductor resumed: ${reason}`,
      createdAt: new Date(this.clock.now()).toISOString(),
    });
  }

  async getStatus(): Promise<{
    config: ConductorConfig;
    systemState: RuntimeState;
    killSwitch: KillSwitchStatus;
    runtimes: ConductorRuntimeStatus[];
  }> {
    const config = await this.store.getConfig();
    const killSwitch = evaluateKillSwitch(config);
    let runtimes = await this.store.getAllRuntimeStatuses();

    // Default primary/standby runtimes if not initialized
    if (!runtimes.some((r) => r.runtimeId === config.primary)) {
      await this.store.upsertRuntimeStatus({
        runtimeId: config.primary,
        cliKind: config.primary,
        accountId: `${config.primary}-default`,
        state: "available",
        consecutiveFailures: 0,
        activeClaimsCount: 0,
      });
    }
    if (!runtimes.some((r) => r.runtimeId === config.standby)) {
      await this.store.upsertRuntimeStatus({
        runtimeId: config.standby,
        cliKind: config.standby,
        accountId: `${config.standby}-default`,
        state: "available",
        consecutiveFailures: 0,
        activeClaimsCount: 0,
      });
    }

    runtimes = await this.store.getAllRuntimeStatuses();

    let systemState: RuntimeState = "available";
    if (killSwitch.engaged) {
      systemState = "paused";
    } else if (this.probe.paused) {
      systemState = "paused";
    } else {
      const primaryStatus = runtimes.find((r) => r.runtimeId === config.primary);
      const standbyStatus = runtimes.find((r) => r.runtimeId === config.standby);
      if (primaryStatus?.state !== "available" && standbyStatus?.state !== "available") {
        systemState = "paused";
      }
    }

    return {
      config,
      systemState,
      killSwitch,
      runtimes,
    };
  }

  async triggerManualHandoff(
    taskId: string,
    targetRuntime?: string,
    reason = "Manual operator handoff",
  ): Promise<TransitionResult> {
    const claim = await this.store.getActiveClaim(taskId);
    const currentRuntime = claim?.botId ?? "codex";
    const config = await this.store.getConfig();
    const resolvedTarget = targetRuntime ?? (currentRuntime === config.primary ? config.standby : config.primary);

    const checkpoint = await this.checkpoints.createCheckpoint({
      taskId,
      fromRuntime: currentRuntime,
      summary: reason,
      filesTouched: [],
      nextSteps: "Proceed with task execution on target runtime.",
      createdAt: new Date(this.clock.now()).toISOString(),
    });

    const transferRes = await this.transfers.createTransfer({
      taskId,
      fromRuntime: currentRuntime,
      toRuntime: resolvedTarget,
      checkpointId: checkpoint.id,
      reason,
    });

    return {
      handled: true,
      handoff: true,
      retry: false,
      failed: false,
      failureClass: "unknown",
      currentOwner: currentRuntime,
      newOwner: resolvedTarget,
      transferId: transferRes.transfer.id,
      transfer: transferRes.transfer,
      checkpointId: checkpoint.id,
      checkpoint,
      message: `Manual handoff to '${resolvedTarget}' executed successfully.`,
    };
  }

  /**
   * Conductor Hooks Interface implementation.
   * Can be hooked into swarm-controller or runner without modifying swarm files directly.
   */
  get hooks(): ConductorHooks {
    return {
      onTaskQueued: async (taskId: string, context?: Record<string, unknown>): Promise<void> => {
        await this.store.insertEvent({
          id: `evt_${randomUUID()}`,
          taskId,
          eventType: "conductor.task.queued",
          severity: "info",
          message: `Task '${taskId}' registered with Conductor queue.`,
          payload: context,
          createdAt: new Date(this.clock.now()).toISOString(),
        });
      },

      onTaskClaim: async (
        taskId: string,
        botId: string,
        leaseDurationMs = 300_000,
      ): Promise<boolean> => {
        const config = await this.store.getConfig();
        if (isKillSwitchEngaged(config)) {
          return false;
        }

        try {
          await this.store.createClaim(taskId, botId, leaseDurationMs);
          return true;
        } catch (err) {
          console.warn(`Claim rejected for task '${taskId}' by bot '${botId}':`, (err as any).message);
          return false;
        }
      },

      onTaskFailure: async (
        taskId: string,
        error: unknown,
        context?: Record<string, unknown>,
      ): Promise<{ handoff: boolean; newOwner?: string; retry?: boolean }> => {
        const config = await this.store.getConfig();
        if (isKillSwitchEngaged(config)) {
          return { handoff: false, retry: false };
        }

        const claim = await this.store.getActiveClaim(taskId);
        const currentRuntime = claim?.botId ?? config.primary;

        const result = await this.stateMachine.handleTaskFailure(
          taskId,
          currentRuntime,
          error,
          {
            summary: context?.summary as string,
            filesTouched: context?.filesTouched as string[],
            nextSteps: context?.nextSteps as string,
          },
        );

        return {
          handoff: result.handoff,
          newOwner: result.newOwner,
          retry: result.retry,
        };
      },

      onTaskSuccess: async (taskId: string, result: unknown, context?: Record<string, unknown>): Promise<void> => {
        const claim = await this.store.getActiveClaim(taskId);
        if (claim) {
          await this.store.releaseClaim(taskId, claim.botId);
        }
        await this.store.insertEvent({
          id: `evt_${randomUUID()}`,
          taskId,
          eventType: "conductor.task.completed",
          severity: "info",
          message: `Task '${taskId}' finished successfully. Claim released.`,
          payload: { resultSummary: typeof result === "object" ? "ok" : String(result), ...context },
          createdAt: new Date(this.clock.now()).toISOString(),
        });
      },
    };
  }

  subscribeEvents(listener: (event: ConductorEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(event: ConductorEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in conductor event listener:", err);
      }
    }
  }
}

/** Global singleton instance */
let globalConductorSupervisor: ConductorSupervisor | null = null;

export function getConductorSupervisor(options?: ConductorSupervisorOptions): ConductorSupervisor {
  if (!globalConductorSupervisor) {
    globalConductorSupervisor = new ConductorSupervisor(options);
  }
  return globalConductorSupervisor;
}

export function resetConductorSupervisor(): void {
  if (globalConductorSupervisor) {
    globalConductorSupervisor.stop();
    globalConductorSupervisor = null;
  }
}

/** Exported hooks singleton for integration */
export const conductorHooks: ConductorHooks = {
  onTaskQueued: (taskId, ctx) => getConductorSupervisor().hooks.onTaskQueued(taskId, ctx),
  onTaskClaim: (taskId, bot, lease) => getConductorSupervisor().hooks.onTaskClaim(taskId, bot, lease),
  onTaskFailure: (taskId, err, ctx) => getConductorSupervisor().hooks.onTaskFailure(taskId, err, ctx),
  onTaskSuccess: (taskId, res, ctx) => getConductorSupervisor().hooks.onTaskSuccess(taskId, res, ctx),
};
