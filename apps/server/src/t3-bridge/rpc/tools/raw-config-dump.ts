/**
 * Live-Dump der rohen Server-Config (Diagnose).
 *
 * Lane: A03 (Welle W1).
 *
 * Schreibt **nur** die Provider-Struktur in die Konsole, ohne Geheimnisse.
 */

import { T3RpcClient } from "../client";

const origin = process.env.T3_ORIGIN ?? "http://127.0.0.1:3773";

const client = new T3RpcClient({
  origin,
  bearerToken: process.env.T3_BEARER_TOKEN ?? null,
});

try {
  await client.connect();
  const config = client.cachedConfig as
    | { providers?: ReadonlyArray<Record<string, unknown>> }
    | null;
  const providers = config?.providers ?? [];
  for (const provider of providers) {
    console.log(JSON.stringify(provider, null, 2));
    console.log("-----");
  }
} catch (error) {
  console.error(error);
} finally {
  client.close();
}

export {};
