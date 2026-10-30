/**
 * T3-Bridge — Freigaben-Speicher (Lane A13).
 *
 * Verwaltet ausstehende und erledigte Freigaben (Approvals) im Server-Speicher.
 */

import type { ConnectChatApprovalItem, T3ApprovalDecision } from "../contracts.js";
import type { PendingApprovalRecord } from "./types.js";

export interface IApprovalStore {
  saveApproval(record: PendingApprovalRecord): Promise<void>;
  getApproval(agentId: string, requestId: string): Promise<PendingApprovalRecord | null>;
  getPendingApprovals(agentId: string): Promise<PendingApprovalRecord[]>;
  resolveApproval(
    agentId: string,
    requestId: string,
    decision: T3ApprovalDecision,
    feedback?: string,
    answers?: Record<string, string>,
  ): Promise<boolean>;
  clearApprovalsForAgent(agentId: string): Promise<number>;
}

/**
 * Wandelt einen `PendingApprovalRecord` in das UI-Format `ConnectChatApprovalItem` um.
 */
export function toConnectChatApprovalItem(
  record: PendingApprovalRecord,
): ConnectChatApprovalItem {
  return {
    kind: "approval",
    id: record.id,
    requestId: record.requestId,
    requestKind: record.requestKind,
    title: record.title,
    detail: record.detail,
    prompt: record.prompt,
    options: record.options.map((opt) => ({
      id: opt.id,
      label: opt.label,
      decision: opt.decision,
    })),
    status:
      record.status === "allowed" || record.status === "denied"
        ? "done"
        : "waiting",
    blocking: record.blocking,
  };
}

/**
 * In-Memory-Speicher für Freigaben.
 */
export class MemoryApprovalStore implements IApprovalStore {
  // Key: `${agentId}:${requestId}`
  readonly #records = new Map<string, PendingApprovalRecord>();

  #makeKey(agentId: string, requestId: string): string {
    return `${agentId}:${requestId}`;
  }

  async saveApproval(record: PendingApprovalRecord): Promise<void> {
    const key = this.#makeKey(record.agentId, record.requestId);
    this.#records.set(key, record);
  }

  async getApproval(
    agentId: string,
    requestId: string,
  ): Promise<PendingApprovalRecord | null> {
    const key = this.#makeKey(agentId, requestId);
    return this.#records.get(key) ?? null;
  }

  async getPendingApprovals(agentId: string): Promise<PendingApprovalRecord[]> {
    const results: PendingApprovalRecord[] = [];
    for (const record of this.#records.values()) {
      if (record.agentId === agentId && record.status === "waiting") {
        results.push(record);
      }
    }
    // Nach Erstelldatum sortieren (älteste zuerst)
    results.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return results;
  }

  async resolveApproval(
    agentId: string,
    requestId: string,
    decision: T3ApprovalDecision,
    feedback?: string,
    answers?: Record<string, string>,
  ): Promise<boolean> {
    const key = this.#makeKey(agentId, requestId);
    const existing = this.#records.get(key);
    if (!existing) return false;

    const updated: PendingApprovalRecord = {
      ...existing,
      status: decision === "deny" ? "denied" : "allowed",
      resolvedAt: new Date().toISOString(),
      resolvedDecision: decision,
      feedback,
      answers,
    };

    this.#records.set(key, updated);
    return true;
  }

  async clearApprovalsForAgent(agentId: string): Promise<number> {
    let count = 0;
    for (const [key, record] of this.#records.entries()) {
      if (record.agentId === agentId) {
        this.#records.delete(key);
        count++;
      }
    }
    return count;
  }
}
