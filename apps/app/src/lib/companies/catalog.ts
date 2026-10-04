/**
 * Connect companies — each opens a workspace folder of Bots (Slack-style).
 *
 * Drop logos at `app/public/companies/<id>.png` and banners at `<id>-banner.png`.
 */

export type ConnectCompany = {
  id: string;
  name: string;
  description: string;
  /** Agent ids from the Connect tenant package (analysis, connect, …). */
  agentIds: string[];
  /** CSS gradient for the card when no logo file is present. */
  accent: string;
  /**
   * Public @handle — unique across Connect, like Instagram/X.
   * Separate from `id` so display names can change without breaking routes.
   */
  handle?: string;
  /** X-style avatar — company logo (Bild 2). */
  logo?: string;
  /** Optional custom header; default profile UI is white (no stock banner). */
  banner?: string;
  category?: string;
  location?: string;
  website?: string;
};

// CONNECT_COMPANIES exported for type use; production ships with no default companies.
// Seed companies (Nordwind, Lumen, Helm, Pulse) were removed in v0.0.4.
// See migration key "helium:v2-cleared-default-companies" in store.ts for cleanup logic.
export const CONNECT_COMPANIES: ConnectCompany[] = [];

export function getCompany(id: string): ConnectCompany | undefined {
  return CONNECT_COMPANIES.find((c) => c.id === id);
}

export function companiesForAgent(agentId: string): ConnectCompany[] {
  return CONNECT_COMPANIES.filter((c) => c.agentIds.includes(agentId));
}
