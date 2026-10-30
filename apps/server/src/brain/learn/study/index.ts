/**
 * Spark-Learn Study Mode (Lane 4) Main Module
 *
 * Exposes:
 * - FSRS-4.5 Spaced Repetition engine
 * - AI flashcard generator with citations (QA, Cloze, MC)
 * - Cached summaries for notes, folders, and videos
 * - "Was als Nächstes lernen" knowledge-gap analyzer
 * - Study store & Hono route handler
 */

export * from "./types";
export * from "./schema";
export * from "./fsrs";
export * from "./generator";
export * from "./summarizer";
export * from "./next-up";
export * from "./store";
export * from "./routes";

import { createStudyRouter } from "./routes";
export default createStudyRouter;
