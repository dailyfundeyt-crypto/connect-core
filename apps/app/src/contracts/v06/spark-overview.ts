/** Contract v06 – Änderungen nur durch A00/Integrator */

export interface CompanyStructureOverview {
  companyId: string;
  clusters: {
    id: string;
    label: string;
    noteCount: number;
    topTerms: string[];
    heat: number;
  }[];
  links: {
    from: string;
    to: string;
    weight: number;
  }[];
}

export interface AgentDataAccess {
  agentId: string;
  sources: {
    kind: "note" | "folder" | "link" | "db" | "file";
    ref: string;
    count: number;
    lastAccess: string;
  }[];
}
