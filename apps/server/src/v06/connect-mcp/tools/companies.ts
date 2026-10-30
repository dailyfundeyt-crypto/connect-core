/**
 * Tool: list_companies (v06 / Wave 2 / A18).
 *
 * Listet Firmen auf, für die der aufrufende Principal freigegeben ist.
 * Scope: 'read'
 */

import { check } from "../grants";
import type { ToolExecutionContext } from "../types";

export interface CompanyInfo {
  id: string;
  name: string;
  description?: string;
  isAccessible: boolean;
}

const DEFAULT_KNOWN_COMPANIES: CompanyInfo[] = [
  { id: "c-hyper", name: "Hyper Automation", description: "High-speed Web & Automation", isAccessible: true },
  { id: "c-flux", name: "Flux Studio", description: "Design, 3D & Content", isAccessible: true },
  { id: "c-analysis", name: "Analysis & QA", description: "Code & Data Inspection", isAccessible: true },
  { id: "default", name: "Connect Core", description: "Zentrale System- und Bot-Verwaltung", isAccessible: true },
];

export async function handleListCompanies(
  _args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<{ ok: boolean; count: number; companies: CompanyInfo[] }> {
  const principal = ctx.auth.principal;

  // Prüfe Berechtigung für Firmenabfrage
  // 'read' mit '*' oder spezifischer Firma
  const grants = ctx.auth.grants.filter((g) => !g.revokedAt);
  const allowedCompanyIds = new Set<string>();
  const hasWildcard = grants.some((g) => g.companyId === "*");

  for (const g of grants) {
    if (g.scopes.includes("read") || g.scopes.includes("operate")) {
      allowedCompanyIds.add(g.companyId);
    }
  }

  // Wenn keine Leserechte vorliegen
  if (!hasWildcard && allowedCompanyIds.size === 0) {
    throw new Error(
      `403 Forbidden: Principal "${principal}" hat keine Leseberechtigung ('read') für Firmen.`,
    );
  }

  let resultCompanies = DEFAULT_KNOWN_COMPANIES;
  if (!hasWildcard) {
    resultCompanies = DEFAULT_KNOWN_COMPANIES.filter((c) => allowedCompanyIds.has(c.id));
  }

  return {
    ok: true,
    count: resultCompanies.length,
    companies: resultCompanies,
  };
}

export const LIST_COMPANIES_TOOL = {
  name: "list_companies",
  description: "Listet alle für den Agenten freigegebenen Firmen auf (Scope: read).",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: handleListCompanies,
};
