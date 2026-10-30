/**
 * A17 – API-Zugriff für die Spark-Übersicht (Contract-Typen aus
 * apps/app/src/contracts/v06/spark-overview.ts, konsumiert, nicht verändert).
 */
import type {
  AgentDataAccess,
  CompanyStructureOverview,
} from "@/contracts/v06/spark-overview";

// Lokale Alias-Typen im gleichen Shape wie der Contract (Contract-Typen selbst
// sind schreibgeschützt; Aliase erlauben lokal komfortablere Feldnamen).
export interface Cluster {
  id: string;
  label: string;
  noteCount: number;
  topTerms: string[];
  heat: number;
}

export interface CompanyOverview extends CompanyStructureOverview {
  // Contract-Felder werden unverändert übernommen.
}

export type AccessKind = AgentDataAccess["sources"][number]["kind"];

export interface AccessSource {
  kind: AccessKind;
  ref: string;
  count: number;
  lastAccess: string;
  /** Checkbox-Zugriff aus agents.json (Superset des Contracts). */
  access?: "read" | "write";
}

export interface AgentAccess extends AgentDataAccess {}

export interface BrainAgentRef {
  slug: string;
  name?: string;
  connectAgentId?: string;
}

export interface NoteSummary {
  title: string;
  path: string;
  modified: string;
  size: number;
}

export interface HeadingEntry {
  level: number;
  text: string;
}

export interface NoteDetail {
  id: string;
  label: string;
  path: string[];
  childCount: number;
  lastModified: string;
  topTerms: string[];
  notes: NoteSummary[];
  headings: HeadingEntry[];
}

export interface BrainAgentsResponse {
  agents: BrainAgentRef[];
}

const BASE = "/api/v06";

export async function fetchCompanyOverview(): Promise<{ data: CompanyOverview; healthy: boolean; errorNote?: string }> {
  const res = await fetch(`${BASE}/spark/overview/current`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Spark-Übersicht HTTP ${res.status}`);
  return {
    data: (await res.json()) as CompanyStructureOverview as CompanyOverview,
    healthy: res.status === 200,
  };
}

export async function fetchNoteDetail(clusterId: string): Promise<{ data: NoteDetail }> {
  const res = await fetch(`${BASE}/spark/cluster/${encodeURIComponent(clusterId)}`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`Cluster-Detail HTTP ${res.status}`);
  const body = (await res.json()) as NoteDetail;
  return { data: body };
}

export async function fetchAgentAccess(agentId: string): Promise<AgentAccess> {
  const res = await fetch(`${BASE}/spark/agent-access/${encodeURIComponent(agentId)}`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    if (res.status === 404) {
      return { agentId, sources: [] };
    }
    throw new Error(`Agenten-Zugriff HTTP ${res.status}`);
  }
  return (await res.json()) as AgentAccess;
}

export async function fetchBrainAgents(): Promise<BrainAgentRef[]> {
  const res = await fetch(`${BASE}/spark/agents`, { credentials: "same-origin" });
  if (!res.ok) return [];
  const body = (await res.json()) as BrainAgentsResponse;
  return body.agents ?? [];
}

export const SOURCE_KIND_LABELS: Record<AccessKind, string> = {
  note: "Notiz",
  folder: "Ordner",
  link: "Link",
  db: "DB",
  file: "Datei",
};

export default null;
