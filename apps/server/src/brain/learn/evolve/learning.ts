/**
 * Self-Improvement Engine (Lane 6)
 *
 * Learns from Stefan's approvals and rejections:
 * - Adapts similarity and confidence thresholds dynamically
 * - Calibrates gardener parameters based on feedback notes
 * - Provides refined prompt guidelines for LLM proposal generation
 */

import {
  saveFeedback,
  getLearningStats,
  updateLearnedThresholds,
} from "./store";
import type {
  Proposal,
  ProposalKind,
  ProposalFeedback,
  LearningStats,
  LearnedThresholds,
} from "./types";

/**
 * Processes Stefan's decision (approval or rejection) and triggers self-improvement learning.
 */
export async function processDecisionFeedback(
  proposal: Proposal,
  approved: boolean,
  feedbackNotes?: string,
  score?: number,
): Promise<{ stats: LearningStats; updatedThresholds: LearnedThresholds }> {
  // 1. Record feedback entry
  const feedback: ProposalFeedback = {
    proposalId: proposal.id,
    kind: proposal.kind,
    approved,
    feedbackNotes,
    score,
    features: {
      sourcesCount: proposal.sources?.length ?? 0,
      hasDiff: Boolean(proposal.diff),
      rationaleLength: proposal.rationale?.length ?? 0,
    },
    createdAt: new Date().toISOString(),
  };

  await saveFeedback(feedback);

  // 2. Fetch current stats
  const stats = await getLearningStats();
  const currentThresholds = stats.currentThresholds;
  const kindStats = stats.approvalRateByKind[proposal.kind];

  const patch: Partial<LearnedThresholds> = {};

  // 3. Adaptive threshold learning
  if (!approved) {
    // If rejected, tighten thresholds to avoid noisy proposals
    const noteLower = (feedbackNotes || "").toLowerCase();

    if (proposal.kind === "add_link") {
      // Increase link similarity threshold if rejected
      const increase = noteLower.includes("unpassend") || noteLower.includes("falsch") ? 0.03 : 0.015;
      patch.minLinkSimilarity = Math.min(0.92, Number((currentThresholds.minLinkSimilarity + increase).toFixed(3)));
    } else if (proposal.kind === "merge") {
      // Tighten duplicate similarity threshold
      const increase = noteLower.includes("kein duplikat") ? 0.04 : 0.02;
      patch.minDuplicateSimilarity = Math.min(0.95, Number((currentThresholds.minDuplicateSimilarity + increase).toFixed(3)));
    } else if (proposal.kind === "tag") {
      patch.tagConfidenceThreshold = Math.min(0.85, Number((currentThresholds.tagConfidenceThreshold + 0.02).toFixed(3)));
    }
  } else {
    // If approved, verify if threshold should be slightly relaxed if acceptance is high (> 85%)
    if (kindStats.rate > 0.85 && (kindStats.approved + kindStats.rejected) >= 5) {
      if (proposal.kind === "add_link" && currentThresholds.minLinkSimilarity > 0.72) {
        patch.minLinkSimilarity = Math.max(0.72, Number((currentThresholds.minLinkSimilarity - 0.01).toFixed(3)));
      } else if (proposal.kind === "merge" && currentThresholds.minDuplicateSimilarity > 0.82) {
        patch.minDuplicateSimilarity = Math.max(0.82, Number((currentThresholds.minDuplicateSimilarity - 0.01).toFixed(3)));
      }
    }
  }

  // 4. Update thresholds if changes were made
  let updatedThresholds = currentThresholds;
  if (Object.keys(patch).length > 0) {
    updatedThresholds = await updateLearnedThresholds(patch);
  }

  const refreshedStats = await getLearningStats();
  return { stats: refreshedStats, updatedThresholds };
}

/**
 * Returns dynamic prompt guidelines for LLM agents reflecting Stefan's past feedback.
 */
export function getLearnedPromptGuidelines(stats: LearningStats): string {
  const guidelines: string[] = [
    "Richtlinien fuer Spark-Learn Vorschlaege:",
    `- Verlinkungen: Mindest-Aehnlichkeit ist derzeit ${stats.currentThresholds.minLinkSimilarity}. Nur inhaltlich praegnante Links vorschlagen.`,
    `- Duplikate / Merges: Nur bei echter thematischer Identitaet vorschlagen (Schwellenwert: ${stats.currentThresholds.minDuplicateSimilarity}).`,
    "- Niemals Notizen loeschen oder ungefragt ueberschreiben.",
  ];

  for (const [kind, s] of Object.entries(stats.approvalRateByKind)) {
    if (s.approved + s.rejected >= 3) {
      if (s.rate < 0.5) {
        guidelines.push(`- Achtung bei '${kind}': Historische Zustimmungsrate liegt bei ${(s.rate * 100).toFixed(0)}%. Besonders konservativ und mit klarer Begruendung vorschlagen.`);
      } else if (s.rate >= 0.8) {
        guidelines.push(`- '${kind}': Hohe Qualitaet (Zustimmungsrate: ${(s.rate * 100).toFixed(0)}%).`);
      }
    }
  }

  return guidelines.join("\n");
}
