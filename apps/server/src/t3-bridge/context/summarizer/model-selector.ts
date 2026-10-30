/**
 * T3-Bridge — Komprimierungs-Sub-Agent (Lane A16): Modell-Auswahl
 *
 * Aufgabe 1: Gleicher Provider/Modell wie der Agent (Standard), optional günstigeres Modell.
 *
 * Verwaltet:
 *  - Standardmäßig: exakt gleicher Provider und gleiches Modell wie der Hauptagent
 *  - Optional: günstigeres Modell desselben Providers für kostengünstige Kompression
 *  - Priorität: Explizite Vorgabe aus `ContextPolicy.summarizerModel` (A01)
 */

import type { ContextPolicy, T3ProviderId } from "../../contracts.js";
import type { ResolvedSummarizerModel } from "./types.js";

/**
 * Mapping von Standard-/High-End-Modellen auf günstigere Alternativen
 * desselben Providers (für schnelle und kostengünstige Kontext-Kompression).
 */
const CHEAPER_MODELS_BY_PROVIDER: Partial<
  Record<T3ProviderId, Record<string, string>>
> = {
  claudeAgent: {
    "claude-3-7-sonnet": "claude-3-5-haiku",
    "claude-3-5-sonnet": "claude-3-5-haiku",
    "claude-3-5-sonnet-20241022": "claude-3-5-haiku-20241022",
    "claude-3-opus": "claude-3-5-haiku",
    "claude-3-opus-20240229": "claude-3-5-haiku",
    "claude-3-sonnet": "claude-3-haiku-20240307",
  },
  codex: {
    "gpt-4o": "gpt-4o-mini",
    "gpt-4o-2024-08-06": "gpt-4o-mini",
    "gpt-4-turbo": "gpt-4o-mini",
    "gpt-4": "gpt-4o-mini",
    "o1": "gpt-4o-mini",
    "o1-preview": "gpt-4o-mini",
    "o3-mini": "gpt-4o-mini",
    "chatgpt-4o": "gpt-4o-mini",
  },
  grok: {
    "grok-2": "grok-2-mini",
    "grok-2-1212": "grok-2-mini",
    "grok-3": "grok-3-mini",
    "grok-beta": "grok-2-mini",
  },
  freebuff: {
    "gemini-1.5-pro": "gemini-1.5-flash",
    "gemini-1.5-pro-latest": "gemini-1.5-flash",
    "gemini-2.0-flash-exp": "gemini-1.5-flash",
    "gemini-exp-1206": "gemini-1.5-flash",
  },
  antigravity: {
    "gemini-1.5-pro": "gemini-1.5-flash",
    "gemini-2.0-pro": "gemini-1.5-flash",
  },
  hermes: {
    "hermes-3-llama-3.1-405b": "hermes-3-llama-3.1-8b",
    "hermes-3-llama-3.1-70b": "hermes-3-llama-3.1-8b",
  },
  opencode: {
    "deepseek-reasoner": "deepseek-chat",
  },
};

/**
 * Standard-Günstigmodell je Provider, falls das konkrete Agentenmodell
 * nicht in der Feintabelle gelistet ist.
 */
const DEFAULT_CHEAP_MODEL_PER_PROVIDER: Partial<Record<T3ProviderId, string>> = {
  claudeAgent: "claude-3-5-haiku",
  codex: "gpt-4o-mini",
  grok: "grok-2-mini",
  freebuff: "gemini-1.5-flash",
  antigravity: "gemini-1.5-flash",
  hermes: "hermes-3-llama-3.1-8b",
  opencode: "deepseek-chat",
};

/**
 * Ermittelt das zu verwendende Modell für den Komprimierungs-Sub-Agenten.
 *
 * Regeln:
 * 1. Falls in `policy.summarizerModel` ein Modell hinterlegt ist, gilt dieses.
 * 2. Falls `useCheaperModel === true` gewünscht ist, wird ein kostengünstiges
 *    Modell desselben Providers gewählt (z. B. haiku statt sonnet, mini statt 4o).
 * 3. Standard: Exakt dasselbe Modell und derselbe Provider wie beim Agenten.
 */
export function resolveSummarizerModel(params: {
  readonly provider: T3ProviderId;
  readonly agentModel: string;
  readonly policy?: Partial<ContextPolicy>;
  readonly useCheaperModel?: boolean;
}): ResolvedSummarizerModel {
  const { provider, agentModel, policy, useCheaperModel = false } = params;

  // 1. Explizite Modellvorgabe aus der ContextPolicy des Agenten
  if (policy?.summarizerModel && policy.summarizerModel.trim().length > 0) {
    return {
      provider,
      model: policy.summarizerModel.trim(),
      isCheaperModel: false,
    };
  }

  // 2. Günstigeres Modell desselben Providers
  if (useCheaperModel) {
    const providerMap = CHEAPER_MODELS_BY_PROVIDER[provider];
    if (providerMap && providerMap[agentModel]) {
      return {
        provider,
        model: providerMap[agentModel],
        isCheaperModel: true,
      };
    }

    const fallbackCheap = DEFAULT_CHEAP_MODEL_PER_PROVIDER[provider];
    if (fallbackCheap && fallbackCheap !== agentModel) {
      return {
        provider,
        model: fallbackCheap,
        isCheaperModel: true,
      };
    }
  }

  // 3. Standard: Gleicher Provider und gleiches Modell wie der Agent
  return {
    provider,
    model: agentModel,
    isCheaperModel: false,
  };
}
