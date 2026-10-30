/**
 * token-estimator.ts — Token- und Kostenberechnung für Token-Sparen (A14)
 *
 * Bietet:
 *  - Robuste Schätzung von Token-Zahlen für Texte, Code und strukturierte Ausgaben
 *  - Standardpreise je Provider/Modell zur Berechnung von cacheSavingsUsd
 *    und geschätzten Ersparnissen
 */

/**
 * Schätzt die Anzahl der Tokens in einem Text.
 * Verwendet eine bewährte heuristische Token-Segmentierung:
 *  - Wörter und Satzzeichen
 *  - Whitespace-Blöcke
 *  - Codelastige Fragmente und Zeilenumbrüche
 * Für europäischen/deutschen Text und Programmiercode typisch ca. 3.5 bis 4 Zeichen pro Token.
 */
export function estimateTokenCount(text: string | null | undefined): number {
  if (!text || text.length === 0) return 0;

  // BPE-Approximation:
  // Regex teilt grob in Wortblöcke, Whitespaces, Zahlen, Sonderzeichen
  const matches = text.match(/\w+|[^\w\s]|\s+/g);
  if (!matches) {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  let count = 0;
  for (const token of matches) {
    if (token.length <= 4) {
      count += 1;
    } else {
      // Längere Segmente (z.B. Hex-Strings, Base64, lange Variablen) verbrauchen mehr Tokens
      count += Math.ceil(token.length / 3.8);
    }
  }

  return Math.max(1, Math.round(count));
}

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion: number;
  cacheWritePerMillion: number;
}

/**
 * Referenzpreise in USD pro Million Tokens (Stand Q4 2026).
 */
export const MODEL_PRICING_TABLE: Record<string, ModelPricing> = {
  // Claude 3.5 Sonnet / Opus / Haiku
  "claude-3-7-sonnet": { inputPerMillion: 3.0, outputPerMillion: 15.0, cachedInputPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  "claude-3-5-sonnet": { inputPerMillion: 3.0, outputPerMillion: 15.0, cachedInputPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  "claude-3-5-haiku": { inputPerMillion: 0.8, outputPerMillion: 4.0, cachedInputPerMillion: 0.08, cacheWritePerMillion: 1.0 },
  "claude-3-haiku": { inputPerMillion: 0.25, outputPerMillion: 1.25, cachedInputPerMillion: 0.025, cacheWritePerMillion: 0.3 },
  "claude-3-opus": { inputPerMillion: 15.0, outputPerMillion: 75.0, cachedInputPerMillion: 1.5, cacheWritePerMillion: 18.75 },

  // OpenAI GPT-4o / GPT-4o-mini
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0, cachedInputPerMillion: 1.25, cacheWritePerMillion: 2.5 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6, cachedInputPerMillion: 0.075, cacheWritePerMillion: 0.15 },
  "o1": { inputPerMillion: 15.0, outputPerMillion: 60.0, cachedInputPerMillion: 7.5, cacheWritePerMillion: 15.0 },
  "o3-mini": { inputPerMillion: 1.1, outputPerMillion: 4.4, cachedInputPerMillion: 0.55, cacheWritePerMillion: 1.1 },

  // Google Gemini 1.5 / 2.0
  "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5.0, cachedInputPerMillion: 0.3125, cacheWritePerMillion: 1.25 },
  "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3, cachedInputPerMillion: 0.01875, cacheWritePerMillion: 0.075 },
  "gemini-2.0-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4, cachedInputPerMillion: 0.025, cacheWritePerMillion: 0.1 },

  // Default Fallback
  default: { inputPerMillion: 2.0, outputPerMillion: 8.0, cachedInputPerMillion: 0.5, cacheWritePerMillion: 2.0 },
};

/**
 * Ermittelt die Preiskonfiguration für ein bestimmtes Modell.
 */
export function getPricingForModel(modelName: string): ModelPricing {
  const normalized = modelName.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING_TABLE)) {
    if (key !== "default" && normalized.includes(key)) {
      return pricing;
    }
  }
  return MODEL_PRICING_TABLE.default;
}

/**
 * Berechnet die Kostenersparnis durch Prompt Caching in USD.
 * Ersparnis = cachedTokens * (Preis_Standard_Input - Preis_Cached_Input).
 */
export function calculatePromptCacheSavingsUsd(
  modelName: string,
  cachedInputTokens: number,
): number {
  if (cachedInputTokens <= 0) return 0;
  const pricing = getPricingForModel(modelName);
  const diffPerMillion = pricing.inputPerMillion - pricing.cachedInputPerMillion;
  const savings = (cachedInputTokens / 1_000_000) * diffPerMillion;
  return Math.round(savings * 100_000) / 100_000; // Auf 5 Dezimalstellen runden
}

/**
 * Berechnet geschätzte Token-Einsparungskosten in USD.
 */
export function calculateTokenSavingsUsd(
  modelName: string,
  savedTokens: number,
): number {
  if (savedTokens <= 0) return 0;
  const pricing = getPricingForModel(modelName);
  const savings = (savedTokens / 1_000_000) * pricing.inputPerMillion;
  return Math.round(savings * 100_000) / 100_000;
}
