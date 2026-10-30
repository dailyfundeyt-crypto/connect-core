/**
 * Spark-Learn Proposals & Evolve HTTP Routes (Lane 6)
 *
 * Mount path: /api/brain/learn/proposals (or /api/brain/learn/evolve)
 */

import { Hono } from "hono";
import {
  SparkProposeParamsSchema,
  ProposalKindSchema,
  ProposalStatusSchema,
} from "../contracts";
import {
  saveProposal,
  getProposal,
  listProposals,
  updateProposalStatus,
  getLearningStats,
} from "./store";
import { applyProposal } from "./apply";
import { GardenerEngine } from "./gardener";
import { processDecisionFeedback } from "./learning";
import { notifyStefanOfProposal } from "./ask-human";
import { recordAuditLog } from "./audit";
import { computeProposalDiff } from "./diff";
import type { Proposal, GardenerJobKind } from "./types";

export function createEvolveRouter(): Hono {
  const router = new Hono();

  /**
   * GET /
   * Lists proposals with optional filters: ?status=pending&kind=add_link&limit=50
   */
  router.get("/", async (c) => {
    try {
      const statusParam = c.req.query("status");
      const kindParam = c.req.query("kind");
      const limitParam = c.req.query("limit");

      const status = statusParam ? ProposalStatusSchema.safeParse(statusParam).data : undefined;
      const kind = kindParam ? ProposalKindSchema.safeParse(kindParam).data : undefined;
      const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

      const proposals = await listProposals({ status, kind, limit });
      return c.json({
        success: true,
        total: proposals.length,
        proposals,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * GET /stats
   * Retrieves self-improvement learning statistics and current thresholds.
   */
  router.get("/stats", async (c) => {
    try {
      const stats = await getLearningStats();
      return c.json({ success: true, stats });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /
   * Creates a new proposal (used by agents, Lane 7 spark_propose tool, or gardener).
   */
  router.post("/", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = SparkProposeParamsSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ success: false, error: "Ungueltige Proposal-Parameter", details: parsed.error.issues }, 400);
      }

      const { kind, payload, rationale, sources, diff: providedDiff } = parsed.data;
      const id = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const diff = providedDiff || computeProposalDiff({ kind, payload });

      const proposal: Proposal = {
        id,
        kind,
        payload,
        diff,
        rationale,
        sources: sources || [],
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const saved = await saveProposal(proposal);
      await notifyStefanOfProposal(saved);

      await recordAuditLog({
        toolName: "spark_propose",
        agentName: (body as any).createdBy || "spark_agent",
        paramsSummary: `Created proposal #${id} (${kind}): ${rationale.slice(0, 100)}`,
        status: "success",
      });

      return c.json({ success: true, proposal: saved }, 201);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * GET /:id
   * Retrieves a single proposal by ID.
   */
  router.get("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const proposal = await getProposal(id);
      if (!proposal) {
        return c.json({ success: false, error: "Proposal nicht gefunden" }, 404);
      }
      return c.json({ success: true, proposal });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /:id/approve
   * Approves a proposal and triggers self-improvement learning.
   */
  router.post("/:id/approve", async (c) => {
    try {
      const id = c.req.param("id");
      const proposal = await getProposal(id);
      if (!proposal) {
        return c.json({ success: false, error: "Proposal nicht gefunden" }, 404);
      }

      const updated = await updateProposalStatus(id, "approved", {
        decidedAt: new Date().toISOString(),
      });

      const learningResult = await processDecisionFeedback(proposal, true);

      await recordAuditLog({
        toolName: "spark_proposal_approve",
        agentName: "stefan",
        paramsSummary: `Approved proposal #${id} (${proposal.kind})`,
        status: "success",
      });

      return c.json({
        success: true,
        proposal: updated,
        learning: learningResult,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /:id/reject
   * Rejects a proposal with optional feedback reason, updating learned thresholds.
   */
  router.post("/:id/reject", async (c) => {
    try {
      const id = c.req.param("id");
      const proposal = await getProposal(id);
      if (!proposal) {
        return c.json({ success: false, error: "Proposal nicht gefunden" }, 404);
      }

      const body = await c.req.json().catch(() => ({}));
      const reason = typeof body?.reason === "string" ? body.reason : undefined;
      const score = typeof body?.score === "number" ? body.score : undefined;

      const updated = await updateProposalStatus(id, "rejected", {
        decidedAt: new Date().toISOString(),
        rejectionReason: reason,
      });

      const learningResult = await processDecisionFeedback(proposal, false, reason, score);

      await recordAuditLog({
        toolName: "spark_proposal_reject",
        agentName: "stefan",
        paramsSummary: `Rejected proposal #${id} (${proposal.kind}): ${reason ?? "keine Begruendung"}`,
        status: "denied",
        statusDetail: reason,
      });

      return c.json({
        success: true,
        proposal: updated,
        learning: learningResult,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /:id/apply
   * Applies an approved proposal to the Vault (creates .bak backup, updates files, logs).
   */
  router.post("/:id/apply", async (c) => {
    try {
      const id = c.req.param("id");
      const proposal = await getProposal(id);
      if (!proposal) {
        return c.json({ success: false, error: "Proposal nicht gefunden" }, 404);
      }

      if (proposal.status === "applied") {
        return c.json({ success: false, error: "Proposal wurde bereits angewendet" }, 400);
      }

      const result = await applyProposal(proposal);
      if (!result.success) {
        return c.json({ success: false, error: result.error, result }, 500);
      }

      const updated = await getProposal(id);
      return c.json({ success: true, result, proposal: updated });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /gardener/run
   * Triggers an autonomous or manual gardener maintenance scan.
   */
  router.post("/gardener/run", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const jobKind: GardenerJobKind = body?.kind || "all";
      const options = {
        dryRun: Boolean(body?.dryRun),
        folderScope: typeof body?.folderScope === "string" ? body.folderScope : undefined,
        maxProposals: typeof body?.maxProposals === "number" ? body.maxProposals : 10,
        minSimilarity: typeof body?.minSimilarity === "number" ? body.minSimilarity : undefined,
      };

      const result = await GardenerEngine.runJob(jobKind, options);
      return c.json({ success: true, result });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  return router;
}
