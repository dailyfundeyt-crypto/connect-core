import { z } from "zod";
import type {
  CouncilSession as ContractCouncilSession,
  CouncilSeat,
  CouncilVote,
  DecisionRecord,
  AgentPersona,
  LlmProvider,
} from "../../contracts/swarm-v3/index";
import {
  CouncilSessionSchema,
  CouncilSeatSchema,
  CouncilTurnSchema,
  CouncilVoteSchema,
  DecisionRecordSchema,
} from "../../contracts/swarm-v3/index";

export type {
  CouncilSeat,
  CouncilVote,
  DecisionRecord,
  AgentPersona,
  LlmProvider,
};

export {
  CouncilSessionSchema,
  CouncilSeatSchema,
  CouncilTurnSchema,
  CouncilVoteSchema,
  DecisionRecordSchema,
};

export type CouncilSession = ContractCouncilSession;

export interface CouncilTurn {
  id?: string;
  sessionId: string;
  round: number;
  agentId: string;
  content: string;
  stance?: string;
  timestamp?: string;
  createdAt?: string;
  citations?: string[];
  isDevilsAdvocate?: boolean;
}

export type DebateRoundType = "opening" | "critique" | "rebuttal" | "devils_advocate" | "voting";

export interface ChairQuestion {
  dimension: "options" | "metrics" | "limits" | "success" | "bias";
  question: string;
  suggestion?: string;
  critical: boolean;
}

export interface ChairAnalysis {
  isSufficient: boolean;
  missingDimensions: string[];
  questions: ChairQuestion[];
  recommendedSeats: CouncilSeatRecommendation[];
}

export interface CouncilSeatRecommendation {
  agentId: string;
  pillar: string;
  role: string;
  weight: number;
  rationale: string;
}

export interface OptionScoreSummary {
  option: string;
  averageScore: number;
  totalWeightedScore: number;
  totalWeight: number;
  ruinCount: number;
  hasRuinRisk: boolean;
  bordaPoints: number;
  voteCount: number;
  status: "accepted" | "capped_ruin" | "rejected";
}

export interface ScoringResult {
  scoresByOption: Record<string, OptionScoreSummary>;
  ranking: OptionScoreSummary[];
  recommendedOption: string;
  verdict: string;
  rationale: string;
  dissent?: string;
  confidence: number;
  hasCappedOptions: boolean;
}

export interface DevilsAdvocateTrigger {
  triggered: boolean;
  reason?: string;
  leadConsensusOption?: string;
  assignedAgentId?: string;
  assignedPillar?: string;
}

export interface CouncilEventPayload {
  type:
    | "session_created"
    | "chair_analysis"
    | "seats_confirmed"
    | "round_start"
    | "turn_complete"
    | "devils_advocate_triggered"
    | "voting_start"
    | "vote_complete"
    | "decision_synthesized"
    | "memory_recorded"
    | "spark_saved"
    | "error";
  sessionId: string;
  round?: number;
  agentId?: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface ScaleStefanTemplateInput {
  companyName?: string;
  simulationReportId?: string;
  simulationReportSummary?: string;
  sparkPlanFileIds?: string[];
  customQuestion?: string;
  customOptions?: string[];
  mode?: "quick" | "full";
  provider?: LlmProvider;
}
