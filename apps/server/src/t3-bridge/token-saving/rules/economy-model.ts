/**
 * rules/economy-model.ts — Regel 5: Günstiges Modell für Zusammenfassungen und Titel (A14)
 *
 * Für Hilfsaufgaben wie:
 *  - Kontext-Zusammenfassungen (Rotation alle 100 000 Tokens, A15 / A16)
 *  - Thread-Titel-Generierung
 *  - Klassifizierung und Verschlagwortung
 *
 * muss kein teures Spitzenmodell (Claude Opus, GPT-4o, Sonnet) verwendet werden.
 * Ein schnelles, kostengünstiges Modell desselben Providers (Haiku, GPT-4o-mini, Gemini Flash)
 * liefert bei solchen Aufgaben identische Qualität zu einem Bruchteil der Kosten (-90% bis -95%).
 */

import { getPricingForModel } from "../token-estimator";

export type AuxiliaryTaskType = "summary" | "title" | "classification" | "auxiliary";

export interface EconomyModelResolution {
  provider: string;
  primaryModel: string;
  selectedModel: string;
  isEconomyModel: boolean;
  costReductionFactor: number; // z.B. 0.1 bedeutet 90% Ersparnis
}

/**
 * Standard-Zuordnungen von Spitzenmodellen zu ihren günstigen Pendants desselben Anbieters.
 */
const ECONOMY_MODEL_PAIRS: Record<string, string> = {
  // Anthropic
  "claude-3-7-sonnet": "claude-3-5-haiku",
  "claude-3-5-sonnet": "claude-3-5-haiku",
  "claude-3-opus": "claude-3-5-haiku",
  "claude-3-haiku": "claude-3-haiku",
  "claude-3-5-haiku": "claude-3-5-haiku",

  // OpenAI
  "gpt-4o": "gpt-4o-mini",
  "gpt-4-turbo": "gpt-4o-mini",
  "gpt-4": "gpt-4o-mini",
  "o1": "o3-mini",
  "o1-preview": "o3-mini",
  "o3-mini": "o3-mini",
  "gpt-4o-mini": "gpt-4o-mini",

  // Google
  "gemini-1.5-pro": "gemini-1.5-flash",
  "gemini-2.0-pro": "gemini-2.0-flash",
  "gemini-1.5-flash": "gemini-1.5-flash",
  "gemini-2.0-flash": "gemini-2.0-flash",

  // Grok
  "grok-2": "grok-2-mini",
  "grok-beta": "grok-2-mini",
};

/**
 * Wählt für eine Hilfsaufgabe das optimale Economy-Modell.
 */
export function resolveEconomyModel(
  provider: string,
  primaryModel: string,
  taskType: AuxiliaryTaskType = "summary",
  customOverrides?: Record<string, string>,
): EconomyModelResolution {
  const normModel = primaryModel.toLowerCase().trim();

  // 1. Benutzerdefinierte Überschreibung prüfen
  if (customOverrides && customOverrides[normModel]) {
    const selected = customOverrides[normModel];
    return {
      provider,
      primaryModel,
      selectedModel: selected,
      isEconomyModel: selected !== primaryModel,
      costReductionFactor: calculateModelCostRatio(primaryModel, selected),
    };
  }

  // 2. Suche in der Paartabelle
  for (const [key, economy] of Object.entries(ECONOMY_MODEL_PAIRS)) {
    if (normModel.includes(key)) {
      return {
        provider,
        primaryModel,
        selectedModel: economy,
        isEconomyModel: economy !== primaryModel,
        costReductionFactor: calculateModelCostRatio(primaryModel, economy),
      };
    }
  }

  // 3. Fallback nach Provider
  const normProv = provider.toLowerCase();
  let fallback = primaryModel;
  if (normProv.includes("anthropic") || normProv.includes("claude")) {
    fallback = "claude-3-5-haiku";
  } else if (normProv.includes("openai") || normProv.includes("codex")) {
    fallback = "gpt-4o-mini";
  } else if (normProv.includes("google") || normProv.includes("gemini")) {
    fallback = "gemini-1.5-flash";
  }

  return {
    provider,
    primaryModel,
    selectedModel: fallback,
    isEconomyModel: fallback !== primaryModel,
    costReductionFactor: calculateModelCostRatio(primaryModel, fallback),
  };
}

/**
 * Berechnet das Kostenverhältnis zwischen dem gewählten Economy-Modell und dem Primärmodell.
 */
function calculateModelCostRatio(primaryModel: string, economyModel: string): number {
  const primaryPricing = getPricingForModel(primaryModel);
  const economyPricing = getPricingForModel(economyModel);

  if (primaryPricing.inputPerMillion <= 0) return 1.0;
  return Math.min(1.0, economyPricing.inputPerMillion / primaryPricing.inputPerMillion);
}

/**
 * Berechnet die absolute Kostenersparnis in USD beim Einsatz des Economy-Modells.
 */
export function calculateAuxiliaryModelCostSavings(
  primaryModel: string,
  economyModel: string,
  inputTokens: number,
  outputTokens: number = 0,
): number {
  const primPricing = getPricingForModel(primaryModel);
  const econPricing = getPricingForModel(economyModel);

  const primCost = (inputTokens / 1_000_000) * primPricing.inputPerMillion +
                   (outputTokens / 1_000_000) * primPricing.outputPerMillion;

  const econCost = (inputTokens / 1_000_000) * econPricing.inputPerMillion +
                   (outputTokens / 1_000_000) * econPricing.outputPerMillion;

  const savings = Math.max(0, primCost - econCost);
  return Math.round(savings * 100_000) / 100_000;
}
