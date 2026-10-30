/**
 * Live-Prüfung der Usage-Limit-Quellen und der Usage-Zusammenfassung.
 *
 * Lane: A03 (Welle W1).
 *
 * Benötigt ein Bearer-Token mit dem Scope `diagnostics:read`.
 */

import { T3RpcClient } from "../client";

const origin = process.env.T3_ORIGIN ?? "http://127.0.0.1:3773";

const client = new T3RpcClient({
  origin,
  bearerToken: process.env.T3_BEARER_TOKEN ?? null,
});

try {
  await client.connect();
  console.log("supportsUsageLimitSources:", client.supportsUsageLimitSources());

  const events: unknown[] = [];
  const subscription = client.subscribeServerConfig(
    { usageLimitSources: true, usageLimitsCommand: true },
    { onEvent: (event) => events.push(event) },
  );
  await Bun.sleep(2500);
  console.log(`subscribeServerConfig-Events: ${events.length}`);
  for (const event of events) {
    const record = event as { type?: string; [k: string]: unknown };
    console.log("  type:", record.type);
    console.log("  keys:", Object.keys(record).join(","));
    console.log("  raw:", JSON.stringify(record).slice(0, 1500));
  }
  console.log(
    "Limit-Quellen (Cache):",
    JSON.stringify(client.getUsageLimitSources()).slice(0, 800),
  );
  subscription.close();

  const summary = await client.getUsageSummary({
    sinceDay: "2026-10-22",
    untilDay: "2026-10-29",
    timeZone: "Europe/Berlin",
  });
  console.log("usageSummary.contractVersion:", summary.contractVersion);
  console.log("usageSummary.buckets:", summary.buckets?.length ?? 0);
  console.log("usageSummary.sources:", JSON.stringify(summary.sources ?? []).slice(0, 600));
} catch (error) {
  console.error("Fehler:", error);
} finally {
  client.close();
}

export {};
