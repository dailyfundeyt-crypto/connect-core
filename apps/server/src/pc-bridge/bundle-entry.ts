/**
 * Einstieg für das Vercel-Server-Bundle (api/index.js). Das Bundle vom 01.10. wird nicht neu gebaut,
 * sondern bekommt diesen Baustein als IIFE `__connectPcBridge` eingesetzt (siehe .plan/MOBILE-BRIDGE-PLAN.md).
 */
import { installPcBridgeRoutes, type RelayOverride, relayFor } from "./relay";
import type { Q } from "./store";

let query: Q | null = null;

export function install(app: never, requireUser: never, database: unknown) {
  const client = (database as { $client?: { unsafe: (text: string, values?: unknown[]) => Promise<unknown> } }).$client;
  if (!client?.unsafe) throw new Error("pc-bridge: database client without unsafe()");
  query = async (text, values = []) => (await client.unsafe(text, values)) as Record<string, unknown>[];
  installPcBridgeRoutes(app, requireUser, query);
}

export async function relay(agentId: string, actorId: string | undefined): Promise<RelayOverride | null> {
  if (!query) return null;
  return relayFor(query, agentId, actorId);
}

/** The built-in agent configuration for a PC-routed agent (no Connect tools: the CLI has its own). */
export function configure(agent: { name: string; systemPrompt: string }, override: RelayOverride, standing: string | null) {
  if (override.error || !override.model) {
    const message = override.error ?? "Handy-Brücke: kein Modell.";
    return {
      type: "custom",
      factory: async function* () {
        yield* [];
        throw new Error(message);
      },
    };
  }
  return {
    model: override.model,
    prompt: [agent.systemPrompt, ...(standing ? [standing] : [])].join("\n\n"),
    apiKey: "pc-bridge",
  };
}
