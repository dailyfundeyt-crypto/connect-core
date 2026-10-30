/**
 * Conductor State Machine & Failure Classifier.
 *
 * Implements FounderOS-style supervisor state transitions:
 * - running --fail--> classify: quota | auth | network | task | unknown
 * - quota: runtime -> cooldown (30 min or resets_at), checkpoint, transfer -> standby
 * - auth: runtime -> auth_error, critical alert "Login nötig", transfer -> standby
 * - network: retry with backoff, NO handoff before 2 consecutive failures
 * - task: NO failover (error belongs to task) -> failed
 * - unknown: 1 retry, then handoff without cooldown extension
 * - No ping-pong: running tasks remain with current owner when primary recovers
 * - Strict paid-api forbid
 */

import { randomUUID } from "node:crypto";
import {
  type Checkpoint,
  type FailureClass,
  type RuntimeState,
  type Transfer,
} from "../contracts/conductor/types";
import { type CheckpointManager, type CreateCheckpointParams } from "./checkpoint";
import { type Clock, RealClock } from "./clock";
import { assertConductorActive } from "./kill-switch";
import { PaidApiFallbackForbiddenError, type ConductorStore } from "./store";
import type { TransferManager } from "./transfer";

export interface ClassifiedFailure {
  failureClass: FailureClass;
  message: string;
  resetsAt?: number | string | null;
  rawError?: unknown;
}

export function classifyFailure(error: unknown): ClassifiedFailure {
  let message = "";
  if (typeof error === "string") {
    message = error;
  } else if (error instanceof Error) {
    message = `${error.name}: ${error.message}`;
  } else if (error && typeof error === "object") {
    message = (error as any).message ?? (error as any).error ?? JSON.stringify(error);
  } else {
    message = String(error);
  }

  const lower = message.toLowerCase();

  // 1. Quota / Rate limit detection
  if (
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("usage limit reached") ||
    lower.includes("resource_exhausted") ||
    lower.includes("429") ||
    lower.includes("tokens exhausted") ||
    lower.includes("credits exhausted") ||
    lower.includes("insufficient_quota")
  ) {
    let resetsAt: number | string | null = null;

    // Check if error object explicitly provides resets_at
    if (error && typeof error === "object") {
      const explicitReset = (error as any).resets_at ?? (error as any).resetsAt ?? (error as any).reset_time;
      if (explicitReset) {
        resetsAt = explicitReset;
      }
    }

    // Try parsing "resets at <epoch/iso>" or "in X minutes" from string
    if (!resetsAt) {
      const matchEpoch = message.match(/resets\s+(?:at\s+)?(\d{10,13})/i);
      if (matchEpoch) {
        resetsAt = Number(matchEpoch[1]);
      }
    }

    return {
      failureClass: "quota",
      message,
      resetsAt,
      rawError: error,
    };
  }

  // 2. Auth error detection
  if (
    lower.includes("unauthorized") ||
    lower.includes("401") ||
    lower.includes("invalid token") ||
    lower.includes("token expired") ||
    lower.includes("authentication failed") ||
    lower.includes("login nötig") ||
    lower.includes("login required") ||
    lower.includes("auth error")
  ) {
    return {
      failureClass: "auth",
      message,
      rawError: error,
    };
  }

  // 3. Network error detection
  if (
    lower.includes("econnrefused") ||
    lower.includes("etimedout") ||
    lower.includes("socket hang up") ||
    lower.includes("network error") ||
    lower.includes("fetch failed") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("bad gateway") ||
    lower.includes("gateway timeout") ||
    lower.includes("enotfound")
  ) {
    return {
      failureClass: "network",
      message,
      rawError: error,
    };
  }

  // 4. Task error detection (task-level syntax/type/assertion failures - no failover)
  if (
    lower.includes("syntax error") ||
    lower.includes("syntaxerror") ||
    lower.includes("typeerror") ||
    lower.includes("type error") ||
    lower.includes("assertion failed") ||
    lower.includes("assertionerror") ||
    lower.includes("invalid parameter") ||
    lower.includes("validation failed") ||
    lower.includes("task error") ||
    lower.includes("user cancelled") ||
    lower.includes("task failed")
  ) {
    return {
      failureClass: "task",
      message,
      rawError: error,
    };
  }

  // 5. Default: unknown
  return {
    failureClass: "unknown",
    message,
    rawError: error,
  };
}

export interface TransitionContext {
  summary?: string;
  filesTouched?: string[];
  nextSteps?: string;
  leaseDurationMs?: number;
}

export interface TransitionResult {
  handled: boolean;
  handoff: boolean;
  retry: boolean;
  failed: boolean;
  failureClass: FailureClass;
  currentOwner: string;
  newOwner?: string;
  transferId?: string;
  transfer?: Transfer;
  checkpointId?: string;
  checkpoint?: Checkpoint;
  cooldownUntil?: string | null;
  message: string;
}

export class ConductorStateMachine {
  constructor(
    private readonly store: ConductorStore,
    private readonly checkpoints: CheckpointManager,
    private readonly transfers: TransferManager,
    private readonly clock: Clock = new RealClock(),
  ) {}

  /**
   * Main failure handler called when a task encounters an error.
   */
  async handleTaskFailure(
    taskId: string,
    currentRuntime: string,
    error: unknown,
    context?: TransitionContext,
  ): Promise<TransitionResult> {
    const config = await this.store.getConfig();
    assertConductorActive(config);

    if (config.paidApiFallback) {
      throw new PaidApiFallbackForbiddenError();
    }

    const classified = classifyFailure(error);
    const now = this.clock.now();
    const primary = config.primary;
    const standby = config.standby;
    const targetRuntime = currentRuntime === primary ? standby : primary;

    // Fetch current runtime status
    let currentStatus = await this.store.getRuntimeStatus(currentRuntime);
    if (!currentStatus) {
      currentStatus = await this.store.upsertRuntimeStatus({
        runtimeId: currentRuntime,
        cliKind: (currentRuntime === "claude" || currentRuntime === "codex" ? currentRuntime : config.primary) as any,
        accountId: `${currentRuntime}-default`,
        state: "available",
        consecutiveFailures: 0,
        activeClaimsCount: 0,
      });
    }

    switch (classified.failureClass) {
      case "quota": {
        // 1. Calculate cooldown
        let cooldownUntilMs: number;
        if (classified.resetsAt) {
          const resetNum = typeof classified.resetsAt === "number"
            ? (classified.resetsAt > 10_000_000_000 ? classified.resetsAt : classified.resetsAt * 1000)
            : new Date(classified.resetsAt).getTime();
          cooldownUntilMs = Math.max(resetNum, now + 60_000); // At least 1 min in future
        } else {
          cooldownUntilMs = now + (config.cooldownMin ?? 30) * 60 * 1000;
        }

        const cooldownIso = new Date(cooldownUntilMs).toISOString();

        // 2. Put current runtime into cooldown
        currentStatus.state = "cooldown";
        currentStatus.lastFailureClass = "quota";
        currentStatus.cooldownUntil = cooldownIso;
        currentStatus.consecutiveFailures += 1;
        await this.store.upsertRuntimeStatus(currentStatus);

        await this.store.insertEvent({
          id: `evt_${randomUUID()}`,
          taskId,
          eventType: "conductor.runtime.cooldown",
          severity: "warn",
          message: `Runtime '${currentRuntime}' placed into cooldown until ${cooldownIso} due to quota limit.`,
          payload: { runtimeId: currentRuntime, cooldownUntil: cooldownIso },
          createdAt: new Date(now).toISOString(),
        });

        // 3. Create Checkpoint
        const checkpoint = await this.checkpoints.createCheckpoint({
          taskId,
          fromRuntime: currentRuntime,
          summary: context?.summary ?? `Quota exhausted on ${currentRuntime}: ${classified.message}`,
          filesTouched: context?.filesTouched ?? [],
          nextSteps: context?.nextSteps ?? "Resume task execution on standby runtime.",
          createdAt: new Date(now).toISOString(),
        });

        // 4. Create Transfer & swap claim to standby
        const transferRes = await this.transfers.createTransfer({
          taskId,
          fromRuntime: currentRuntime,
          toRuntime: targetRuntime,
          checkpointId: checkpoint.id,
          reason: `Quota failover: ${classified.message}`,
          leaseDurationMs: context?.leaseDurationMs,
        });

        return {
          handled: true,
          handoff: true,
          retry: false,
          failed: false,
          failureClass: "quota",
          currentOwner: currentRuntime,
          newOwner: targetRuntime,
          transferId: transferRes.transfer.id,
          transfer: transferRes.transfer,
          checkpointId: checkpoint.id,
          checkpoint,
          cooldownUntil: cooldownIso,
          message: `Quota failover from '${currentRuntime}' to '${targetRuntime}' completed.`,
        };
      }

      case "auth": {
        // 1. Runtime goes to auth_error
        currentStatus.state = "auth_error";
        currentStatus.lastFailureClass = "auth";
        currentStatus.consecutiveFailures += 1;
        await this.store.upsertRuntimeStatus(currentStatus);

        // 2. Critical Alert: Login required
        await this.store.insertEvent({
          id: `evt_${randomUUID()}`,
          taskId,
          eventType: "conductor.auth_required",
          severity: "critical",
          message: `CRITICAL ALERT: Login nötig für ${currentRuntime} (${classified.message}).`,
          payload: { runtimeId: currentRuntime, error: classified.message },
          createdAt: new Date(now).toISOString(),
        });

        // 3. Checkpoint + Transfer to standby
        const checkpoint = await this.checkpoints.createCheckpoint({
          taskId,
          fromRuntime: currentRuntime,
          summary: context?.summary ?? `Auth error on ${currentRuntime}: ${classified.message}`,
          filesTouched: context?.filesTouched ?? [],
          nextSteps: context?.nextSteps ?? "Resume task execution on standby runtime after auth failure.",
          createdAt: new Date(now).toISOString(),
        });

        const transferRes = await this.transfers.createTransfer({
          taskId,
          fromRuntime: currentRuntime,
          toRuntime: targetRuntime,
          checkpointId: checkpoint.id,
          reason: `Auth failover: ${classified.message}`,
          leaseDurationMs: context?.leaseDurationMs,
        });

        return {
          handled: true,
          handoff: true,
          retry: false,
          failed: false,
          failureClass: "auth",
          currentOwner: currentRuntime,
          newOwner: targetRuntime,
          transferId: transferRes.transfer.id,
          transfer: transferRes.transfer,
          checkpointId: checkpoint.id,
          checkpoint,
          message: `Auth failover from '${currentRuntime}' to '${targetRuntime}' completed.`,
        };
      }

      case "network": {
        currentStatus.consecutiveFailures += 1;
        currentStatus.lastFailureClass = "network";
        await this.store.upsertRuntimeStatus(currentStatus);

        // Requirement: Retry with backoff, NO handoff before 2 consecutive failures
        if (currentStatus.consecutiveFailures < 2) {
          await this.store.insertEvent({
            id: `evt_${randomUUID()}`,
            taskId,
            eventType: "conductor.network.retry",
            severity: "warn",
            message: `Network glitch on '${currentRuntime}' (attempt ${currentStatus.consecutiveFailures}). Retrying without handoff.`,
            payload: { consecutiveFailures: currentStatus.consecutiveFailures },
            createdAt: new Date(now).toISOString(),
          });

          return {
            handled: true,
            handoff: false,
            retry: true,
            failed: false,
            failureClass: "network",
            currentOwner: currentRuntime,
            message: `Network retry scheduled for '${currentRuntime}'. No handoff.`,
          };
        }

        // 2 or more consecutive network failures -> handoff to standby
        const checkpoint = await this.checkpoints.createCheckpoint({
          taskId,
          fromRuntime: currentRuntime,
          summary: context?.summary ?? `Persistent network error on ${currentRuntime}: ${classified.message}`,
          filesTouched: context?.filesTouched ?? [],
          nextSteps: context?.nextSteps ?? "Resume task execution on standby runtime after network failure.",
          createdAt: new Date(now).toISOString(),
        });

        const transferRes = await this.transfers.createTransfer({
          taskId,
          fromRuntime: currentRuntime,
          toRuntime: targetRuntime,
          checkpointId: checkpoint.id,
          reason: `Network failover after ${currentStatus.consecutiveFailures} consecutive failures: ${classified.message}`,
          leaseDurationMs: context?.leaseDurationMs,
        });

        return {
          handled: true,
          handoff: true,
          retry: false,
          failed: false,
          failureClass: "network",
          currentOwner: currentRuntime,
          newOwner: targetRuntime,
          transferId: transferRes.transfer.id,
          transfer: transferRes.transfer,
          checkpointId: checkpoint.id,
          checkpoint,
          message: `Network failover to '${targetRuntime}' completed.`,
        };
      }

      case "task": {
        // Requirement: NO failover for task errors (error belongs to task) -> failed + result
        await this.store.insertEvent({
          id: `evt_${randomUUID()}`,
          taskId,
          eventType: "conductor.task.failed",
          severity: "error",
          message: `Task error on '${currentRuntime}' for task '${taskId}': ${classified.message}. No failover.`,
          payload: { error: classified.message, failureClass: "task" },
          createdAt: new Date(now).toISOString(),
        });

        await this.store.releaseClaim(taskId, currentRuntime);

        return {
          handled: true,
          handoff: false,
          retry: false,
          failed: true,
          failureClass: "task",
          currentOwner: currentRuntime,
          message: `Task '${taskId}' failed permanently due to task-level error. No failover triggered.`,
        };
      }

      case "unknown":
      default: {
        currentStatus.consecutiveFailures += 1;
        currentStatus.lastFailureClass = "unknown";
        await this.store.upsertRuntimeStatus(currentStatus);

        // 1 retry for unknown errors
        if (currentStatus.consecutiveFailures < 2) {
          await this.store.insertEvent({
            id: `evt_${randomUUID()}`,
            taskId,
            eventType: "conductor.unknown.retry",
            severity: "warn",
            message: `Unknown error on '${currentRuntime}'. Attempting 1 retry before handoff.`,
            payload: { error: classified.message },
            createdAt: new Date(now).toISOString(),
          });

          return {
            handled: true,
            handoff: false,
            retry: true,
            failed: false,
            failureClass: "unknown",
            currentOwner: currentRuntime,
            message: `1 retry allowed for unknown error on '${currentRuntime}'.`,
          };
        }

        // Repeated unknown error -> handoff to standby without cooldown extension
        const checkpoint = await this.checkpoints.createCheckpoint({
          taskId,
          fromRuntime: currentRuntime,
          summary: context?.summary ?? `Repeated unknown error on ${currentRuntime}: ${classified.message}`,
          filesTouched: context?.filesTouched ?? [],
          nextSteps: context?.nextSteps ?? "Resume task execution on standby runtime.",
          createdAt: new Date(now).toISOString(),
        });

        const transferRes = await this.transfers.createTransfer({
          taskId,
          fromRuntime: currentRuntime,
          toRuntime: targetRuntime,
          checkpointId: checkpoint.id,
          reason: `Repeated unknown error failover: ${classified.message}`,
          leaseDurationMs: context?.leaseDurationMs,
        });

        return {
          handled: true,
          handoff: true,
          retry: false,
          failed: false,
          failureClass: "unknown",
          currentOwner: currentRuntime,
          newOwner: targetRuntime,
          transferId: transferRes.transfer.id,
          transfer: transferRes.transfer,
          checkpointId: checkpoint.id,
          checkpoint,
          message: `Unknown error failover to '${targetRuntime}' completed without cooldown extension.`,
        };
      }
    }
  }

  /**
   * Evaluates which runtime should claim a NEW task.
   * Enforces NO PING-PONG: laufende Tasks bleibe beim aktuellen Owner!
   */
  async selectRuntimeForNewTask(): Promise<string | null> {
    const config = await this.store.getConfig();
    assertConductorActive(config);

    const primaryStatus = await this.store.getRuntimeStatus(config.primary);
    if (!primaryStatus || primaryStatus.state === "available") {
      return config.primary;
    }

    const standbyStatus = await this.store.getRuntimeStatus(config.standby);
    if (standbyStatus && standbyStatus.state === "available") {
      return config.standby;
    }

    return null; // Both runtimes down
  }
}
