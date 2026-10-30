/** Contract v06 – Änderungen nur durch A00/Integrator */

export interface ToolInConnect {
  id: string;
  name: string;
  logoUrl: string;
  kind: "builtin" | "custom";
  url?: string;
}

export interface CompanyToolToggle {
  companyId: string;
  toolId: string;
  enabled: boolean;
  updatedAt: string;
}
