/**
 * Swarm-v3 Mock LLM Adapter (Lane 8).
 *
 * Provides fast, deterministic, schema-compliant responses for Council turns,
 * votes, simulation ticks, and persona debates. Used for unit tests, offline
 * development, and fast fallback.
 */

import type {
  LlmAdapter,
  LlmExecutionOptions,
  LlmExecutionResult,
} from "./adapter-types";
import { estimateTokens, calculateEstimatedCost } from "./adapter-types";
import { mockCouncilSessions, mockAgentPersonas } from "../../contracts/swarm-v3/index";

export class MockLlmAdapter implements LlmAdapter {
  public readonly name = "mock" as const;

  public async execute(options: LlmExecutionOptions): Promise<LlmExecutionResult> {
    const startTime = Date.now();
    const prompt = options.prompt || "";
    const agentId = options.agentId || options.persona?.agentId || "agent-hormozi";
    const pillar = options.persona?.pillar || "Offer & Pricing";

    let responseText = "";
    let parsedJson: any = null;

    if (prompt.includes("council.vote") || prompt.includes("CouncilVote") || prompt.includes("Gib deine Bewertung ab")) {
      // Mock Council Vote
      parsedJson = {
        sessionId: "mock-session-01",
        agentId,
        option: "Option A",
        score: agentId.includes("skeptic") ? 4 : 8.5,
        weight: 1.0,
        ruinFlag: agentId.includes("skeptic") ? false : false,
        rationale: `Aus Sicht von ${pillar} bietet diese Option die stärkste Wertschöpfung bei kontrollierbarem Risiko.`,
      };
      responseText = JSON.stringify(parsedJson, null, 2);
    } else if (prompt.includes("council.turn") || prompt.includes("CouncilTurn") || prompt.includes("Debattenrunde")) {
      // Mock Council Turn
      parsedJson = {
        sessionId: "mock-session-01",
        round: 1,
        agentId,
        stance: agentId.includes("skeptic") ? "skeptisch" : "befürwortend",
        content: `Als ${pillar} analysiere ich die Fragestellung: Die Skalierung erfordert eine klare Wertgleichung und minimale Reibung im Funnel.`,
        timestamp: new Date().toISOString(),
      };
      responseText = JSON.stringify(parsedJson, null, 2);
    } else if (prompt.includes("sim_tick") || prompt.includes("SimulationTick")) {
      // Mock Sim Tick
      parsedJson = {
        tick: 1,
        event: "Markt-Adoption steigt um 12%",
        stateSummary: { activeUsers: 1420, churnRate: 0.02, runwayMonths: 18 },
        timestamp: new Date().toISOString(),
      };
      responseText = JSON.stringify(parsedJson, null, 2);
    } else if (options.expectedJson) {
      parsedJson = {
        status: "success",
        agentId,
        analysis: `Strukturierte Analyse basierend auf ${pillar}.`,
        confidence: 0.92,
      };
      responseText = JSON.stringify(parsedJson, null, 2);
    } else {
      responseText = `[Mock-Response für ${agentId} (${pillar})]: Die vorgeschlagene Vorgehensweise ist fundiert und risikoarm.`;
    }

    const durationMs = Date.now() - startTime;
    const inputTokens = estimateTokens(prompt + (options.systemPrompt || ""));
    const outputTokens = estimateTokens(responseText);
    const totalTokens = inputTokens + outputTokens;
    const estimatedCostUsd = calculateEstimatedCost(inputTokens, outputTokens);

    return {
      ok: true,
      text: responseText,
      parsedJson,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd,
      durationMs,
      provider: "mock",
      model: options.model || "mock-gemini-v3",
      retries: 0,
    };
  }
}
