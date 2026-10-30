/**
 * T3-Sidecar-Supervisor — Healthcheck und Erreichbarkeitsprüfung.
 *
 * Lane: A02 (Welle W1).
 */

export type HealthResult = {
  healthy: boolean;
  status: number | null;
  error?: string;
  durationMs: number;
};

/**
 * Führt einen Healthcheck auf dem T3-Sidecar aus.
 * Prüft zunächst `/manifest.webmanifest` (wie in `connect/t3-agents.ts`)
 * und als Fallback `/`.
 */
export async function checkSidecarHealth(
  origin: string,
  timeoutMs: number = 1500,
): Promise<HealthResult> {
  const start = Date.now();
  const endpoints = ["/manifest.webmanifest", "/"];

  for (const endpoint of endpoints) {
    try {
      const url = `${origin.replace(/\/+$/, "")}${endpoint}`;
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });

      const durationMs = Date.now() - start;
      if (response.status < 500) {
        return {
          healthy: true,
          status: response.status,
          durationMs,
        };
      }
    } catch (err) {
      // Weiterer Endpunkt testen
      if (endpoint === endpoints[endpoints.length - 1]) {
        return {
          healthy: false,
          status: null,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        };
      }
    }
  }

  return {
    healthy: false,
    status: null,
    error: "Keine Antwort vom Sidecar erhalten.",
    durationMs: Date.now() - start,
  };
}
