/**
 * Swarm-v3 Adapter Types (Lane 8: Agent 8).
 *
 * Interfaces for LLM providers (Gemini CLI, API, Mock),
 * token tracking, budget estimation, and execution options.
 */

import type { LlmProvider, Privacy } from "../../contracts/swarm-v3/index";

export interface LlmExecutionOptions {
  provider?: LlmProvider;
  model?: string;
  systemPrompt?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  agentId?: string;
  profileDir?: string;
  persona?: {
    agentId?: string;
    pillar?: string;
    ownedQuestion?: string;
    values?: any;
    riskProfile?: string;
    voice?: string;
    knowledgeSources?: string[];
  };
  sources?: string[];
  jsonSchema?: Record<string, unknown>;
  expectedJson?: boolean;
}

export interface LlmExecutionResult {
  ok: boolean;
  text: string;
  parsedJson?: any;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  provider: LlmProvider;
  model: string;
  error?: string;
  retries: number;
}

export interface LlmAdapter {
  name: LlmProvider;
  execute(options: LlmExecutionOptions): Promise<LlmExecutionResult>;
}

/**
 * Approximate token count helper: ~4 characters per token in English/code.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Standard cost calculation helper (USD per 1M tokens)
 * Gemini Flash pricing default: $0.10 / 1M input, $0.40 / 1M output
 */
export function calculateEstimatedCost(
  inputTokens: number,
  outputTokens: number,
  inputPricePerM: number = 0.10,
  outputPricePerM: number = 0.40
): number {
  const cost = (inputTokens / 1_000_000) * inputPricePerM + (outputTokens / 1_000_000) * outputPricePerM;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
