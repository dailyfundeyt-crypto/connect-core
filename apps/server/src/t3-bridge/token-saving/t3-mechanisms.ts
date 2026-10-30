/**
 * t3-mechanisms.ts — T3-Mechanismen für Token-Sparen (A14)
 *
 * Beinhaltet:
 *  1. Sessions fortsetzen statt neu starten (Prompt-Cache-Treffer & cacheSavingsUsd)
 *  2. Erkennung und Ausführung von T3-Slash-Befehlen wie `/compact`
 *  3. Dokumentation und Berechnungsformeln für Prompt-Caching-Gewinne
 */

import { calculatePromptCacheSavingsUsd, estimateTokenCount } from "./token-estimator";
import type { TurnInputBundle } from "./types";

export interface SessionContinuationAnalysis {
  isResumed: boolean;
  threadId?: string;
  estimatedCachedTokens: number;
  cacheSavingsUsd: number;
  cacheHitRatio: number;
  advice: string;
}

/**
 * Analysiert, ob ein Turn eine bestehende Session fortsetzt und wie hoch
 * der daraus resultierende Prompt-Cache-Vorteil ist.
 *
 * Hintergrund:
 * Anthropic, OpenAI und Google bieten Prompt Caching für unveränderte Präfixe.
 * Ein neuer Turn in derselben Session liest die bestehende Historie und System-Prompts
 * aus dem Cache (bei Claude z.B. 90% Rabatt: $0.30 statt $3.00 pro Mio. Tokens).
 */
export function evaluateSessionContinuation(
  bundle: TurnInputBundle,
  actualCachedTokens?: number,
): SessionContinuationAnalysis {
  const isResumed = Boolean(bundle.isResumedSession || bundle.threadId);

  // Wenn T3 tatsächliche Cache-Tokens gemeldet hat, nehmen wir diese
  if (actualCachedTokens !== undefined && actualCachedTokens > 0) {
    const totalInput = estimateTokenCount(bundle.systemPrompt) +
      (bundle.history?.reduce((acc, h) => acc + estimateTokenCount(h.content), 0) ?? 0) +
      estimateTokenCount(bundle.userPrompt);

    const cacheSavingsUsd = calculatePromptCacheSavingsUsd(bundle.model, actualCachedTokens);
    const hitRatio = totalInput > 0 ? Math.min(1.0, actualCachedTokens / totalInput) : 0;

    return {
      isResumed: true,
      threadId: bundle.threadId,
      estimatedCachedTokens: actualCachedTokens,
      cacheSavingsUsd,
      cacheHitRatio: Math.round(hitRatio * 100) / 100,
      advice: "Session erfolgreich fortgesetzt: Hohe Prompt-Cache-Ausnutzung.",
    };
  }

  // Schätzung anhand der Historie und des System-Prompts
  if (!isResumed) {
    return {
      isResumed: false,
      threadId: undefined,
      estimatedCachedTokens: 0,
      cacheSavingsUsd: 0,
      cacheHitRatio: 0,
      advice: "Neue Session: Keine Prompt-Cache-Treffer für den bisherigen Verlauf.",
    };
  }

  // Historie + System-Prompt bilden den gecachten Präfix
  let prefixTokens = estimateTokenCount(bundle.systemPrompt);
  if (bundle.history && bundle.history.length > 0) {
    for (const h of bundle.history) {
      prefixTokens += estimateTokenCount(h.content);
    }
  }

  // Mindestgröße für Prompt-Caching (Präfix ab ca. 512 Tokens cachebar)
  const estimatedCachedTokens = prefixTokens >= 512 ? Math.floor(prefixTokens * 0.95) : 0;
  const cacheSavingsUsd = calculatePromptCacheSavingsUsd(bundle.model, estimatedCachedTokens);
  const totalTokens = prefixTokens + estimateTokenCount(bundle.userPrompt);
  const cacheHitRatio = totalTokens > 0 ? estimatedCachedTokens / totalTokens : 0;

  return {
    isResumed: true,
    threadId: bundle.threadId,
    estimatedCachedTokens,
    cacheSavingsUsd,
    cacheHitRatio: Math.round(cacheHitRatio * 100) / 100,
    advice: estimatedCachedTokens > 0
      ? `Session fortgesetzt: Ca. ${estimatedCachedTokens} Tokens aus dem Cache wiederverwendet.`
      : "Session fortgesetzt, aber Präfix unter der Mindestgröße für Prompt-Caching (< 1024 Tokens).",
  };
}

export interface SlashCommandDetection {
  isSlashCommand: boolean;
  command?: string;
  args?: string;
  isCompactCommand: boolean;
  instruction?: string;
}

/**
 * Erkennt T3-kompatible Slash-Befehle im unveränderten Nutzer-Text.
 * Wichtig: Verändert den Text nicht, liefert nur Metadaten zur Ausführung.
 */
export function detectSlashCommand(rawUserText: string): SlashCommandDetection {
  const trimmed = rawUserText.trim();
  if (!trimmed.startsWith("/")) {
    return { isSlashCommand: false, isCompactCommand: false };
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1).join(" ").trim();

  if (command === "/compact" || command === "/kompakt") {
    return {
      isSlashCommand: true,
      command: "/compact",
      args,
      isCompactCommand: true,
      instruction: "Kontext-Kompaktierung angefordert. Bisherigen Verlauf zusammenfassen und Token-Budget freigeben.",
    };
  }

  return {
    isSlashCommand: true,
    command,
    args,
    isCompactCommand: false,
  };
}
