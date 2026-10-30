/**
 * Conductor Storage Abstraction & Implementations.
 *
 * Provides both:
 * 1. InMemoryConductorStore (zero-dependency, fast, deterministically simulates Postgres partial unique indexes)
 * 2. DbConductorStore (backed by Postgres and Drizzle ORM)
 */

import { randomUUID } from "node:crypto";
import {
  type Checkpoint,
  type ConductorConfig,
  type ConductorEvent,
  type ConductorRuntimeStatus,
  DEFAULT_CONDUCTOR_CONFIG,
  type Transfer,
  type TransferStatus,
} from "../contracts/conductor/types";
import { and, desc, eq } from "drizzle-orm";
import {
  conductorCheckpoints,
  conductorConfig,
  conductorEvents,
  conductorRuntimeStatus,
  conductorTransfers,
  taskClaims,
  type TaskClaimRecord,
} from "../db/schema/conductor";
import type { Database } from "../db/client";

export class PaidApiFallbackForbiddenError extends Error {
  constructor() {
    super("Paid-API fallback is strictly forbidden by policy and schema constraints (paidApiFallback must be false).");
    this.name = "PaidApiFallbackForbiddenError";
  }
}

export class DuplicateActiveClaimError extends Error {
  constructor(taskId: string) {
    super(`Single Owner violation: Active claim already exists for task '${taskId}' (violates task_claims_active_task_unique_idx).`);
    this.name = "DuplicateActiveClaimError";
  }
}

export class DuplicateTransferKeyError extends Error {
  constructor(key: string) {
    super(`Transfer key '${key}' already exists (violates conductor_transfers_transfer_key_unique).`);
    this.name = "DuplicateTransferKeyError";
  }
}

export interface ConductorStore {
  getConfig(): Promise<ConductorConfig>;
  updateConfig(patch: Partial<ConductorConfig>): Promise<ConductorConfig>;
  getRuntimeStatus(runtimeId: string): Promise<ConductorRuntimeStatus | null>;
  getAllRuntimeStatuses(): Promise<ConductorRuntimeStatus[]>;
  upsertRuntimeStatus(status: ConductorRuntimeStatus): Promise<ConductorRuntimeStatus>;
  insertCheckpoint(checkpoint: Checkpoint): Promise<void>;
  getCheckpoint(id: string): Promise<Checkpoint | null>;
  getLatestCheckpoint(taskId: string): Promise<Checkpoint | null>;
  listCheckpoints(taskId: string): Promise<Checkpoint[]>;
  insertTransfer(transfer: Transfer): Promise<void>;
  getTransfer(id: string): Promise<Transfer | null>;
  getTransferByKey(transferKey: string): Promise<Transfer | null>;
  listTransfers(taskId?: string): Promise<Transfer[]>;
  updateTransferStatus(id: string, status: TransferStatus): Promise<void>;
  getActiveClaim(taskId: string): Promise<TaskClaimRecord | null>;
  createClaim(taskId: string, botId: string, leaseDurationMs: number): Promise<TaskClaimRecord>;
  swapClaim(taskId: string, oldBotId: string | null, newBotId: string, leaseDurationMs: number): Promise<TaskClaimRecord>;
  releaseClaim(taskId: string, botId?: string): Promise<void>;
  insertEvent(event: ConductorEvent): Promise<void>;
  listEvents(query?: { limit?: number; taskId?: string; eventType?: string }): Promise<ConductorEvent[]>;
  getEvents(limit?: number): Promise<ConductorEvent[]>;
  getActiveTransfers(): Promise<Transfer[]>;
}

export class InMemoryConductorStore implements ConductorStore {
  private config: ConductorConfig = { ...DEFAULT_CONDUCTOR_CONFIG };
  private runtimeStatuses = new Map<string, ConductorRuntimeStatus>();
  private checkpoints = new Map<string, Checkpoint>();
  private transfers = new Map<string, Transfer>();
  private transfersByKey = new Map<string, Transfer>();
  private claims = new Map<string, TaskClaimRecord>();
  private events: ConductorEvent[] = [];

  constructor(initialConfig?: Partial<ConductorConfig>) {
    if (initialConfig) {
      if ((initialConfig as any).paidApiFallback === true) {
        throw new PaidApiFallbackForbiddenError();
      }
      this.config = {
        ...DEFAULT_CONDUCTOR_CONFIG,
        ...initialConfig,
        paidApiFallback: false,
      };
    }
  }

  async getConfig(): Promise<ConductorConfig> {
    return { ...this.config };
  }

  async updateConfig(patch: Partial<ConductorConfig>): Promise<ConductorConfig> {
    if ((patch as any).paidApiFallback === true) {
      throw new PaidApiFallbackForbiddenError();
    }
    this.config = {
      ...this.config,
      ...patch,
      paidApiFallback: false,
      updatedAt: new Date().toISOString(),
    };
    return { ...this.config };
  }

  async getRuntimeStatus(runtimeId: string): Promise<ConductorRuntimeStatus | null> {
    const found = this.runtimeStatuses.get(runtimeId);
    return found ? { ...found } : null;
  }

  async getAllRuntimeStatuses(): Promise<ConductorRuntimeStatus[]> {
    return Array.from(this.runtimeStatuses.values()).map((s) => ({ ...s }));
  }

  async upsertRuntimeStatus(status: ConductorRuntimeStatus): Promise<ConductorRuntimeStatus> {
    const updated = {
      ...status,
      updatedAt: status.updatedAt ?? new Date().toISOString(),
    };
    this.runtimeStatuses.set(status.runtimeId, updated);
    return { ...updated };
  }

  async insertCheckpoint(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, { ...checkpoint });
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    const c = this.checkpoints.get(id);
    return c ? { ...c } : null;
  }

  async getLatestCheckpoint(taskId: string): Promise<Checkpoint | null> {
    const forTask = Array.from(this.checkpoints.values())
      .filter((c) => c.swarmTaskId === taskId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return forTask[0] ? { ...forTask[0] } : null;
  }

  async listCheckpoints(taskId: string): Promise<Checkpoint[]> {
    return Array.from(this.checkpoints.values())
      .filter((c) => c.swarmTaskId === taskId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((c) => ({ ...c }));
  }

  async insertTransfer(transfer: Transfer): Promise<void> {
    if (this.transfersByKey.has(transfer.transferKey)) {
      throw new DuplicateTransferKeyError(transfer.transferKey);
    }
    const copy = { ...transfer };
    this.transfers.set(transfer.id, copy);
    this.transfersByKey.set(transfer.transferKey, copy);
  }

  async getTransfer(id: string): Promise<Transfer | null> {
    const t = this.transfers.get(id);
    return t ? { ...t } : null;
  }

  async getTransferByKey(transferKey: string): Promise<Transfer | null> {
    const t = this.transfersByKey.get(transferKey);
    return t ? { ...t } : null;
  }

  async listTransfers(taskId?: string): Promise<Transfer[]> {
    return Array.from(this.transfers.values())
      .filter((t) => (!taskId ? true : t.swarmTaskId === taskId))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((t) => ({ ...t }));
  }

  async updateTransferStatus(id: string, status: TransferStatus): Promise<void> {
    const t = this.transfers.get(id);
    if (!t) return;
    t.status = status;
    this.transfersByKey.set(t.transferKey, t);
  }

  async getActiveClaim(taskId: string): Promise<TaskClaimRecord | null> {
    for (const claim of this.claims.values()) {
      if (claim.taskId === taskId && claim.status === "active") {
        return { ...claim };
      }
    }
    return null;
  }

  async createClaim(
    taskId: string,
    botId: string,
    leaseDurationMs: number,
  ): Promise<TaskClaimRecord> {
    // Single Owner guarantee: check synchronously if an active claim already exists
    for (const claim of this.claims.values()) {
      if (claim.taskId === taskId && claim.status === "active") {
        throw new DuplicateActiveClaimError(taskId);
      }
    }

    const now = new Date();
    const leaseExpires = new Date(now.getTime() + leaseDurationMs);

    const claim: TaskClaimRecord = {
      id: `claim_${randomUUID()}`,
      taskId,
      botId,
      ownerId: null,
      claimedAt: now,
      leaseExpiresAt: leaseExpires,
      status: "active",
      heartbeatAt: now,
    };

    this.claims.set(claim.id, claim);
    return { ...claim };
  }

  /**
   * Atomic swap of active claim: release previous active claim + insert new active claim.
   * Simulates a single PostgreSQL transaction with partial unique index.
   */
  async swapClaim(
    taskId: string,
    oldBotId: string | null,
    newBotId: string,
    leaseDurationMs: number,
  ): Promise<TaskClaimRecord> {
    // 1. Release active claim for this task
    for (const [id, claim] of this.claims.entries()) {
      if (claim.taskId === taskId && claim.status === "active") {
        if (!oldBotId || claim.botId === oldBotId) {
          this.claims.set(id, { ...claim, status: "released" });
        }
      }
    }

    // 2. Insert new active claim
    return this.createClaim(taskId, newBotId, leaseDurationMs);
  }

  async releaseClaim(taskId: string, botId?: string): Promise<void> {
    for (const [id, claim] of this.claims.entries()) {
      if (claim.taskId === taskId && claim.status === "active") {
        if (!botId || claim.botId === botId) {
          this.claims.set(id, { ...claim, status: "released" });
        }
      }
    }
  }

  async insertEvent(event: ConductorEvent): Promise<void> {
    this.events.push({ ...event });
  }

  async listEvents(query?: { limit?: number; taskId?: string; eventType?: string }): Promise<ConductorEvent[]> {
    let result = [...this.events];
    if (query?.taskId) {
      result = result.filter((e) => e.taskId === query.taskId);
    }
    if (query?.eventType) {
      result = result.filter((e) => e.eventType === query.eventType);
    }
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (query?.limit && query.limit > 0) {
      result = result.slice(0, query.limit);
    }
    return result;
  }

  async getEvents(limit = 50): Promise<ConductorEvent[]> {
    return this.listEvents({ limit });
  }

  async getActiveTransfers(): Promise<Transfer[]> {
    const all = await this.listTransfers();
    return all.filter((t) => t.status === "pending" || t.status === "in_progress");
  }
}

/**
 * PostgreSQL and Drizzle-backed persistent Conductor Store.
 */
export class DbConductorStore implements ConductorStore {
  constructor(private readonly db: Database) {}

  async getConfig(): Promise<ConductorConfig> {
    const rows = await this.db
      .select()
      .from(conductorConfig)
      .where(eq(conductorConfig.id, "default"))
      .limit(1);
    if (!rows[0]) {
      return { ...DEFAULT_CONDUCTOR_CONFIG };
    }
    const r = rows[0];
    return {
      enabled: r.enabled,
      killSwitch: r.killSwitch,
      primary: r.primary as any,
      standby: r.standby as any,
      cooldownMin: r.cooldownMin,
      pollSec: r.pollSec,
      initialPollSec: r.initialPollSec,
      maxHandoffsPerTask: r.maxHandoffsPerTask,
      paidApiFallback: false,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async updateConfig(patch: Partial<ConductorConfig>): Promise<ConductorConfig> {
    if ((patch as any).paidApiFallback === true) {
      throw new PaidApiFallbackForbiddenError();
    }
    const current = await this.getConfig();
    const updated = {
      ...current,
      ...patch,
      paidApiFallback: false as const,
    };

    await this.db
      .insert(conductorConfig)
      .values({
        id: "default",
        enabled: updated.enabled,
        killSwitch: updated.killSwitch,
        primary: updated.primary,
        standby: updated.standby,
        cooldownMin: updated.cooldownMin,
        pollSec: updated.pollSec,
        initialPollSec: updated.initialPollSec,
        maxHandoffsPerTask: updated.maxHandoffsPerTask,
        paidApiFallback: false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: conductorConfig.id,
        set: {
          enabled: updated.enabled,
          killSwitch: updated.killSwitch,
          primary: updated.primary,
          standby: updated.standby,
          cooldownMin: updated.cooldownMin,
          pollSec: updated.pollSec,
          initialPollSec: updated.initialPollSec,
          maxHandoffsPerTask: updated.maxHandoffsPerTask,
          paidApiFallback: false,
          updatedAt: new Date(),
        },
      });

    return updated;
  }

  async getRuntimeStatus(runtimeId: string): Promise<ConductorRuntimeStatus | null> {
    const rows = await this.db
      .select()
      .from(conductorRuntimeStatus)
      .where(eq(conductorRuntimeStatus.runtimeId, runtimeId))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      runtimeId: r.runtimeId,
      cliKind: r.cliKind as any,
      accountId: r.accountId,
      state: r.state as any,
      lastFailureClass: r.lastFailureClass as any,
      cooldownUntil: r.cooldownUntil?.toISOString() ?? null,
      lastProbeAt: r.lastProbeAt?.toISOString() ?? null,
      consecutiveFailures: r.consecutiveFailures,
      activeClaimsCount: r.activeClaimsCount,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async getAllRuntimeStatuses(): Promise<ConductorRuntimeStatus[]> {
    const rows = await this.db.select().from(conductorRuntimeStatus);
    return rows.map((r) => ({
      runtimeId: r.runtimeId,
      cliKind: r.cliKind as any,
      accountId: r.accountId,
      state: r.state as any,
      lastFailureClass: r.lastFailureClass as any,
      cooldownUntil: r.cooldownUntil?.toISOString() ?? null,
      lastProbeAt: r.lastProbeAt?.toISOString() ?? null,
      consecutiveFailures: r.consecutiveFailures,
      activeClaimsCount: r.activeClaimsCount,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async upsertRuntimeStatus(status: ConductorRuntimeStatus): Promise<ConductorRuntimeStatus> {
    await this.db
      .insert(conductorRuntimeStatus)
      .values({
        runtimeId: status.runtimeId,
        cliKind: status.cliKind,
        accountId: status.accountId,
        state: status.state,
        lastFailureClass: status.lastFailureClass ?? null,
        cooldownUntil: status.cooldownUntil ? new Date(status.cooldownUntil) : null,
        lastProbeAt: status.lastProbeAt ? new Date(status.lastProbeAt) : null,
        consecutiveFailures: status.consecutiveFailures ?? 0,
        activeClaimsCount: status.activeClaimsCount ?? 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: conductorRuntimeStatus.runtimeId,
        set: {
          cliKind: status.cliKind,
          accountId: status.accountId,
          state: status.state,
          lastFailureClass: status.lastFailureClass ?? null,
          cooldownUntil: status.cooldownUntil ? new Date(status.cooldownUntil) : null,
          lastProbeAt: status.lastProbeAt ? new Date(status.lastProbeAt) : null,
          consecutiveFailures: status.consecutiveFailures ?? 0,
          activeClaimsCount: status.activeClaimsCount ?? 0,
          updatedAt: new Date(),
        },
      });

    return status;
  }

  async insertCheckpoint(checkpoint: Checkpoint): Promise<void> {
    await this.db.insert(conductorCheckpoints).values({
      id: checkpoint.id,
      swarmTaskId: checkpoint.swarmTaskId,
      fromRuntime: checkpoint.fromRuntime,
      summary: checkpoint.summary,
      filesTouched: checkpoint.filesTouched,
      nextSteps: checkpoint.nextSteps,
      createdAt: new Date(checkpoint.createdAt),
    });
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    const rows = await this.db
      .select()
      .from(conductorCheckpoints)
      .where(eq(conductorCheckpoints.id, id))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      swarmTaskId: r.swarmTaskId,
      fromRuntime: r.fromRuntime,
      summary: r.summary,
      filesTouched: (r.filesTouched as string[]) ?? [],
      nextSteps: r.nextSteps,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async getLatestCheckpoint(taskId: string): Promise<Checkpoint | null> {
    const rows = await this.db
      .select()
      .from(conductorCheckpoints)
      .where(eq(conductorCheckpoints.swarmTaskId, taskId))
      .orderBy(desc(conductorCheckpoints.createdAt))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      swarmTaskId: r.swarmTaskId,
      fromRuntime: r.fromRuntime,
      summary: r.summary,
      filesTouched: (r.filesTouched as string[]) ?? [],
      nextSteps: r.nextSteps,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async listCheckpoints(taskId: string): Promise<Checkpoint[]> {
    const rows = await this.db
      .select()
      .from(conductorCheckpoints)
      .where(eq(conductorCheckpoints.swarmTaskId, taskId))
      .orderBy(desc(conductorCheckpoints.createdAt));
    return rows.map((r) => ({
      id: r.id,
      swarmTaskId: r.swarmTaskId,
      fromRuntime: r.fromRuntime,
      summary: r.summary,
      filesTouched: (r.filesTouched as string[]) ?? [],
      nextSteps: r.nextSteps,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async insertTransfer(transfer: Transfer): Promise<void> {
    await this.db.insert(conductorTransfers).values({
      id: transfer.id,
      swarmTaskId: transfer.swarmTaskId,
      transferKey: transfer.transferKey,
      fromRuntime: transfer.fromRuntime,
      toRuntime: transfer.toRuntime,
      checkpointId: transfer.checkpointId ?? null,
      reason: transfer.reason,
      status: transfer.status,
      createdAt: new Date(transfer.createdAt),
    });
  }

  async getTransfer(id: string): Promise<Transfer | null> {
    const rows = await this.db
      .select()
      .from(conductorTransfers)
      .where(eq(conductorTransfers.id, id))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      swarmTaskId: r.swarmTaskId,
      transferKey: r.transferKey,
      fromRuntime: r.fromRuntime,
      toRuntime: r.toRuntime,
      checkpointId: r.checkpointId,
      reason: r.reason,
      status: r.status as any,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async getTransferByKey(transferKey: string): Promise<Transfer | null> {
    const rows = await this.db
      .select()
      .from(conductorTransfers)
      .where(eq(conductorTransfers.transferKey, transferKey))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      swarmTaskId: r.swarmTaskId,
      transferKey: r.transferKey,
      fromRuntime: r.fromRuntime,
      toRuntime: r.toRuntime,
      checkpointId: r.checkpointId,
      reason: r.reason,
      status: r.status as any,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async listTransfers(taskId?: string): Promise<Transfer[]> {
    const query = this.db.select().from(conductorTransfers);
    const rows = taskId
      ? await query.where(eq(conductorTransfers.swarmTaskId, taskId)).orderBy(desc(conductorTransfers.createdAt))
      : await query.orderBy(desc(conductorTransfers.createdAt));
    return rows.map((r) => ({
      id: r.id,
      swarmTaskId: r.swarmTaskId,
      transferKey: r.transferKey,
      fromRuntime: r.fromRuntime,
      toRuntime: r.toRuntime,
      checkpointId: r.checkpointId,
      reason: r.reason,
      status: r.status as any,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async updateTransferStatus(id: string, status: TransferStatus): Promise<void> {
    await this.db
      .update(conductorTransfers)
      .set({ status })
      .where(eq(conductorTransfers.id, id));
  }

  async getActiveClaim(taskId: string): Promise<TaskClaimRecord | null> {
    const rows = await this.db
      .select()
      .from(taskClaims)
      .where(and(eq(taskClaims.taskId, taskId), eq(taskClaims.status, "active")))
      .limit(1);
    return rows[0] ?? null;
  }

  async createClaim(taskId: string, botId: string, leaseDurationMs: number): Promise<TaskClaimRecord> {
    const now = new Date();
    const leaseExpires = new Date(now.getTime() + leaseDurationMs);

    const rows = await this.db
      .insert(taskClaims)
      .values({
        id: `claim_${randomUUID()}`,
        taskId,
        botId,
        ownerId: null,
        claimedAt: now,
        leaseExpiresAt: leaseExpires,
        status: "active",
        heartbeatAt: now,
      })
      .returning();

    return rows[0];
  }

  /**
   * Transactional claim swap: release previous active claim + insert new active claim in a single TX.
   * Leverages PostgreSQL partial unique index `task_claims_active_task_unique_idx`.
   */
  async swapClaim(
    taskId: string,
    oldBotId: string | null,
    newBotId: string,
    leaseDurationMs: number,
  ): Promise<TaskClaimRecord> {
    return this.db.transaction(async (tx) => {
      // 1. Release active claim for this task
      const condition = oldBotId
        ? and(eq(taskClaims.taskId, taskId), eq(taskClaims.status, "active"), eq(taskClaims.botId, oldBotId))
        : and(eq(taskClaims.taskId, taskId), eq(taskClaims.status, "active"));

      await tx.update(taskClaims).set({ status: "released" }).where(condition);

      // 2. Insert new active claim
      const now = new Date();
      const leaseExpires = new Date(now.getTime() + leaseDurationMs);

      const inserted = await tx
        .insert(taskClaims)
        .values({
          id: `claim_${randomUUID()}`,
          taskId,
          botId: newBotId,
          ownerId: null,
          claimedAt: now,
          leaseExpiresAt: leaseExpires,
          status: "active",
          heartbeatAt: now,
        })
        .returning();

      return inserted[0];
    });
  }

  async releaseClaim(taskId: string, botId?: string): Promise<void> {
    const condition = botId
      ? and(eq(taskClaims.taskId, taskId), eq(taskClaims.status, "active"), eq(taskClaims.botId, botId))
      : and(eq(taskClaims.taskId, taskId), eq(taskClaims.status, "active"));
    await this.db.update(taskClaims).set({ status: "released" }).where(condition);
  }

  async insertEvent(event: ConductorEvent): Promise<void> {
    await this.db.insert(conductorEvents).values({
      id: event.id,
      taskId: event.taskId ?? null,
      eventType: event.eventType,
      severity: event.severity,
      message: event.message,
      payload: event.payload ?? {},
      createdAt: new Date(event.createdAt),
    });
  }

  async listEvents(query?: { limit?: number; taskId?: string; eventType?: string }): Promise<ConductorEvent[]> {
    const q = this.db.select().from(conductorEvents);
    const conditions = [];
    if (query?.taskId) conditions.push(eq(conductorEvents.taskId, query.taskId));
    if (query?.eventType) conditions.push(eq(conductorEvents.eventType, query.eventType));

    const withWhere = conditions.length > 0 ? q.where(and(...conditions)) : q;
    const withOrder = withWhere.orderBy(desc(conductorEvents.createdAt));
    const rows = query?.limit && query.limit > 0 ? await withOrder.limit(query.limit) : await withOrder;

    return rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      eventType: r.eventType,
      severity: r.severity as any,
      message: r.message,
      payload: (r.payload as Record<string, unknown>) ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getEvents(limit = 50): Promise<ConductorEvent[]> {
    return this.listEvents({ limit });
  }

  async getActiveTransfers(): Promise<Transfer[]> {
    const all = await this.listTransfers();
    return all.filter((t) => t.status === "pending" || t.status === "in_progress");
  }
}
