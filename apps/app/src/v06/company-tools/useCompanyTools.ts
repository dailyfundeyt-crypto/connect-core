import { useCallback, useEffect, useState } from "react";
import { API_PATHS_V06 } from "@/contracts/v06/api-paths";
import type { ToolInConnect } from "@/contracts/v06/company-tools";
import type { CompanyToolItem, CompanyToolsSyncEventDetail } from "./types";

export const COMPANY_TOOLS_UPDATED_EVENT = "connect-company-tools-updated";

/**
 * Kanonischer Standard-Werkzeugkatalog identisch zu A05 Backend.
 * Dient als Fallback, wenn der Server offline ist oder vor Backend-Integration.
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
 * Filtert nur die aktivierten Tools heraus.
 */
export function filterEnabledTools(tools: CompanyToolItem[]): CompanyToolItem[] {
  return tools.filter((tool) => tool.enabled);
}

/**
 * Erzeugt kanonische Tools fuer eine Firma mit Standard-Toggles.
 */
export function createDefaultCompanyTools(companyId: string): CompanyToolItem[] {
  const now = new Date().toISOString();
  return CANONICAL_CONNECT_TOOLS.map((t) => ({
    ...t,
    companyId,
    toolId: t.id,
    enabled: true,
    updatedAt: now,
  }));
}

// In-Memory-Cache fuer schnellen Zugriff und komponentenuebergreifende Synchronisation
export const companyToolsCache = new Map<string, CompanyToolItem[]>();

export interface UseCompanyToolsResult {
  tools: CompanyToolItem[];
  enabledTools: CompanyToolItem[];
  isLoading: boolean;
  error: Error | null;
  toggleTool: (toolId: string, enabled: boolean) => Promise<boolean>;
  refetch: () => Promise<void>;
}

/**
 * Hook fuer Firmen-Tools mit optimistischem Update und automatischem Rollback bei Fehlern.
 * Synchronisiert Sidebar und Einstellungen ueber window-Events.
 */
export function useCompanyTools(companyId: string | null | undefined): UseCompanyToolsResult {
  const [tools, setTools] = useState<CompanyToolItem[]>(() => {
    if (!companyId) return [];
    return companyToolsCache.get(companyId) ?? createDefaultCompanyTools(companyId);
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Sync mit Cache, wenn sich companyId aendert
  useEffect(() => {
    if (!companyId) {
      setTools([]);
      return;
    }
    const cached = companyToolsCache.get(companyId);
    if (cached) {
      setTools(cached);
    } else {
      const defaults = createDefaultCompanyTools(companyId);
      companyToolsCache.set(companyId, defaults);
      setTools(defaults);
    }
  }, [companyId]);

  // Synchronisation ueber Event (z.B. wenn Toggle in Einstellungen umgeschaltet wird)
  useEffect(() => {
    if (!companyId || typeof window === "undefined") return;

    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<CompanyToolsSyncEventDetail>;
      const detail = customEvent.detail;
      if (!detail || detail.companyId !== companyId) return;

      setTools((prev) => {
        const next = prev.map((item) =>
          item.id === detail.toolId
            ? { ...item, enabled: detail.enabled, updatedAt: new Date().toISOString() }
            : item,
        );
        companyToolsCache.set(companyId, next);
        return next;
      });
    };

    window.addEventListener(COMPANY_TOOLS_UPDATED_EVENT, handleSync as EventListener);
    return () => {
      window.removeEventListener(COMPANY_TOOLS_UPDATED_EVENT, handleSync as EventListener);
    };
  }, [companyId]);

  // Daten vom Server laden (GET /api/v06/companies/:id/tools)
  const fetchTools = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(API_PATHS_V06.companyTools(companyId), {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        // Bei 404 (z.B. Flag auf Server aus) Standard-Tools behalten
        if (res.status === 404) {
          const cached = companyToolsCache.get(companyId) ?? createDefaultCompanyTools(companyId);
          setTools(cached);
          setIsLoading(false);
          return;
        }
        throw new Error(`Server antwortete mit Status ${res.status}`);
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        companyToolsCache.set(companyId, data);
        setTools(data);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      void fetchTools();
    }
  }, [companyId, fetchTools]);

  /**
   * Optimistisches Update fuer Tool-Toggle mit automatischem Rollback
   */
  const toggleTool = useCallback(
    async (toolId: string, enabled: boolean): Promise<boolean> => {
      if (!companyId) return false;

      // 1. Snapshot fuer Rollback
      const previousTools = [...tools];
      const previousCached = companyToolsCache.get(companyId) ? [...companyToolsCache.get(companyId)!] : [...tools];

      // 2. Optimistisches Update lokal durchfuehren
      const nextTools = tools.map((t) =>
        t.id === toolId ? { ...t, enabled, updatedAt: new Date().toISOString() } : t,
      );

      companyToolsCache.set(companyId, nextTools);
      setTools(nextTools);

      // Event dispatchen, damit Sidebar und Einstellungen synchron bleiben
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent<CompanyToolsSyncEventDetail>(COMPANY_TOOLS_UPDATED_EVENT, {
            detail: { companyId, toolId, enabled },
          }),
        );
      }

      // 3. API-Aufruf (PUT /api/v06/companies/:id/tools)
      try {
        const res = await fetch(API_PATHS_V06.companyTools(companyId), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ toolId, enabled }),
        });

        if (!res.ok) {
          throw new Error(`Fehler beim Speichern: Status ${res.status}`);
        }

        const data = await res.json().catch(() => null);
        if (data && data.ok === false) {
          throw new Error(data.error || "Server lehnte Tool-Update ab");
        }

        return true;
      } catch (err: any) {
        // 4. Rollback bei Fehler
        console.warn(`[useCompanyTools] Rollback fuer Tool ${toolId}:`, err);
        companyToolsCache.set(companyId, previousCached);
        setTools(previousTools);
        setError(err instanceof Error ? err : new Error(String(err)));

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent<CompanyToolsSyncEventDetail>(COMPANY_TOOLS_UPDATED_EVENT, {
              detail: { companyId, toolId, enabled: !enabled, rollback: true },
            }),
          );
        }

        return false;
      }
    },
    [companyId, tools],
  );

  return {
    tools,
    enabledTools: filterEnabledTools(tools),
    isLoading,
    error,
    toggleTool,
    refetch: fetchTools,
  };
}
