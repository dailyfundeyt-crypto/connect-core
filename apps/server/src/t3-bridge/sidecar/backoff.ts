/**
 * T3-Sidecar-Supervisor — Backoff-Berechnung bei Abstürzen.
 *
 * Lane: A02 (Welle W1).
 */

/**
 * Berechnet die Wartezeit (in ms) vor dem nächsten Neustart nach einem Absturz.
 * Verwendet exponentiellen Backoff mit optionalem Jitter und Obergrenze.
 *
 * Formel: min(maxMs, initialMs * (multiplier ^ attempt)) ± jitter
 */
export function calculateBackoff(
  attempt: number,
  options?: {
    initialMs?: number;
    maxMs?: number;
    multiplier?: number;
    jitterRatio?: number;
    randomFn?: () => number;
  },
): number {
  const initial = options?.initialMs ?? 1000;
  const max = options?.maxMs ?? 30000;
  const multiplier = options?.multiplier ?? 2;
  const jitterRatio = options?.jitterRatio ?? 0.1;
  const random = options?.randomFn ?? Math.random;

  if (attempt <= 0) {
    return initial;
  }

  const raw = Math.min(max, initial * Math.pow(multiplier, attempt));

  if (jitterRatio > 0) {
    // Jitter im Bereich [-jitterRatio, +jitterRatio]
    const delta = raw * jitterRatio;
    const factor = (random() * 2 - 1) * delta;
    return Math.max(0, Math.round(raw + factor));
  }

  return Math.round(raw);
}
