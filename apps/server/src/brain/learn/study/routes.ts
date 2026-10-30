/**
 * Hono HTTP Router for Spark-Learn Study Mode (Lane 4)
 *
 * Route prefix: /api/brain/learn/study/*
 *
 * Endpoints:
 * - GET    /queue            Daily review queue (due cards + new cards with FSRS intervals)
 * - POST   /review           Submit review rating (1-4) and update FSRS state
 * - GET    /cards            List and filter cards
 * - POST   /cards            Create or update card
 * - POST   /cards/generate   Generate cards from notes/chunks via CliRunner
 * - DELETE /cards/:id        Delete a card
 * - GET    /next-up          "Was als Nächstes lernen" gap-analyzer & recommendations
 * - GET    /stats            Comprehensive analytics & folder mastery stats
 * - GET    /summary          Get cached summary for note/folder/video
 * - POST   /summary/generate Generate/refresh summary via CliRunner
 * - GET    /goals            List active learning goals
 * - POST   /goals            Create or update study goal
 */

import { Hono } from "hono";
import type { Database } from "../../../db/client";
import { defaultCardGenerator } from "./generator";
import { defaultNextUpEngine } from "./next-up";
import { defaultStudyStore, StudyStore } from "./store";
import { defaultStudySummarizer } from "./summarizer";
import {
  GenerateCardsRequestSchema,
  GenerateSummaryRequestSchema,
  ReviewSubmissionSchema,
  StudyCardSchema,
  StudyGoalSchema,
} from "./types";

export function createStudyRouter(database?: Database): Hono {
  const router = new Hono();
  const store = database ? new StudyStore(database) : defaultStudyStore;

  /* ======================================================================== */
  /* Review Queue & Review Submission                                        */
  /* ======================================================================== */

  router.get("/queue", async (c) => {
    const folder = c.req.query("folder") || undefined;
    const limit = Number(c.req.query("limit")) || 20;

    const queue = await store.getDueQueue(folder, limit);
    return c.json({
      success: true,
      queue,
      totalDue: queue.length,
      folderScope: folder || null,
    });
  });

  router.post("/review", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = ReviewSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Ungültige Review-Daten.", issues: parsed.error.issues }, 400);
    }

    try {
      const result = await store.recordReview(parsed.data);
      return c.json({
        success: true,
        card: result.card,
        review: result.review,
        nextReviewPreview: result.nextReviewPreview,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 404);
    }
  });

  /* ======================================================================== */
  /* Cards Management & AI Card Generation                                   */
  /* ======================================================================== */

  router.get("/cards", async (c) => {
    const folder = c.req.query("folder") || undefined;
    const state = c.req.query("state") || undefined;
    const cardType = c.req.query("cardType") || undefined;
    const limit = Number(c.req.query("limit")) || 100;

    const cards = await store.getCards({ folder, state, cardType, limit });
    return c.json({
      success: true,
      cards,
      count: cards.length,
    });
  });

  router.post("/cards", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = StudyCardSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Ungültiges Karten-Schema.", issues: parsed.error.issues }, 400);
    }

    const saved = await store.saveCard(parsed.data);
    return c.json({ success: true, card: saved });
  });

  router.post("/cards/generate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = GenerateCardsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Ungültige Generierungs-Parameter.", issues: parsed.error.issues }, 400);
    }

    try {
      const generatedCards = await defaultCardGenerator.generateCardsForNote(parsed.data);
      // Persist newly generated cards
      await store.saveCardsBatch(generatedCards);

      return c.json({
        success: true,
        generatedCards,
        count: generatedCards.length,
      });
    } catch (err: any) {
      return c.json({ success: false, error: `Kartengenerierung fehlgeschlagen: ${err.message}` }, 500);
    }
  });

  router.delete("/cards/:id", async (c) => {
    const id = c.req.param("id");
    const ok = await store.deleteCard(id);
    return c.json({ success: ok, id });
  });

  /* ======================================================================== */
  /* "Was als Nächstes lernen" Recommendation Engine                         */
  /* ======================================================================== */

  router.get("/next-up", async (c) => {
    const folder = c.req.query("folder") || undefined;
    const cards = await store.getCards({ folder, limit: 2000 });
    const goals = await store.getGoals();

    const recommendations = await defaultNextUpEngine.getRecommendations({
      cards,
      goals,
      folderScope: folder,
    });

    return c.json({
      success: true,
      recommendations,
      count: recommendations.length,
    });
  });

  /* ======================================================================== */
  /* Analytics & Folder Mastery Statistics                                    */
  /* ======================================================================== */

  router.get("/stats", async (c) => {
    const folder = c.req.query("folder") || undefined;
    const stats = await store.getStats(folder);
    return c.json({
      success: true,
      stats,
    });
  });

  /* ======================================================================== */
  /* Summaries & Caching                                                      */
  /* ======================================================================== */

  router.get("/summary", async (c) => {
    const targetType = (c.req.query("targetType") || "note") as any;
    const targetId = c.req.query("targetId");
    if (!targetId) {
      return c.json({ success: false, error: "Parameter 'targetId' fehlt." }, 400);
    }

    const cached = await store.getSummary(targetType, targetId);
    if (cached) {
      return c.json({ success: true, summary: cached, cached: true });
    }

    // On-demand generate if missing
    const generated = await defaultStudySummarizer.generateSummary({
      targetType,
      targetId,
      forceRefresh: false,
      createProposal: false,
    });
    await store.saveSummary(generated);

    return c.json({ success: true, summary: generated, cached: false });
  });

  router.post("/summary/generate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = GenerateSummaryRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Ungültige Parameter.", issues: parsed.error.issues }, 400);
    }

    const existing = await store.getSummary(parsed.data.targetType, parsed.data.targetId);
    const summary = await defaultStudySummarizer.generateSummary(parsed.data, existing);
    await store.saveSummary(summary);

    let proposal = undefined;
    if (parsed.data.createProposal) {
      proposal = defaultStudySummarizer.createProposalFromSummary(summary);
    }

    return c.json({
      success: true,
      summary,
      proposal,
    });
  });

  /* ======================================================================== */
  /* Study Goals                                                              */
  /* ======================================================================== */

  router.get("/goals", async (c) => {
    const goals = await store.getGoals();
    return c.json({ success: true, goals });
  });

  router.post("/goals", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = StudyGoalSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: "Ungültiges Ziel-Schema.", issues: parsed.error.issues }, 400);
    }

    const saved = await store.saveGoal(parsed.data);
    return c.json({ success: true, goal: saved });
  });

  return router;
}

export default createStudyRouter;
