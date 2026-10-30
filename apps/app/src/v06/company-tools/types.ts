import type { ToolInConnect, CompanyToolToggle } from "@/contracts/v06/company-tools";

export type { ToolInConnect, CompanyToolToggle };

/**
 * // TODO-CONTRACT: CompanyToolItem vereinigt ToolInConnect mit CompanyToolToggle
 * fuer reichhaltige UI-Darstellung inkl. Logo, Status und Metadaten.
 * Rueckgabetyp von GET /api/v06/companies/:id/tools laut A05-Service.
 */
export interface CompanyToolItem extends ToolInConnect {
  companyId: string;
  toolId: string;
  enabled: boolean;
  updatedAt: string;
}

export interface CompanyToolsSyncEventDetail {
  companyId: string;
  toolId: string;
  enabled: boolean;
  rollback?: boolean;
}
