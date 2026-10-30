/**
 * Swarm-v3 Council Adapter (Lane 8: Agent 8).
 *
 * Bridges the Council Debate Protocol (Lane 6) into the Swarm-Controller:
 * - Runs seat turns with Persona context
 * - Executes seat votes (0-10, weight, ruinFlag, rationale)
 * - Synthesizes debate turns and votes into final DecisionRecord
 * - Respects Profile-Lock per agent seat
 */

import type {
  CouncilSession,
  CouncilSeat,
  CouncilTurn,
  CouncilVote,
  DecisionRecord,
  AgentPersona,
} from "../../contracts/swarm-v3/index";
import { getLlmAdapter } from "./provider-factory";
import type { LlmProvider } from "../../contracts/swarm-v3/index";

export interface CouncilTurnRequest {
  session: CouncilSession;
  seat: CouncilSeat;
  round: number;
  persona?: AgentPersona;
  previousTurns?: CouncilTurn[];
  provider?: LlmProvider;
}

export interface CouncilVoteRequest {
  session: CouncilSession;
  seat: CouncilSeat;
  options: string[];
  persona?: AgentPersona;
  turns?: CouncilTurn[];
  provider?: LlmProvider;
}

export async function runCouncilTurn(req: CouncilTurnRequest): Promise<CouncilTurn> {
  const adapter = getLlmAdapter(req.provider || "gemini-cli");
  const previousTurnsSummary = (req.previousTurns || [])
    .map((t) => `Agent [${t.agentId}] (Runde ${t.round}): ${t.content}`)
    .join("\n\n");

  const prompt = [
    `Fragestellung für das Council: "${req.session.question}"`,
    req.session.context ? `Kontext: ${req.session.context}` : "",
    previousTurnsSummary ? `Bisherige Beiträge:\n${previousTurnsSummary}` : "",
    `Du bist Sitzungsmitglied "${req.seat.agentId}" (Rolle: ${req.seat.role || "Council Member"}).`,
    `Nimm jetzt in Runde ${req.round} fundiert Stellung. Begründe deine Position und nenne deine Haltung (z.B. befürwortend, skeptisch, neutral).`,
    `Antworte als JSON mit den Feldern: "stance" (string) und "content" (string).`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await adapter.execute({
    prompt,
    agentId: req.seat.agentId,
    persona: req.persona,
    expectedJson: true,
  });

  const parsed = res.parsedJson || {};
  return {
    sessionId: req.session.id,
    round: req.round,
    agentId: req.seat.agentId,
    stance: parsed.stance || "neutral",
    content: parsed.content || res.text || `Stellungnahme von ${req.seat.agentId} zu Runde ${req.round}.`,
    timestamp: new Date().toISOString(),
  };
}

export async function runCouncilVote(req: CouncilVoteRequest): Promise<CouncilVote[]> {
  const adapter = getLlmAdapter(req.provider || "gemini-cli");
  const votes: CouncilVote[] = [];

  for (const option of req.options) {
    const prompt = [
      `Fragestellung: "${req.session.question}"`,
      `Zu bewertende Option: "${option}"`,
      `Bewerte diese Option auf einer Skala von 0 bis 10.`,
      `Prüfe, ob diese Option ein existenzbedrohendes Risiko ("Ruin Problem") darstellt.`,
      `Antworte als JSON mit den Feldern:`,
      `"score" (Zahl 0 bis 10), "ruinFlag" (boolean), "rationale" (string, max 2 Sätze).`,
    ].join("\n\n");

    const res = await adapter.execute({
      prompt,
      agentId: req.seat.agentId,
      persona: req.persona,
      expectedJson: true,
    });

    const parsed = res.parsedJson || {};
    const score = typeof parsed.score === "number" ? Math.min(10, Math.max(0, parsed.score)) : 7.0;
    const ruinFlag = Boolean(parsed.ruinFlag);
    const rationale = parsed.rationale || `Bewertung durch ${req.seat.agentId}: Score ${score}/10.`;

    votes.push({
      sessionId: req.session.id,
      agentId: req.seat.agentId,
      option,
      score,
      weight: req.seat.weight || 1.0,
      ruinFlag,
      rationale,
    });
  }

  return votes;
}

export function synthesizeCouncilVerdict(
  session: CouncilSession,
  turns: CouncilTurn[],
  votes: CouncilVote[]
): DecisionRecord {
  // Aggregate scores by option
  const optionScores: Record<string, { totalWeightedScore: number; totalWeight: number; ruinCount: number }> = {};

  for (const vote of votes) {
    if (!optionScores[vote.option]) {
      optionScores[vote.option] = { totalWeightedScore: 0, totalWeight: 0, ruinCount: 0 };
    }
    optionScores[vote.option].totalWeightedScore += vote.score * vote.weight;
    optionScores[vote.option].totalWeight += vote.weight;
    if (vote.ruinFlag) {
      optionScores[vote.option].ruinCount++;
    }
  }

  let bestOption = "";
  let highestAverage = -1;
  const summaries: string[] = [];

  for (const [option, stats] of Object.entries(optionScores)) {
    const avg = stats.totalWeight > 0 ? stats.totalWeightedScore / stats.totalWeight : 0;
    const hasRuin = stats.ruinCount > 0;
    summaries.push(`- **${option}**: Schnitt ${avg.toFixed(2)}/10 ${hasRuin ? "⚠️ (Ruin-Flag gesetzt!)" : "✅"}`);

    if (!hasRuin && avg > highestAverage) {
      highestAverage = avg;
      bestOption = option;
    }
  }

  if (!bestOption) {
    bestOption = Object.keys(optionScores)[0] || "Keine Option verabschiedet";
  }

  const dissentingVotes = votes.filter((v) => v.ruinFlag || v.score < 5);
  const dissentSummary = dissentingVotes.length > 0
    ? dissentingVotes.map((v) => `${v.agentId}: ${v.rationale} (Score: ${v.score})`).join("; ")
    : undefined;

  const recordMd = [
    `# Council Decision Record: ${session.question}`,
    `**Session-ID:** ${session.id}`,
    `**Datum:** ${new Date().toISOString()}`,
    `\n## Ergebnis & Votum`,
    `Das Council empfiehlt: **${bestOption}** (Score: ${highestAverage >= 0 ? highestAverage.toFixed(2) : "N/A"}/10)`,
    `\n## Bewertung der Optionen`,
    ...summaries,
    `\n## Wichtigste Argumente aus der Debatte`,
    ...turns.map((t) => `- **${t.agentId}** (${t.stance || "neutral"}): ${t.content}`),
    dissentSummary ? `\n## Dissent & Risikohinweise\n${dissentSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    sessionId: session.id,
    verdict: `Empfehlung: ${bestOption}`,
    rationale: `Beste gewichtete Gesamtwertung (${highestAverage.toFixed(2)}/10) ohne Ruin-Risiko.`,
    dissent: dissentSummary,
    confidence: Math.min(1.0, Math.max(0.1, highestAverage / 10)),
    recordMd,
    createdAt: new Date().toISOString(),
  };
}
