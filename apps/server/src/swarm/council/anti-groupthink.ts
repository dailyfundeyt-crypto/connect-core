import type {
  CouncilTurn,
  CouncilSeat,
  DevilsAdvocateTrigger,
  OptionScoreSummary,
} from "./types";

export class AntiGroupthinkEngine {
  /**
   * Checks whether the council has converged too quickly into unanimous agreement
   * without sufficient adversarial friction (echo chamber prevention).
   */
  public static evaluateConsensus(
    turns: CouncilTurn[],
    seats: CouncilSeat[],
    currentRound: number
  ): DevilsAdvocateTrigger {
    if (turns.length === 0 || currentRound < 1) {
      return { triggered: false };
    }

    const recentTurns = turns.filter((t) => t.round === currentRound);
    if (recentTurns.length < 2) {
      return { triggered: false };
    }

    // Check stances: are all turns positive or leaning the same way?
    let proCount = 0;
    let contraCount = 0;
    let neutralCount = 0;

    for (const turn of recentTurns) {
      const text = `${turn.stance || ""} ${turn.content}`.toLowerCase();
      const isContra =
        text.includes("kontra") ||
        text.includes("dagegen") ||
        text.includes("skeptisch") ||
        text.includes("ablehnend") ||
        text.includes("risiko") ||
        text.includes("gefahr") ||
        text.includes("kritik") ||
        text.includes("vorbehalt");

      const isPro =
        text.includes("dafür") ||
        text.includes("befürwort") ||
        text.includes("pro") ||
        text.includes("empfehl") ||
        text.includes("optimal") ||
        text.includes("überzeugt");

      if (isContra && !isPro) {
        contraCount++;
      } else if (isPro) {
        proCount++;
      } else {
        neutralCount++;
      }
    }

    // Trigger condition:
    // If >= 80% of votes/turns are uncritical pro, or no contrarian stance at all
    const isUnanimousPro = proCount >= 2 && contraCount === 0;

    if (isUnanimousPro) {
      // Pick the best agent to play Devil's Advocate
      // Priority 1: agent_skeptic_ruin
      // Priority 2: agent_cfo_cashflow
      // Priority 3: first seat
      const skepticSeat =
        seats.find((s) => s.agentId === "agent_skeptic_ruin") ||
        seats.find((s) => s.agentId === "agent_cfo_cashflow") ||
        seats[0];

      return {
        triggered: true,
        reason:
          "Zu schnelle Einigkeit im Council (Anti-Groupthink-Trigger). Alle Teilnehmer neigen zur selben Lösung ohne kritische Dekonstruktion.",
        assignedAgentId: skepticSeat ? skepticSeat.agentId : "agent_skeptic_ruin",
        assignedPillar: "Risk & Governance / Contrarian Reality Check",
      };
    }

    return { triggered: false };
  }

  /**
   * Builds the strict Devil's Advocate challenge prompt.
   * Compels the agent to challenge the prevailing consensus, find fatal second-order consequences,
   * and argue why standard textbook playbooks fail in this specific real-world case.
   */
  public static buildDevilsAdvocatePrompt(
    question: string,
    consensusSummary: string,
    agentId: string,
    isHormoziDebate = false
  ): string {
    const specificInstructions = isHormoziDebate
      ? `Argumentiere explizit gegen das $100M-Framework von Alex Hormozi für Stefans konkrete Firma (Host 'Kunc GmbH', B2B-Plattform 'Connect'). Zeige auf, wo das Buch 'Money Models' an der Realität kleinerer lokaler B2B-Märkte scheitert oder Stefans persönliche Teamkapazität sprengt.`
      : `Zerstöre die optimistische Hauptannahme der Gruppe mit schonungsloser Härte. Zeige das verdeckte Ruin-Problem und die fatale Zweitrunden-Wirkung auf.`;

    return [
      `🚨 [ANTI-GROUPTHINK INTERVENTION: DEVIL'S ADVOCATE RUNDE] 🚨`,
      `Fragestellung: "${question}"`,
      `Bisheriger Konsens der Gruppe:`,
      consensusSummary,
      `\nDeine Aufgabe als Devil's Advocate (${agentId}):`,
      specificInstructions,
      `Verwende keine Floskeln. Finde mindestens 2 ungelöste Schwachstellen oder fatale Risiken.`,
      `Antworte strukturiert als JSON mit "stance": "kontra_consensus" und "content": "<Deine Kritik>".`,
    ].join("\n\n");
  }

  /**
   * Applies the Ruin-Risk Cap to all evaluated options.
   * If any option has a ruinFlag raised by any council seat, it is strictly capped:
   * It cannot be chosen as the winning recommendation if an uncompromised alternative exists.
   */
  public static applyRuinCap(
    optionsMap: Record<string, OptionScoreSummary>
  ): { winningOption: string; hasCappedWinner: boolean } {
    const options = Object.values(optionsMap);
    if (options.length === 0) {
      return { winningOption: "", hasCappedWinner: false };
    }

    // Mark statuses
    for (const opt of options) {
      if (opt.ruinCount > 0) {
        opt.hasRuinRisk = true;
        opt.status = "capped_ruin";
      } else {
        opt.status = "accepted";
      }
    }

    // Separate clean options from ruin-flagged options
    const safeOptions = options.filter((o) => !o.hasRuinRisk);
    const sortedSafe = [...safeOptions].sort((a, b) => b.averageScore - a.averageScore);
    const sortedAll = [...options].sort((a, b) => b.averageScore - a.averageScore);

    if (sortedSafe.length > 0) {
      const topSafe = sortedSafe[0];
      const highestOverall = sortedAll[0];
      const hasCappedWinner = highestOverall.hasRuinRisk && highestOverall.option !== topSafe.option;

      return {
        winningOption: topSafe.option,
        hasCappedWinner,
      };
    }

    // If ALL options have ruin flags, choose the one with the fewest ruin flags and highest score, but warn heavily
    return {
      winningOption: sortedAll[0].option,
      hasCappedWinner: true,
    };
  }
}
