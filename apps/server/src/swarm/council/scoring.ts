import type {
  CouncilVote,
  CouncilSeat,
  OptionScoreSummary,
  ScoringResult,
} from "./types";
import { AntiGroupthinkEngine } from "./anti-groupthink";

export class CouncilScoringEngine {
  /**
   * Computes the weighted average scores, Borda count ranking, ruin-risk caps,
   * and compiles the structured dissent log.
   */
  public static calculateVerdict(
    question: string,
    options: string[],
    votes: CouncilVote[],
    seats: CouncilSeat[]
  ): ScoringResult {
    const scoresByOption: Record<string, OptionScoreSummary> = {};

    // Initialize summary for all declared options
    for (const opt of options) {
      scoresByOption[opt] = {
        option: opt,
        averageScore: 0,
        totalWeightedScore: 0,
        totalWeight: 0,
        ruinCount: 0,
        hasRuinRisk: false,
        bordaPoints: 0,
        voteCount: 0,
        status: "accepted",
      };
    }

    // 1. Weighted score accumulation
    for (const vote of votes) {
      let summary = scoresByOption[vote.option];
      if (!summary) {
        summary = {
          option: vote.option,
          averageScore: 0,
          totalWeightedScore: 0,
          totalWeight: 0,
          ruinCount: 0,
          hasRuinRisk: false,
          bordaPoints: 0,
          voteCount: 0,
          status: "accepted",
        };
        scoresByOption[vote.option] = summary;
      }

      const weight = vote.weight > 0 ? vote.weight : 1.0;
      summary.totalWeightedScore += vote.score * weight;
      summary.totalWeight += weight;
      summary.voteCount += 1;
      if (vote.ruinFlag) {
        summary.ruinCount += 1;
      }
    }

    // Calculate weighted averages
    for (const summary of Object.values(scoresByOption)) {
      if (summary.totalWeight > 0) {
        summary.averageScore = Number((summary.totalWeightedScore / summary.totalWeight).toFixed(2));
      } else {
        summary.averageScore = 0;
      }
    }

    // 2. Borda count evaluation
    // Group votes by agent
    const votesByAgent = new Map<string, CouncilVote[]>();
    for (const v of votes) {
      if (!votesByAgent.has(v.agentId)) {
        votesByAgent.set(v.agentId, []);
      }
      votesByAgent.get(v.agentId)!.push(v);
    }

    for (const [agentId, agentVotes] of votesByAgent.entries()) {
      // Sort descending by score
      const sorted = [...agentVotes].sort((a, b) => b.score - a.score);
      const seat = seats.find((s) => s.agentId === agentId);
      const voterWeight = seat?.weight || 1.0;
      const n = sorted.length;

      sorted.forEach((vote, rankIndex) => {
        const points = (n - 1 - rankIndex) * voterWeight;
        if (scoresByOption[vote.option]) {
          scoresByOption[vote.option].bordaPoints += Number(points.toFixed(2));
        }
      });
    }

    // 3. Apply Ruin-Risk Cap
    const { winningOption, hasCappedWinner } = AntiGroupthinkEngine.applyRuinCap(scoresByOption);

    // 4. Rank options: safe options first (sorted by averageScore desc), then ruin-capped options
    const ranking = Object.values(scoresByOption).sort((a, b) => {
      if (a.hasRuinRisk !== b.hasRuinRisk) {
        return a.hasRuinRisk ? 1 : -1;
      }
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }
      return b.bordaPoints - a.bordaPoints;
    });

    const bestSummary = scoresByOption[winningOption] || ranking[0];

    // 5. Compile Dissent Log
    const dissentItems: string[] = [];
    for (const v of votes) {
      if (v.ruinFlag) {
        dissentItems.push(
          `⚠️ **${v.agentId}** (Ruin-Risk VETO bei "${v.option}"): ${v.rationale || "Existenzbedrohendes Risiko deklariert."}`
        );
      } else if (v.score < 5.0 && v.option === winningOption) {
        dissentItems.push(
          `⚡ **${v.agentId}** (Gegenstimme bei Gewinner "${winningOption}", Score ${v.score}/10): ${v.rationale || "Wesentliche Vorbehalte geäußert."}`
        );
      }
    }

    const dissentSummary =
      dissentItems.length > 0 ? dissentItems.join("\n") : "Einstimmiger Beschluss ohne Ruin-Vetos oder gravierenden Dissens.";

    // 6. Rationale & Verdict text
    let rationale = `Empfehlung basiert auf höchstem gewichteten Score (${bestSummary.averageScore}/10) und Borda-Rang (${bestSummary.bordaPoints} Pkt.)`;
    if (hasCappedWinner) {
      rationale += ` unter strikter Ruin-Risk-Deckelung (eine rechnerisch höhere Option wurde wegen Ruin-Gefahr disqualifiziert).`;
    } else {
      rationale += ` ohne verbleibende Ruin-Risiken.`;
    }

    const confidence = Number(
      Math.min(1.0, Math.max(0.1, bestSummary.averageScore / 10 * (hasCappedWinner ? 0.85 : 1.0))).toFixed(2)
    );

    return {
      scoresByOption,
      ranking,
      recommendedOption: winningOption,
      verdict: `Beschluss: ${winningOption}`,
      rationale,
      dissent: dissentSummary,
      confidence,
      hasCappedOptions: hasCappedWinner,
    };
  }
}
