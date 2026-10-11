/** Handy-Brücke: Einstiegspunkte für app.ts / index.ts. */
import type { Q } from "./store";

export { installPcBridgeRoutes, relayFor } from "./relay";
export { installLocalPcBridgeRoutes } from "./local-routes";
export { pcBridgeWorkerState, startPcBridgeWorker } from "./worker";

/** `sql.unsafe` of the drizzle Bun-SQL client as the bridge's query function. */
export function pcQuery(database: unknown): Q {
  const client = (database as { $client?: { unsafe: (text: string, values?: unknown[]) => Promise<unknown> } }).$client;
  if (!client?.unsafe) throw new Error("pc-bridge: database client without unsafe()");
  return async (text, values = []) => (await client.unsafe(text, values)) as Record<string, unknown>[];
}
