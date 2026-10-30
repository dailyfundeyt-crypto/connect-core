/**
 * T3-Bridge — Preistabelle & Kostenermittlung (A17)
 *
 * Lane: A17 (Welle W2)
 *
 * Berechnet costUsd und cacheSavingsUsd für Turns und Token-Metriken.
 * Basiert auf der T3 LiteLLM-Preissystematik und unterstützt Standardpreise
 * für gängige Modelle sowie dynamische Overrides.
 */

import type { ModelTokenRates, TurnCostCalculation } from "./types";

/**
 * Standard-Preistabelle (Preise in USD pro 1 Million Tokens).
 */
export const DEFAULT_MODEL_RATES: Record<string, ModelTokenRates> = {
  // OpenAI Modelle
  "gpt-4o": {
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10.0,
    cacheReadCostPerMillion: 1.25,
    cacheWriteCostPerMillion: 2.5,
  },
  "gpt-4o-2024-08-06": {
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10.0,
    cacheReadCostPerMillion: 1.25,
    cacheWriteCostPerMillion: 2.5,
  },
  "gpt-4o-mini": {
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
    cacheReadCostPerMillion: 0.075,
    cacheWriteCostPerMillion: 0.15,
  },
  "o1": {
    inputCostPerMillion: 15.0,
    outputCostPerMillion: 60.0,
    cacheReadCostPerMillion: 7.5,
    cacheWriteCostPerMillion: 15.0,
  },
  "o1-mini": {
    inputCostPerMillion: 1.1,
    outputCostPerMillion: 4.4,
    cacheReadCostPerMillion: 0.55,
    cacheWriteCostPerMillion: 1.1,
  },
  "o1-preview": {
    inputCostPerMillion: 15.0,
    outputCostPerMillion: 60.0,
    cacheReadCostPerMillion: 7.5,
    cacheWriteCostPerMillion: 15.0,
  },
  "o3-mini": {
    inputCostPerMillion: 1.1,
    outputCostPerMillion: 4.4,
    cacheReadCostPerMillion: 0.55,
    cacheWriteCostPerMillion: 1.1,
  },
  "gpt-4-turbo": {
    inputCostPerMillion: 10.0,
    outputCostPerMillion: 30.0,
    cacheReadCostPerMillion: 5.0,
    cacheWriteCostPerMillion: 10.0,
  },
  "gpt-5": {
    // Vorab-Tarif für zukünftige/interne Codex-Modelle
    inputCostPerMillion: 5.0,
    outputCostPerMillion: 20.0,
    cacheReadCostPerMillion: 2.5,
    cacheWriteCostPerMillion: 5.0,
  },

  // Anthropic Modelle
  "claude-3-5-sonnet": {
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    cacheReadCostPerMillion: 0.3,
    cacheWriteCostPerMillion: 3.75,
  },
  "claude-3-5-sonnet-20241022": {
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    cacheReadCostPerMillion: 0.3,
    cacheWriteCostPerMillion: 3.75,
  },
  "claude-3-5-sonnet-20240620": {
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    cacheReadCostPerMillion: 0.3,
    cacheWriteCostPerMillion: 3.75,
  },
  "claude-3-opus": {
    inputCostPerMillion: 15.0,
    outputCostPerMillion: 75.0,
    cacheReadCostPerMillion: 1.5,
    cacheWriteCostPerMillion: 18.75,
  },
  "claude-3-opus-20240229": {
    inputCostPerMillion: 15.0,
    outputCostPerMillion: 75.0,
    cacheReadCostPerMillion: 1.5,
    cacheWriteCostPerMillion: 18.75,
  },
  "claude-3-haiku": {
    inputCostPerMillion: 0.25,
    outputCostPerMillion: 1.25,
    cacheReadCostPerMillion: 0.025,
    cacheWriteCostPerMillion: 0.3,
  },
  "claude-3-5-haiku": {
    inputCostPerMillion: 0.8,
    outputCostPerMillion: 4.0,
    cacheReadCostPerMillion: 0.08,
    cacheWriteCostPerMillion: 1.0,
  },

  // Google Gemini Modelle
  "gemini-1.5-pro": {
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 5.0,
    cacheReadCostPerMillion: 0.3125,
    cacheWriteCostPerMillion: 1.25,
  },
  "gemini-1.5-flash": {
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.3,
    cacheReadCostPerMillion: 0.01875,
    cacheWriteCostPerMillion: 0.075,
  },
  "gemini-2.0-flash": {
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    cacheReadCostPerMillion: 0.025,
    cacheWriteCostPerMillion: 0.1,
  },
  "gemini-2.0-flash-exp": {
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
    cacheReadCostPerMillion: 0.025,
    cacheWriteCostPerMillion: 0.1,
  },

  // xAI / Grok
  "grok-beta": {
    inputCostPerMillion: 5.0,
    outputCostPerMillion: 15.0,
    cacheReadCostPerMillion: 5.0,
    cacheWriteCostPerMillion: 5.0,
  },
  "grok-2": {
    inputCostPerMillion: 2.0,
    outputCostPerMillion: 10.0,
    cacheReadCostPerMillion: 2.0,
    cacheWriteCostPerMillion: 2.0,
  },

  // DeepSeek
  "deepseek-chat": {
    inputCostPerMillion: 0.14,
    outputCostPerMillion: 0.28,
    cacheReadCostPerMillion: 0.014,
    cacheWriteCostPerMillion: 0.14,
  },
  "deepseek-reasoner": {
    inputCostPerMillion: 0.55,
    outputCostPerMillion: 2.19,
    cacheReadCostPerMillion: 0.14,
    cacheWriteCostPerMillion: 0.55,
  },

  // Cursor / Hermes / Default Fallback
  "default": {
    inputCostPerMillion: 2.0,
    outputCostPerMillion: 8.0,
    cacheReadCostPerMillion: 0.5,
    cacheWriteCostPerMillion: 2.0,
  },
};

/**
 * Normalisiert Modellnamen für das Nachschlagen in der Preistabelle.
 * Entfernt Präfixe wie "openai/", "anthropic/", Datumsanhänge und Varianten wie "[128k]".
 */
export function normalizeModelName(rawModel: string): string {
  if (!rawModel || typeof rawModel !== "string") return "default";
  let name = rawModel.trim().toLowerCase();

  // Prefix entfernen (z. B. "openai/gpt-4o" -> "gpt-4o")
  const slashIdx = name.lastIndexOf("/");
  if (slashIdx >= 0) {
    name = name.slice(slashIdx + 1);
  }

  // Klammern-Suffixe entfernen (z. B. "claude-3-5-sonnet[200k]" -> "claude-3-5-sonnet")
  const bracketIdx = name.indexOf("[");
  if (bracketIdx >= 0) {
    name = name.slice(0, bracketIdx);
  }

  // Versionsnummern/Datums-Suffixe vereinfachen, falls direkter Treffer fehlt
  if (DEFAULT_MODEL_RATES[name]) {
    return name;
  }

  // Heuristiken für Varianten
  if (name.includes("gpt-4o-mini")) return "gpt-4o-mini";
  if (name.includes("gpt-4o")) return "gpt-4o";
  if (name.includes("o1-mini")) return "o1-mini";
  if (name.includes("o1-preview")) return "o1-preview";
  if (name.includes("o1")) return "o1";
  if (name.includes("o3-mini") || name.includes("o3")) return "o3-mini";
  if (name.includes("claude-3-5-sonnet")) return "claude-3-5-sonnet";
  if (name.includes("claude-3-5-haiku")) return "claude-3-5-haiku";
  if (name.includes("claude-3-opus")) return "claude-3-opus";
  if (name.includes("claude-3-haiku")) return "claude-3-haiku";
  if (name.includes("gemini-1.5-pro")) return "gemini-1.5-pro";
  if (name.includes("gemini-1.5-flash")) return "gemini-1.5-flash";
  if (name.includes("gemini-2.0-flash")) return "gemini-2.0-flash";
  if (name.includes("deepseek-reasoner") || name.includes("deepseek-r1")) return "deepseek-reasoner";
  if (name.includes("deepseek-chat") || name.includes("deepseek-v3")) return "deepseek-chat";
  if (name.includes("grok-2")) return "grok-2";
  if (name.includes("grok")) return "grok-beta";

  return "default";
}

/**
 * Preiskatalog mit Unterstützung für dynamische Overrides und Aktualisierungen.
 */
export class PricingCatalog {
  readonly #customRates = new Map<string, ModelTokenRates>();

  constructor(initialOverrides?: Record<string, ModelTokenRates>) {
    if (initialOverrides) {
      for (const [key, rates] of Object.entries(initialOverrides)) {
        this.#customRates.set(key.trim().toLowerCase(), rates);
      }
    }
  }

  /**
   * Setzt oder überschreibt die Tarife für ein bestimmtes Modell.
   */
  setRate(model: string, rates: ModelTokenRates): void {
    this.#customRates.set(model.trim().toLowerCase(), rates);
  }

  /**
   * Ruft die Raten für ein Modell ab.
   */
  getRate(model: string): ModelTokenRates {
    const directKey = model.trim().toLowerCase();
    const custom = this.#customRates.get(directKey);
    if (custom) return custom;

    const normalized = normalizeModelName(model);
    const customNorm = this.#customRates.get(normalized);
    if (customNorm) return customNorm;

    return DEFAULT_MODEL_RATES[normalized] ?? DEFAULT_MODEL_RATES["default"]!;
  }

  /**
   * Berechnet die Kosten und Cache-Einsparungen für einen Turn.
   */
  calculateCost(
    model: string,
    tokens: {
      inputTokens: number;
      cachedInputTokens?: number;
      cacheCreationTokens?: number;
      outputTokens: number;
      reasoningTokens?: number;
      costUsd?: number;
      cacheSavingsUsd?: number;
    },
  ): TurnCostCalculation {
    // Wenn Kosten bereits direkt vom Provider / Client gemeldet wurden (> 0), übernehmen wir diese
    if (typeof tokens.costUsd === "number" && tokens.costUsd > 0) {
      const savings =
        typeof tokens.cacheSavingsUsd === "number" && tokens.cacheSavingsUsd >= 0
          ? tokens.cacheSavingsUsd
          : this.calculateSavings(model, tokens.cachedInputTokens ?? 0);
      return {
        costUsd: tokens.costUsd,
        cacheSavingsUsd: savings,
        costSource: "reported",
      };
    }

    const rates = this.getRate(model);

    const uncachedInput = Math.max(0, tokens.inputTokens);
    const cachedInput = Math.max(0, tokens.cachedInputTokens ?? 0);
    const cacheCreation = Math.max(0, tokens.cacheCreationTokens ?? 0);
    const output = Math.max(0, tokens.outputTokens);

    const inputCost = (uncachedInput / 1_000_000) * rates.inputCostPerMillion;
    const cacheReadCost = (cachedInput / 1_000_000) * rates.cacheReadCostPerMillion;
    const cacheWriteCost = (cacheCreation / 1_000_000) * rates.cacheWriteCostPerMillion;
    const outputCost = (output / 1_000_000) * rates.outputCostPerMillion;

    const totalCost = inputCost + cacheReadCost + cacheWriteCost + outputCost;

    // Ersparnis durch Cache: Was hätte der ungecachte Input gekostet minus dem Cache-Lesepreis
    const cacheSavings =
      cachedInput > 0
        ? (cachedInput / 1_000_000) *
          Math.max(0, rates.inputCostPerMillion - rates.cacheReadCostPerMillion)
        : 0;

    return {
      costUsd: Number(totalCost.toFixed(6)),
      cacheSavingsUsd: Number(cacheSavings.toFixed(6)),
      costSource: "priced",
    };
  }

  /**
   * Berechnet rein die Cache-Einsparung anhand gelesener Tokens.
   */
  calculateSavings(model: string, cachedInputTokens: number): number {
    if (cachedInputTokens <= 0) return 0;
    const rates = this.getRate(model);
    const diffPerMillion = Math.max(
      0,
      rates.inputCostPerMillion - rates.cacheReadCostPerMillion,
    );
    return Number(((cachedInputTokens / 1_000_000) * diffPerMillion).toFixed(6));
  }
}

/** Globale Standardinstanz des Katalogs. */
export const defaultPricingCatalog = new PricingCatalog();
