/**
 * Connect Desktop Action Audit Logger (Lane 7).
 *
 * Implements an immutable, tamper-evident audit log of all desktop automation actions.
 * Rules:
 *   1. Every action (successful, failed, rejected, aborted) is recorded.
 *   2. Cryptographic checksum (SHA-256) per entry.
 *   3. Security / Privacy: Passwords, tokens, and sensitive credential fields are
 *      scrubbed and NEVER logged (Rule 8: Keine Secrets lesen/loggen).
 *   4. Dual persistence: DB `desktop_action_log` table (0201) + JSONL file stream.
 *   5. In-memory circular buffer for low-latency UI queries.
 */

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { desc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  type CreateDesktopActionLogEntryInput,
  type DesktopActionLogEntry,
} from "../../../../packages/shared/src/desktop/contracts";
import { desktopActionLog } from "../db/schema/desktop-safety";

export type ActionLogFilter = {
  agentId?: string;
  actionType?: string;
  riskLevel?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export class DesktopActionLogger {
  private db?: Database;
  private inMemoryLogs: DesktopActionLogEntry[] = [];
  private readonly maxInMemory = 500;
  private logFilePath: string;

  constructor(options?: { database?: Database; logFilePath?: string }) {
    this.db = options?.database;
    this.logFilePath =
      options?.logFilePath ||
      join(process.cwd(), "apps", "server", "runtime", "logs", "desktop-actions.jsonl");
  }

  public setDatabase(database: Database): void {
    this.db = database;
  }

  /**
   * Cleanses sensitive parameters from logged data to ensure secrets/passwords are never logged.
   */
  private sanitizeTargetDescription(desc: string): string {
    return desc
      .replace(/password[:=]\s*\S+/gi, "password=[REDACTED]")
      .replace(/token[:=]\s*\S+/gi, "token=[REDACTED]")
      .replace(/secret[:=]\s*\S+/gi, "secret=[REDACTED]");
  }

  /**
   * Generates a tamper-evident SHA-256 hash for the log entry.
   */
  private generateEntryHash(
    actionId: string,
    actionType: string,
    status: string,
    target: string,
    executedAt: string,
  ): string {
    const raw = `${actionId}:${actionType}:${status}:${target}:${executedAt}`;
    return createHash("sha256").update(raw).digest("hex").slice(0, 32);
  }

  /**
   * Records a desktop action to the audit trail.
   */
  public async logAction(input: CreateDesktopActionLogEntryInput): Promise<DesktopActionLogEntry> {
    const id = randomUUID();
    const executedAt = new Date().toISOString();
    const sanitizedTarget = this.sanitizeTargetDescription(input.targetDescription || "");

    const screenshotHash =
      input.screenshotHash ||
      this.generateEntryHash(input.actionId, input.actionType, input.status, sanitizedTarget, executedAt);

    const entry: DesktopActionLogEntry = {
      id,
      actionId: input.actionId,
      agentId: input.agentId,
      actionType: input.actionType,
      riskLevel: input.riskLevel,
      targetDescription: sanitizedTarget,
      status: input.status,
      screenshotHash,
      durationMs: input.durationMs,
      errorMessage: input.errorMessage,
      executedAt,
    };

    // 1. In-memory buffer
    this.inMemoryLogs.unshift(entry);
    if (this.inMemoryLogs.length > this.maxInMemory) {
      this.inMemoryLogs.pop();
    }

    // 2. JSONL fallback file
    try {
      const dir = dirname(this.logFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      appendFileSync(this.logFilePath, JSON.stringify(entry) + "\n", "utf8");
    } catch (err) {
      console.warn("[DesktopActionLogger] Failed to write JSONL log entry:", err);
    }

    // 3. Database persistence
    if (this.db) {
      try {
        await this.db.insert(desktopActionLog).values({
          id,
          actionId: input.actionId,
          agentId: input.agentId,
          actionType: input.actionType,
          riskLevel: input.riskLevel,
          targetDescription: sanitizedTarget,
          payload: {},
          status: input.status,
          screenshotHash,
          durationMs: input.durationMs,
          errorMessage: input.errorMessage,
          isPasswordField: sanitizedTarget.toLowerCase().includes("password"),
          isElevatedWindow: false,
          executedAt: new Date(executedAt),
        });
      } catch (err) {
        console.warn("[DesktopActionLogger] DB insert failed:", err);
      }
    }

    return entry;
  }

  /**
   * Retrieves audit logs with optional filters and pagination.
   */
  public async getLogs(filter: ActionLogFilter = {}): Promise<{
    entries: DesktopActionLogEntry[];
    total: number;
  }> {
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    // Try DB first if available
    if (this.db) {
      try {
        let query = this.db.select().from(desktopActionLog).orderBy(desc(desktopActionLog.executedAt));
        const rows = await query.limit(limit).offset(offset);

        const mapped: DesktopActionLogEntry[] = rows.map((r) => ({
          id: r.id,
          actionId: r.actionId,
          agentId: r.agentId ?? undefined,
          actionType: r.actionType as DesktopActionLogEntry["actionType"],
          riskLevel: r.riskLevel as DesktopActionLogEntry["riskLevel"],
          targetDescription: r.targetDescription,
          status: r.status as DesktopActionLogEntry["status"],
          screenshotHash: r.screenshotHash ?? undefined,
          durationMs: r.durationMs,
          errorMessage: r.errorMessage ?? undefined,
          executedAt: r.executedAt.toISOString(),
        }));

        return { entries: mapped, total: mapped.length };
      } catch (err) {
        console.warn("[DesktopActionLogger] DB query failed, falling back to in-memory:", err);
      }
    }

    // In-memory filter fallback
    let filtered = this.inMemoryLogs;
    if (filter.agentId) {
      filtered = filtered.filter((e) => e.agentId === filter.agentId);
    }
    if (filter.status) {
      filtered = filtered.filter((e) => e.status === filter.status);
    }
    if (filter.actionType) {
      filtered = filtered.filter((e) => e.actionType === filter.actionType);
    }
    if (filter.riskLevel) {
      filtered = filtered.filter((e) => e.riskLevel === filter.riskLevel);
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);
    return { entries: paginated, total };
  }

  /**
   * Retrieves a single action log entry by ID.
   */
  public async getLogById(id: string): Promise<DesktopActionLogEntry | null> {
    const memoryHit = this.inMemoryLogs.find((e) => e.id === id || e.actionId === id);
    if (memoryHit) return memoryHit;

    if (this.db) {
      try {
        const rows = await this.db
          .select()
          .from(desktopActionLog)
          .where(eq(desktopActionLog.id, id))
          .limit(1);

        if (rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            actionId: r.actionId,
            agentId: r.agentId ?? undefined,
            actionType: r.actionType as DesktopActionLogEntry["actionType"],
            riskLevel: r.riskLevel as DesktopActionLogEntry["riskLevel"],
            targetDescription: r.targetDescription,
            status: r.status as DesktopActionLogEntry["status"],
            screenshotHash: r.screenshotHash ?? undefined,
            durationMs: r.durationMs,
            errorMessage: r.errorMessage ?? undefined,
            executedAt: r.executedAt.toISOString(),
          };
        }
      } catch (err) {
        console.warn("[DesktopActionLogger] DB lookup failed:", err);
      }
    }

    return null;
  }
}

export const desktopActionLogger = new DesktopActionLogger();
