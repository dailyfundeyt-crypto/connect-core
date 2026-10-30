/**
 * Spark-Learn Central Router
 *
 * Integrates all 6 sub-routes under /api/brain/learn:
 * - /index      -> Lane 1: Chunks, Ollama bge-m3 Embedder, pgvector HNSW & Watcher
 * - /ask        -> Lane 2: Grounded Q&A with Citations & CliRunner (Gemini -> Codex -> Claude)
 * - /graph      -> Lane 3: Bilayer Knowledge Graph, Louvain Clustering, Guided Tours
 * - /study      -> Lane 4: FSRS-4.5 Quiz, Spaced Repetition, Summaries & Next-Up
 * - /youtube    -> Lane 5: Focus-Tube Integration, Transcripts & Video Notes
 * - /proposals  -> Lane 6: Self-Improvement Proposal-Queue, Approval & Gardener Engine
 * - /evolve     -> Alias to /proposals
 */

import { Hono } from "hono";
import type { Database } from "../../db/client";
import { createIndexRouter } from "./index";
import { createAskRouter } from "./ask";
import { createConceptGraphRouter } from "./graph";
import { createStudyRouter } from "./study";
import { createYoutubeRouter } from "./youtube";
import { createEvolveRouter } from "./evolve";

export function createLearnRouter(database?: Database): Hono {
  const router = new Hono();

  router.route("/index", createIndexRouter());
  router.route("/ask", createAskRouter());
  router.route("/graph", createConceptGraphRouter(database));
  router.route("/study", createStudyRouter(database));
  router.route("/youtube", createYoutubeRouter());
  router.route("/proposals", createEvolveRouter());
  router.route("/evolve", createEvolveRouter());

  return router;
}

export default createLearnRouter;
