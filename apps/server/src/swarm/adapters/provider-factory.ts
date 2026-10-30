/**
 * Swarm-v3 Provider Factory (Lane 8).
 *
 * Provides single-point instantiation of LLM providers:
 * - 'gemini-cli' (GeminiCliAdapter)
 * - 'api' (ApiLlmAdapter)
 * - 'mock' (MockLlmAdapter)
 */

import type { LlmProvider } from "../../contracts/swarm-v3/index";
import type { LlmAdapter } from "./adapter-types";
import { GeminiCliAdapter } from "./gemini-cli-adapter";
import { ApiLlmAdapter } from "./api-adapter";
import { MockLlmAdapter } from "./mock-adapter";

const instances: Partial<Record<LlmProvider, LlmAdapter>> = {};

export function getLlmAdapter(provider: LlmProvider = "gemini-cli"): LlmAdapter {
  if (!instances[provider]) {
    switch (provider) {
      case "gemini-cli":
        instances[provider] = new GeminiCliAdapter();
        break;
      case "api":
        instances[provider] = new ApiLlmAdapter();
        break;
      case "mock":
      default:
        instances[provider] = new MockLlmAdapter();
        break;
    }
  }
  return instances[provider]!;
}
