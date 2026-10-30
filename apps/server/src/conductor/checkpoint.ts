/**
 * Conductor Checkpoint Manager.
 *
 * Saves and restores task progress so that transfers between runtimes (e.g. Codex -> Claude)
 * carry structured context (summary, touched files, next steps).
 */

import { randomUUID } from "node:crypto";
import {
  type Checkpoint,
  CheckpointSchema,
} from "../contracts/conductor/types";
import type { ConductorStore } from "./store";

export interface CreateCheckpointParams {
  id?: string;
  taskId: string;
  fromRuntime: string;
  summary: string;
  filesTouched?: string[];
  nextSteps: string;
  createdAt?: string;
}

export class CheckpointManager {
  constructor(private readonly store: ConductorStore) {}

  async createCheckpoint(params: CreateCheckpointParams): Promise<Checkpoint> {
    const checkpoint: Checkpoint = CheckpointSchema.parse({
      id: params.id ?? `chk_${randomUUID()}`,
      swarmTaskId: params.taskId,
      fromRuntime: params.fromRuntime,
      summary: params.summary,
      filesTouched: params.filesTouched ?? [],
      nextSteps: params.nextSteps,
      createdAt: params.createdAt ?? new Date().toISOString(),
    });

    await this.store.insertCheckpoint(checkpoint);

    await this.store.insertEvent({
      id: `evt_${randomUUID()}`,
      taskId: checkpoint.swarmTaskId,
      eventType: "conductor.checkpoint.created",
      severity: "info",
      message: `Checkpoint created by runtime '${checkpoint.fromRuntime}' for task '${checkpoint.swarmTaskId}'`,
      payload: {
        checkpointId: checkpoint.id,
        filesTouchedCount: checkpoint.filesTouched.length,
        summary: checkpoint.summary,
      },
      createdAt: checkpoint.createdAt,
    });

    return checkpoint;
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    return this.store.getCheckpoint(id);
  }

  async getLatestCheckpoint(taskId: string): Promise<Checkpoint | null> {
    return this.store.getLatestCheckpoint(taskId);
  }

  async listCheckpoints(taskId: string): Promise<Checkpoint[]> {
    return this.store.listCheckpoints(taskId);
  }
}
