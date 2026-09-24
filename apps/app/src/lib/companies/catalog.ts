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

/** Full Connect roster — every company can staff Zentrale / Research / Delivered. */
const FULL_ROSTER = [
  "cto",
  "analysis",
  "flux",
  "hyper",
  "spark",
  "connect",
  "consensus",
] as const;

export const CONNECT_COMPANIES: ConnectCompany[] = [
  {
    id: "nordwind",
    name: "Nordwind",
    handle: "nordwind",
    description:
      "Operations and analysis — keep work moving with clear findings.",
    agentIds: [...FULL_ROSTER],
    accent: "linear-gradient(145deg, #0f766e 0%, #164e63 55%, #1e293b 100%)",
    logo: "/companies/nordwind.png?v=5",
    category: "Operations company",
    location: "Remote",
    website: "nordwind.local",
  },
  {
    id: "lumen",
    name: "Lumen",
    handle: "lumen",
    description: "Product and creative — briefs, naming, and the next angle.",
    agentIds: [...FULL_ROSTER],
    accent: "linear-gradient(145deg, #7c3aed 0%, #db2777 50%, #1e293b 100%)",
    logo: "/companies/lumen.png?v=5",
    category: "Product company",
    location: "Remote",
    website: "lumen.local",
  },
  {
    id: "helm",
    name: "Helm",
    handle: "helm",
    description: "Risk, alignment, and decisions the team can stand behind.",
    agentIds: [...FULL_ROSTER],
    accent: "linear-gradient(145deg, #ca8a04 0%, #ea580c 45%, #1e293b 100%)",
    logo: "/companies/helm.png?v=5",
    category: "Risk & compliance",
    location: "Remote",
    website: "helm.local",
  },
  {
    id: "pulse",
    name: "Pulse",
    handle: "pulse",
    description: "Fast triage and shipping under pressure.",
    agentIds: [...FULL_ROSTER],
    accent: "linear-gradient(145deg, #0369a1 0%, #4f46e5 55%, #1e293b 100%)",
    logo: "/companies/pulse.png?v=5",
    category: "Delivery company",
    location: "Remote",
    website: "pulse.local",
  },
];

export function getCompany(id: string): ConnectCompany | undefined {
  return CONNECT_COMPANIES.find((c) => c.id === id);
}

export function companiesForAgent(agentId: string): ConnectCompany[] {
  return CONNECT_COMPANIES.filter((c) => c.agentIds.includes(agentId));
}
