/**
 * Storage and Persistence for Proposals and Self-Improvement Learning (Lane 6)
 * Supports PostgreSQL (via postgres.js) with file/memory fallback.
 */

import * as path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import postgres from "postgres";
import { resolveBrainRoot, brainRootFor } from "../../store";
import type {
  Proposal,
  ProposalStatus,
  ProposalKind,
  ProposalFeedback,
  LearningStats,
  LearnedThresholds,
  KindApprovalStats,
} from "./types";

const DEFAULT_THRESHOLDS: LearnedThresholds = {
  minLinkSimilarity: 0.78,
  minDuplicateSimilarity: 0.88,
  autoAskHumanImpact: "high",
  linkConfidencePenalty: 0.05,
  tagConfidenceThreshold: 0.7,
};

const ALL_KINDS: ProposalKind[] = [
  "new_note",
  "add_link",
  "move",
  "merge",
  "tag",
  "summary",
];

// In-Memory proposal cache
const memoryProposals = new Map<string, Proposal>();
const memoryFeedback: ProposalFeedback[] = [];
let memoryThresholds: LearnedThresholds = { ...DEFAULT_THRESHOLDS };

function getDatabaseClient() {
  const dbUrl =
    process.env.DATABASE_URL ||
    (process.env.DATABASE_URL ?? "");
  if (!dbUrl) return null;
  try {
    return postgres(dbUrl, { max: 1, idle_timeout: 3 });
  } catch {
    return null;
  }
}

async function getVaultStoragePath(): Promise<string | null> {
  const rootRes = await resolveBrainRoot(brainRootFor(null));
  if (!rootRes.available) return null;
  const sparkDir = path.join(rootRes.root, "_spark");
  if (!existsSync(sparkDir)) {
    await mkdir(sparkDir, { recursive: true }).catch(() => {});
  }
  return path.join(sparkDir, "proposals.json");
}

async function persistToVaultFile(): Promise<void> {
  const filePath = await getVaultStoragePath();
  if (!filePath) return;
  try {
    const data = {
      proposals: Array.from(memoryProposals.values()),
      thresholds: memoryThresholds,
      feedback: memoryFeedback.slice(0, 100),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // Ignore fallback write errors
  }
}

async function loadFromVaultFile(): Promise<void> {
  const filePath = await getVaultStoragePath();
  if (!filePath || !existsSync(filePath)) return;
  try {
    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data.proposals)) {
      for (const p of data.proposals) {
        if (p?.id && !memoryProposals.has(p.id)) {
          memoryProposals.set(p.id, p);
        }
      }
    }
    if (data.thresholds) {
      memoryThresholds = { ...DEFAULT_THRESHOLDS, ...data.thresholds };
    }
  } catch {
    // Ignore parse errors
  }
}

// Initial load from file
loadFromVaultFile().catch(() => {});

/* ========================================================================== */
/* Proposal CRUD Operations                                                   */
/* ========================================================================== */

export async function saveProposal(proposal: Proposal): Promise<Proposal> {
  const now = new Date().toISOString();
  const normalized: Proposal = {
    ...proposal,
    status: proposal.status || "pending",
    sources: proposal.sources || [],
    createdAt: proposal.createdAt || now,
  };

  memoryProposals.set(normalized.id, normalized);
  await persistToVaultFile();

  const sql = getDatabaseClient();
  if (sql) {
    try {
      await sql`
        INSERT INTO spark_proposals (
          id, kind, payload, diff, rationale, sources, status, created_at, updated_at
        ) VALUES (
          ${normalized.id},
          ${normalized.kind},
          ${sql.json(normalized.payload as any)},
          ${normalized.diff ?? null},
          ${normalized.rationale},
          ${sql.json(normalized.sources as any)},
          ${normalized.status},
          ${normalized.createdAt ? new Date(normalized.createdAt) : new Date()},
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          payload = EXCLUDED.payload,
          diff = EXCLUDED.diff,
          rationale = EXCLUDED.rationale,
          sources = EXCLUDED.sources,
          status = EXCLUDED.status,
          updated_at = NOW()
      `;
    } catch {
      // In-memory fallback is active
    } finally {
      await sql.end().catch(() => {});
    }
  }

  return normalized;
}

export async function getProposal(id: string): Promise<Proposal | null> {
  if (memoryProposals.has(id)) {
    return memoryProposals.get(id)!;
  }

  const sql = getDatabaseClient();
  if (sql) {
    try {
      const rows = await sql`
        SELECT id, kind, payload, diff, rationale, sources, status,
               decided_at as "decidedAt", applied_at as "appliedAt",
               created_at as "createdAt", rejection_reason as "rejectionReason"
        FROM spark_proposals
        WHERE id = ${id}
        LIMIT 1
      `;
      if (rows.length > 0) {
        const row = rows[0];
        const proposal: Proposal = {
          id: row.id,
          kind: row.kind,
          payload: row.payload ?? {},
          diff: row.diff,
          rationale: row.rationale,
          sources: row.sources ?? [],
          status: row.status,
          decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : undefined,
          appliedAt: row.appliedAt ? new Date(row.appliedAt).toISOString() : undefined,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
        };
        memoryProposals.set(proposal.id, proposal);
        return proposal;
      }
    } catch {
      // Fallback to memory
    } finally {
      await sql.end().catch(() => {});
    }
  }

  return null;
}

export async function listProposals(filter?: {
  status?: ProposalStatus;
  kind?: ProposalKind;
  limit?: number;
}): Promise<Proposal[]> {
  const sql = getDatabaseClient();
  if (sql) {
    try {
      let rows;
      if (filter?.status && filter?.kind) {
        rows = await sql`
          SELECT id, kind, payload, diff, rationale, sources, status,
                 decided_at as "decidedAt", applied_at as "appliedAt",
                 created_at as "createdAt"
          FROM spark_proposals
          WHERE status = ${filter.status} AND kind = ${filter.kind}
          ORDER BY created_at DESC
          LIMIT ${filter.limit ?? 100}
        `;
      } else if (filter?.status) {
        rows = await sql`
          SELECT id, kind, payload, diff, rationale, sources, status,
                 decided_at as "decidedAt", applied_at as "appliedAt",
                 created_at as "createdAt"
          FROM spark_proposals
          WHERE status = ${filter.status}
          ORDER BY created_at DESC
          LIMIT ${filter.limit ?? 100}
        `;
      } else if (filter?.kind) {
        rows = await sql`
          SELECT id, kind, payload, diff, rationale, sources, status,
                 decided_at as "decidedAt", applied_at as "appliedAt",
                 created_at as "createdAt"
          FROM spark_proposals
          WHERE kind = ${filter.kind}
          ORDER BY created_at DESC
          LIMIT ${filter.limit ?? 100}
        `;
      } else {
        rows = await sql`
          SELECT id, kind, payload, diff, rationale, sources, status,
                 decided_at as "decidedAt", applied_at as "appliedAt",
                 created_at as "createdAt"
          FROM spark_proposals
          ORDER BY created_at DESC
          LIMIT ${filter?.limit ?? 100}
        `;
      }

      if (rows && rows.length > 0) {
        return rows.map((row: any) => {
          const p: Proposal = {
            id: row.id,
            kind: row.kind,
            payload: row.payload ?? {},
            diff: row.diff,
            rationale: row.rationale,
            sources: row.sources ?? [],
            status: row.status,
            decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : undefined,
            appliedAt: row.appliedAt ? new Date(row.appliedAt).toISOString() : undefined,
            createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
          };
          memoryProposals.set(p.id, p);
          return p;
        });
      }
    } catch {
      // Fallback to memory
    } finally {
      await sql.end().catch(() => {});
    }
  }

  // Memory fallback
  let list = Array.from(memoryProposals.values());
  if (filter?.status) {
    list = list.filter((p) => p.status === filter.status);
  }
  if (filter?.kind) {
    list = list.filter((p) => p.kind === filter.kind);
  }
  list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (filter?.limit) {
    list = list.slice(0, filter.limit);
  }
  return list;
}

export async function updateProposalStatus(
  id: string,
  status: ProposalStatus,
  details?: {
    decidedAt?: string;
    appliedAt?: string;
    rejectionReason?: string;
    backupPath?: string;
  },
): Promise<Proposal | null> {
  const existing = await getProposal(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Proposal = {
    ...existing,
    status,
    decidedAt: details?.decidedAt ?? (status === "approved" || status === "rejected" ? now : existing.decidedAt),
    appliedAt: details?.appliedAt ?? (status === "applied" ? now : existing.appliedAt),
  };

  memoryProposals.set(id, updated);
  await persistToVaultFile();

  const sql = getDatabaseClient();
  if (sql) {
    try {
      await sql`
        UPDATE spark_proposals
        SET status = ${status},
            decided_at = ${updated.decidedAt ? new Date(updated.decidedAt) : null},
            applied_at = ${updated.appliedAt ? new Date(updated.appliedAt) : null},
            rejection_reason = ${details?.rejectionReason ?? null},
            applied_backup_path = ${details?.backupPath ?? null},
            updated_at = NOW()
        WHERE id = ${id}
      `;
    } catch {
      // Memory fallback active
    } finally {
      await sql.end().catch(() => {});
    }
  }

  return updated;
}

/* ========================================================================== */
/* Self-Improvement & Learning Persistence                                    */
/* ========================================================================== */

export async function saveFeedback(feedback: ProposalFeedback): Promise<void> {
  const id = feedback.id || `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = feedback.createdAt || new Date().toISOString();
  const item: ProposalFeedback = { ...feedback, id, createdAt: now };

  memoryFeedback.push(item);
  await persistToVaultFile();

  const sql = getDatabaseClient();
  if (sql) {
    try {
      await sql`
        INSERT INTO spark_proposal_feedback (
          id, proposal_id, kind, approved, feedback_notes, score, features, created_at
        ) VALUES (
          ${id},
          ${item.proposalId},
          ${item.kind},
          ${item.approved},
          ${item.feedbackNotes ?? null},
          ${item.score ?? null},
          ${sql.json((item.features ?? {}) as any)},
          ${new Date(now)}
        )
      `;
    } catch {
      // Memory fallback
    } finally {
      await sql.end().catch(() => {});
    }
  }
}

export async function getLearningStats(): Promise<LearningStats> {
  const proposals = Array.from(memoryProposals.values());
  let totalProposed = proposals.length;
  let totalApproved = 0;
  let totalRejected = 0;

  const approvalRateByKind: Record<ProposalKind, KindApprovalStats> = {} as any;
  for (const kind of ALL_KINDS) {
    approvalRateByKind[kind] = { approved: 0, rejected: 0, rate: 0 };
  }

  for (const p of proposals) {
    if (p.status === "approved" || p.status === "applied") {
      totalApproved++;
      if (approvalRateByKind[p.kind]) {
        approvalRateByKind[p.kind].approved++;
      }
    } else if (p.status === "rejected") {
      totalRejected++;
      if (approvalRateByKind[p.kind]) {
        approvalRateByKind[p.kind].rejected++;
      }
    }
  }

  for (const kind of ALL_KINDS) {
    const stats = approvalRateByKind[kind];
    const totalDecided = stats.approved + stats.rejected;
    stats.rate = totalDecided > 0 ? Number((stats.approved / totalDecided).toFixed(2)) : 0;
  }

  return {
    totalProposed,
    totalApproved,
    totalRejected,
    approvalRateByKind,
    currentThresholds: { ...memoryThresholds },
    lastUpdated: new Date().toISOString(),
  };
}

export async function updateLearnedThresholds(
  patch: Partial<LearnedThresholds>,
): Promise<LearnedThresholds> {
  memoryThresholds = { ...memoryThresholds, ...patch };
  await persistToVaultFile();

  const sql = getDatabaseClient();
  if (sql) {
    try {
      await sql`
        INSERT INTO spark_proposal_learning (key, value, updated_at)
        VALUES ('thresholds', ${sql.json(memoryThresholds as any)}, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = NOW()
      `;
    } catch {
      // Memory fallback
    } finally {
      await sql.end().catch(() => {});
    }
  }

  return { ...memoryThresholds };
}
