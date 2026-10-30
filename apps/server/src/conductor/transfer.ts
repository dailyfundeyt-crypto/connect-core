/**
 * Conductor Transfer Protocol.
 *
 * Implements deterministic SHA-256 transfer deduplication and transactional
 * single-owner claim handoffs (e.g. Codex -> Claude Standby).
 */

import { randomUUID } from "node:crypto";
import {
  computeTransferKey,
  type Transfer,
  TransferSchema,
  type TransferStatus,
} from "../contracts/conductor/types";
import { assertConductorActive } from "./kill-switch";
import type { ConductorStore } from "./store";

export interface CreateTransferParams {
  id?: string;
  taskId: string;
  fromRuntime: string;
  toRuntime: string;
  checkpointId?: string | null;
  reason: string;
  leaseDurationMs?: number;
}

export interface TransferResult {
  transfer: Transfer;
  deduplicated: boolean;
  claimId?: string;
}

export class TransferManager {
  constructor(private readonly store: ConductorStore) {}

  async createTransfer(params: CreateTransferParams): Promise<TransferResult> {
    const config = await this.store.getConfig();
    assertConductorActive(config);

    const checkpointId = params.checkpointId ?? "";
    const transferKey = computeTransferKey(
      params.taskId,
      params.fromRuntime,
      params.toRuntime,
      checkpointId,
    );

    // 1. Deduplication check via deterministic SHA-256 key
    const existing = await this.store.getTransferByKey(transferKey);
    if (existing) {
      await this.store.insertEvent({
        id: `evt_${randomUUID()}`,
        taskId: params.taskId,
        eventType: "conductor.transfer.deduplicated",
        severity: "info",
        message: `Duplicate transfer skipped for key '${transferKey}'. Returning existing transfer '${existing.id}'.`,
        payload: {
          transferId: existing.id,
          transferKey,
          fromRuntime: existing.fromRuntime,
          toRuntime: existing.toRuntime,
        },
        createdAt: new Date().toISOString(),
      });

      return {
        transfer: existing,
        deduplicated: true,
      };
    }

    // 2. Insert new transfer as pending
    const transferId = params.id ?? `trf_${randomUUID()}`;
    const transfer: Transfer = TransferSchema.parse({
      id: transferId,
      swarmTaskId: params.taskId,
      transferKey,
      fromRuntime: params.fromRuntime,
      toRuntime: params.toRuntime,
      checkpointId: params.checkpointId || null,
      reason: params.reason,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    await this.store.insertTransfer(transfer);

    await this.store.insertEvent({
      id: `evt_${randomUUID()}`,
      taskId: params.taskId,
      eventType: "conductor.transfer.initiated",
      severity: "warn",
      message: `Handoff initiated for task '${params.taskId}' from '${params.fromRuntime}' to '${params.toRuntime}': ${params.reason}`,
      payload: {
        transferId: transfer.id,
        transferKey,
        checkpointId: transfer.checkpointId,
      },
      createdAt: transfer.createdAt,
    });

    // 3. Atomically swap active claim to new runtime (Single Owner guarantee)
    const leaseDuration = params.leaseDurationMs ?? 300_000; // 5 min default lease
    const newClaim = await this.store.swapClaim(
      params.taskId,
      params.fromRuntime,
      params.toRuntime,
      leaseDuration,
    );

    // 4. Mark transfer completed
    await this.store.updateTransferStatus(transfer.id, "completed");
    transfer.status = "completed";

    await this.store.insertEvent({
      id: `evt_${randomUUID()}`,
      taskId: params.taskId,
      eventType: "conductor.transfer.completed",
      severity: "info",
      message: `Handoff completed for task '${params.taskId}'. New claim '${newClaim.id}' assigned to '${params.toRuntime}'.`,
      payload: {
        transferId: transfer.id,
        claimId: newClaim.id,
        toRuntime: params.toRuntime,
      },
      createdAt: new Date().toISOString(),
    });

    return {
      transfer,
      deduplicated: false,
      claimId: newClaim.id,
    };
  }

  async getTransfer(id: string): Promise<Transfer | null> {
    return this.store.getTransfer(id);
  }

  async listTransfers(taskId?: string): Promise<Transfer[]> {
    return this.store.listTransfers(taskId);
  }
}
