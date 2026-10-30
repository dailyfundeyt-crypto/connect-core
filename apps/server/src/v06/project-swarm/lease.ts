/**
 * Project-Swarm: Atomic Task Leases & Concurrency Guard (v06 / A27)
 *
 * Verwaltet:
 * - Atomares Claiming von Aufgaben mit Lease-Dauer (z.B. 10 Minuten)
 * - Verhindert Race Conditions & Doppelarbeit (0 Doppel-Claims)
 * - Verlängerung (Heartbeat) für lange laufende Bots
 * - Automatische Freigabe (Timeout) bei ausgefallenen Bots
 */

import { randomUUID } from "node:crypto";
import type { SwarmRole } from "./roles";

export interface TaskLease {
  id: string;
  taskId: string;
  botId: string;
  projectId: string;
  role: SwarmRole;
  claimedAt: string;
  expiresAt: string;
  heartbeatAt: string;
  status: "active" | "released" | "expired" | "completed";
  extensionCount: number;
  tokensUsed: number;
}

export interface ClaimOptions {
  leaseDurationMs?: number; // Standard: 10 Minuten (600.000 ms)
  role?: SwarmRole;
}

export class TaskLeaseManager {
  private leases = new Map<string, TaskLease>(); // Key: leaseId
  private taskToActiveLeaseId = new Map<string, string>(); // Key: taskId -> leaseId

  // Mutex-Lock für atomare Claim-Transaktionen
  private mutex = Promise.resolve();

  private async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const prevMutex = this.mutex;
    let releaseMutex: () => void = () => {};
    this.mutex = new Promise<void>((resolve) => {
      releaseMutex = resolve;
    });
    try {
      await prevMutex;
      return await fn();
    } finally {
      releaseMutex();
    }
  }

  /**
   * Atomares Claimen einer Aufgabe.
   * Garantiert, dass bei simultanen Zugriffen kein zweiter Bot denselben Task erhält.
   */
  public async claimTask(
    taskId: string,
    botId: string,
    projectId: string,
    options: ClaimOptions = {},
  ): Promise<TaskLease> {
    if (!taskId || !botId || !projectId) {
      throw new Error("taskId, botId und projectId sind für einen Task-Claim erforderlich.");
    }

    const durationMs = options.leaseDurationMs ?? 10 * 60 * 1000;
    const role: SwarmRole = options.role ?? "worker";

    return await this.withLock(async () => {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      // Prüfen, ob bereits ein aktiver Lease für diesen Task existiert
      const existingLeaseId = this.taskToActiveLeaseId.get(taskId);
      if (existingLeaseId) {
        const existing = this.leases.get(existingLeaseId);
        if (existing && existing.status === "active") {
          const expiresMs = new Date(existing.expiresAt).getTime();
          if (expiresMs > nowMs) {
            // Task ist noch gültig geclaimt -> Doppel-Claim verhindern!
            throw new Error(
              `Aufgabe '${taskId}' ist bereits aktiv geclaimt von Bot '${existing.botId}' (Gültig bis ${existing.expiresAt}).`,
            );
          } else {
            // Lease ist abgelaufen -> automatisch auf expired setzen
            existing.status = "expired";
            existing.tokensUsed = existing.tokensUsed || 0;
            this.taskToActiveLeaseId.delete(taskId);
          }
        }
      }

      // Neuen Lease atomar erzeugen
      const leaseId = `lease_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const expiresAt = new Date(nowMs + durationMs).toISOString();

      const newLease: TaskLease = {
        id: leaseId,
        taskId,
        botId,
        projectId,
        role,
        claimedAt: nowIso,
        expiresAt,
        heartbeatAt: nowIso,
        status: "active",
        extensionCount: 0,
        tokensUsed: 0,
      };

      this.leases.set(leaseId, newLease);
      this.taskToActiveLeaseId.set(taskId, leaseId);

      return { ...newLease };
    });
  }

  /**
   * Verlängert einen aktiven Lease (Heartbeat).
   */
  public async heartbeat(
    leaseId: string,
    botId: string,
    extensionMs = 10 * 60 * 1000,
  ): Promise<TaskLease> {
    return await this.withLock(async () => {
      const lease = this.leases.get(leaseId);
      if (!lease) {
        throw new Error(`Lease '${leaseId}' nicht gefunden.`);
      }
      if (lease.botId !== botId) {
        throw new Error(`Lease '${leaseId}' gehört Bot '${lease.botId}', nicht '${botId}'.`);
      }
      if (lease.status !== "active") {
        throw new Error(`Lease '${leaseId}' ist nicht mehr aktiv (Status: ${lease.status}).`);
      }

      const nowMs = Date.now();
      lease.heartbeatAt = new Date(nowMs).toISOString();
      lease.expiresAt = new Date(nowMs + extensionMs).toISOString();
      lease.extensionCount += 1;

      return { ...lease };
    });
  }

  /**
   * Gibt einen Lease vorzeitig frei (z. B. wenn Bot abbricht).
   */
  public async releaseLease(leaseId: string, botId: string, reason?: string): Promise<TaskLease> {
    return await this.withLock(async () => {
      const lease = this.leases.get(leaseId);
      if (!lease) {
        throw new Error(`Lease '${leaseId}' nicht gefunden.`);
      }
      if (lease.botId !== botId) {
        throw new Error(`Lease '${leaseId}' gehört nicht Bot '${botId}'.`);
      }

      lease.status = "released";
      this.taskToActiveLeaseId.delete(lease.taskId);

      return { ...lease };
    });
  }

  /**
   * Schließt einen Lease erfolgreich ab (Aufgabe erledigt oder an Prüfer übergeben).
   */
  public async completeLease(leaseId: string, botId: string, tokensUsed = 0): Promise<TaskLease> {
    return await this.withLock(async () => {
      const lease = this.leases.get(leaseId);
      if (!lease) {
        throw new Error(`Lease '${leaseId}' nicht gefunden.`);
      }
      if (lease.botId !== botId) {
        throw new Error(`Lease '${leaseId}' gehört nicht Bot '${botId}'.`);
      }

      lease.status = "completed";
      lease.tokensUsed += Math.max(0, tokensUsed);
      this.taskToActiveLeaseId.delete(lease.taskId);

      return { ...lease };
    });
  }

  /**
   * Sucht nach abgelaufenen aktiven Leases und setzt sie auf 'expired'.
   * Gibt die Liste der betroffenen Task-IDs zurück, damit diese wieder auf 'todo' gestellt werden können.
   */
  public async releaseExpiredLeases(projectId?: string): Promise<string[]> {
    return await this.withLock(async () => {
      const nowMs = Date.now();
      const expiredTaskIds: string[] = [];

      for (const lease of this.leases.values()) {
        if (lease.status !== "active") continue;
        if (projectId && lease.projectId !== projectId) continue;

        const expiresMs = new Date(lease.expiresAt).getTime();
        if (expiresMs <= nowMs) {
          lease.status = "expired";
          this.taskToActiveLeaseId.delete(lease.taskId);
          expiredTaskIds.push(lease.taskId);
        }
      }

      return expiredTaskIds;
    });
  }

  public getActiveLeaseForTask(taskId: string): TaskLease | undefined {
    const leaseId = this.taskToActiveLeaseId.get(taskId);
    if (!leaseId) return undefined;
    const lease = this.leases.get(leaseId);
    if (lease && lease.status === "active") {
      return { ...lease };
    }
    return undefined;
  }

  public getLease(leaseId: string): TaskLease | undefined {
    const lease = this.leases.get(leaseId);
    return lease ? { ...lease } : undefined;
  }

  public listActiveLeases(projectId?: string): TaskLease[] {
    const list: TaskLease[] = [];
    const nowMs = Date.now();
    for (const lease of this.leases.values()) {
      if (lease.status === "active") {
        if (new Date(lease.expiresAt).getTime() > nowMs) {
          if (!projectId || lease.projectId === projectId) {
            list.push({ ...lease });
          }
        }
      }
    }
    return list;
  }

  public clear(): void {
    this.leases.clear();
    this.taskToActiveLeaseId.clear();
  }
}

export const leaseManager = new TaskLeaseManager();
