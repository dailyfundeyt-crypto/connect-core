/**
 * Einstieg für das Vercel-Server-Bundle (api/index.js): wird als IIFE `__connectSocial` eingesetzt
 * (wie pc-bridge, siehe .plan/SOCIAL-PLAN.md). Die Datenbank des Bundles IST Supabase → owner = actor.id.
 */
import { installSocialRoutes, type SocialAppLike } from "./routes";
import type { Q } from "./store";

export function install(app: never, requireUser: never, database: unknown) {
  const client = (database as { $client?: { unsafe: (text: string, values?: unknown[]) => Promise<unknown> } }).$client;
  if (!client?.unsafe) throw new Error("social: database client without unsafe()");
  const q: Q = async (text, values = []) => (await client.unsafe(text, values)) as Record<string, unknown>[];
  installSocialRoutes(app as unknown as SocialAppLike, requireUser, {
    label: "supabase",
    query: () => q,
    owner: async (_q, actor) => actor.id,
  });
}
