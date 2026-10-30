import { z } from "zod";
import type {
  SimulationRun,
  SimEntity,
  SimRelation,
  SimTick,
  SimInjection,
  SimReport,
  SimulationEngine,
  KnowledgeSourceRef,
} from "../../contracts/swarm-v3/types";

export type {
  SimulationRun,
  SimEntity,
  SimRelation,
  SimTick,
  SimInjection,
  SimReport,
  SimulationEngine,
  KnowledgeSourceRef,
};

export type SimAgentRole =
  | "customer_smb"
  | "customer_enterprise"
  | "customer_creator"
  | "customer_solopreneur"
  | "competitor_agressive"
  | "competitor_incumbent"
  | "team_engineer"
  | "team_operator"
  | "team_growth"
  | "investor_angel"
  | "investor_vc"
  | "market_regulator"
  | "market_skeptic";

export interface SimAgent {
  id: string;
  name: string;
  category: "customer" | "competitor" | "team" | "investor" | "market";
  role: SimAgentRole;
  personaDescription: string;
  willingnessToPay: number; // 0..100
  riskTolerance: number; // 0..1
  churnSensitivity: number; // 0..1
  influenceWeight: number; // 0.1..3.0
  activeStance?: string;
  memory: string[];
}

export interface SimMetrics {
  mrr: number; // Monthly recurring revenue (EUR)
  activeUsers: number;
  churnRatePercent: number;
  customerPerceivedValue: number; // 0..100
  runwayMonths: number;
  marketSentiment: number; // -1.0 .. +1.0
  ruinProbability: number; // 0.0 .. 1.0 (target: 0.0)
  paybackPeriodMonths: number;
}

export interface SimDecisionRecord {
  agentId: string;
  agentName: string;
  action: "adopt" | "retain" | "churn" | "upgrade" | "copy_feature" | "reduce_budget" | "advocate" | "oppose";
  rationale: string;
  impactScore: number;
}

export interface PresetScenario {
  id: string;
  name: string;
  description: string;
  frameworkRef: string; // e.g. "[100M MM · Section II › Attraction Offers · Z. 837–848]"
  chapter: string;
  injections: {
    tick: number;
    type: string;
    payload: Record<string, unknown>;
  }[];
  expectedImpact: string;
}

export interface SimulationConfig {
  runId: string;
  name: string;
  engine: SimulationEngine;
  maxTicks: number;
  budgetTokens: number;
  seed: {
    companyName?: string;
    planFiles?: string[];
    initialMrr?: number;
    initialUsers?: number;
    selectedScenarioId?: string;
    customInjections?: SimInjection[];
    [key: string]: unknown;
  };
}

export interface MiroFishAdapterStatus {
  enabled: boolean;
  active: boolean;
  port: number;
  version?: string;
  lastPing?: string;
  mode: "local-process" | "mock-fallback";
}
