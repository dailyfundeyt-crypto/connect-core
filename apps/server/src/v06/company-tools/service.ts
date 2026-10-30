import type { ToolInConnect, CompanyToolToggle } from "../../contracts/v06/company-tools";
import { getStoredCompanyToolToggles, saveCompanyToolToggle } from "./repo";

// // TODO-CONTRACT: CompanyToolItem vereinigt ToolInConnect mit CompanyToolToggle fuer reichhaltige UI-Rueckgaben
export interface CompanyToolItem extends ToolInConnect {
  companyId: string;
  toolId: string;
  enabled: boolean;
  updatedAt: string;
}

/**
 * Standard-Tools in Connect laut Ist-Architektur und Spezifikation.
 * Beinhaltet Analysis, Connect Sozial, Flux, Brain, Finance und bestehende Tools.
 */
export const CANONICAL_CONNECT_TOOLS: ToolInConnect[] = [
  {
    id: "analysis",
    name: "Analysis",
    logoUrl: "/brand/analysis-logo.png",
    kind: "builtin",
  },
  {
    id: "connect-sozial",
    name: "Connect Sozial",
    logoUrl: "/brand/connect-logo.png",
    kind: "builtin",
    url: "/social",
  },
  {
    id: "flux",
    name: "Flux",
    logoUrl: "/flux-logo.png",
    kind: "builtin",
  },
  {
    id: "brain",
    name: "Brain",
    logoUrl: "/brand/spark-logo.jpg",
    kind: "builtin",
  },
  {
    id: "finance",
    name: "Finance",
    logoUrl: "/brand/finance-logo.png",
    kind: "builtin",
  },
  {
    id: "markettrace",
    name: "MarketTrace",
    logoUrl: "/brand/analysis-logo.png",
    kind: "builtin",
    url: "https://markettrace.io",
  },
  {
    id: "tradingview",
    name: "TradingView",
    logoUrl: "/brand/analysis-logo.png",
    kind: "builtin",
    url: "https://de.tradingview.com",
  },
  {
    id: "btcusdt",
    name: "BTC / USDT Live",
    logoUrl: "/brand/analysis-logo.png",
    kind: "builtin",
    url: "https://de.tradingview.com/symbols/BTCUSDT",
  },
  {
    id: "prorealtime",
    name: "ProRealTime Web",
    logoUrl: "/brand/analysis-logo.png",
    kind: "builtin",
    url: "https://m.prorealtime.com",
  },
];

/**
 * Liefert alle bekannten Tools fuer eine Firma mit ihrem jeweiligen Toggle-Zustand.
 * Fehlender Eintrag in der Datenbank gilt laut Vorgabe als enabled = true.
 */
export async function listCompanyToolsWithToggles(
  companyId: string,
  dbOverride?: any,
): Promise<CompanyToolItem[]> {
  const stored = await getStoredCompanyToolToggles(companyId, dbOverride);
  const now = new Date().toISOString();

  const result: CompanyToolItem[] = CANONICAL_CONNECT_TOOLS.map((tool) => {
    const toggle = stored.get(tool.id);
    const enabled = toggle !== undefined ? toggle.enabled : true;
    const updatedAt = toggle?.updatedAt ?? now;

    return {
      ...tool,
      companyId,
      toolId: tool.id,
      enabled,
      updatedAt,
    };
  });

  // Falls in DB zusaetzliche Custom-Tools existieren, die nicht im Standardkatalog sind:
  for (const [toolId, toggle] of stored.entries()) {
    if (!CANONICAL_CONNECT_TOOLS.some((t) => t.id === toolId)) {
      result.push({
        id: toolId,
        name: toolId,
        logoUrl: "/brand/connect-logo.png",
        kind: "custom",
        companyId,
        toolId,
        enabled: toggle.enabled,
        updatedAt: toggle.updatedAt,
      });
    }
  }

  return result;
}

/**
 * Setzt den Aktiv-Zustand (Toggle) fuer ein Tool einer Firma.
 */
export async function setCompanyToolToggleState(
  companyId: string,
  toolId: string,
  enabled: boolean,
  dbOverride?: any,
): Promise<CompanyToolToggle> {
  if (!companyId || companyId.trim() === "") {
    throw new Error("companyId is required.");
  }
  if (!toolId || toolId.trim() === "") {
    throw new Error("toolId is required.");
  }

  return await saveCompanyToolToggle(companyId.trim(), toolId.trim(), Boolean(enabled), dbOverride);
}
