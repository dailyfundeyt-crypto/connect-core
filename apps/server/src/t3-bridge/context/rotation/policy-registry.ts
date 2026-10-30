/**
 * T3-Bridge — Kontext-Rotation: Policy-Registry (Lane A15)
 *
 * Verwaltet die ContextPolicy für jeden Agenten mit Rückfallebene auf die
 * Standard-Werte aus A01 (DEFAULT_CONTEXT_POLICY: 100 000 Tokens, Zusammenfassung sichtbar).
 */

import { DEFAULT_CONTEXT_POLICY, type ContextPolicy } from "../../contracts.js";
import type { IContextPolicyResolver } from "./types.js";

/** Minimale erlaubte Schwelle, um Endlosschleifen zu vermeiden. */
export const MIN_THRESHOLD_TOKENS = 1_000;

export class ContextPolicyRegistry implements IContextPolicyResolver {
  readonly #policiesByAgent = new Map<string, ContextPolicy>();
  readonly #defaultPolicy: ContextPolicy;

  constructor(defaultPolicy: Partial<ContextPolicy> = {}) {
    this.#defaultPolicy = {
      ...DEFAULT_CONTEXT_POLICY,
      ...defaultPolicy,
      thresholdTokens: Math.max(
        MIN_THRESHOLD_TOKENS,
        defaultPolicy.thresholdTokens ?? DEFAULT_CONTEXT_POLICY.thresholdTokens,
      ),
    };
  }

  /**
   * Holt die ContextPolicy für einen Agenten.
   */
  getPolicy(agentId: string): ContextPolicy {
    const custom = this.#policiesByAgent.get(agentId);
    if (!custom) {
      return { ...this.#defaultPolicy };
    }
    return { ...custom };
  }

  /**
   * Setzt oder überschreibt Einstellungen für einen Agenten.
   */
  setPolicy(agentId: string, policy: Partial<ContextPolicy>): void {
    const existing = this.getPolicy(agentId);
    const thresholdTokens =
      typeof policy.thresholdTokens === "number"
        ? Math.max(MIN_THRESHOLD_TOKENS, Math.round(policy.thresholdTokens))
        : existing.thresholdTokens;

    this.#policiesByAgent.set(agentId, {
      ...existing,
      ...policy,
      thresholdTokens,
    });
  }

  /**
   * Entfernt eine agent-spezifische Konfiguration.
   */
  removePolicy(agentId: string): void {
    this.#policiesByAgent.delete(agentId);
  }

  /**
   * Löscht alle Überschreibungen (für Tests).
   */
  clear(): void {
    this.#policiesByAgent.clear();
  }
}
