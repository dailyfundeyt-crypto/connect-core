import { useEffect, useState } from "react";
import { API_PATHS_V06 } from "@/contracts/v06/api-paths";
import type { MultiLoginAppDef } from "@/contracts/v06/multilogin";

/**
 * Fallback-Definitionen fuer Codex, Antigravity und Manus
 * (falls /api/v06/multilogin/apps mit 404 antwortet oder offline ist).
 */
export const FALLBACK_MULTI_LOGIN_APPS: MultiLoginAppDef[] = [
  {
    id: "codex",
    name: "Codex",
    iconUrl: "",
    launch: {
      kind: "cli",
      target: "codex",
    },
    supportsLivePreview: false,
  },
  {
    id: "antigravity",
    name: "Antigravity",
    iconUrl: "",
    launch: {
      kind: "cli",
      target: "antigravity",
    },
    supportsLivePreview: false,
  },
  {
    id: "manus",
    name: "Manus",
    iconUrl: "",
    launch: {
      kind: "web",
      target: "https://manus.ai",
    },
    supportsLivePreview: true,
  },
];

export interface UseMultiLoginAppsResult {
  apps: MultiLoginAppDef[];
  loading: boolean;
  error: Error | null;
  isFallback: boolean;
  refetch: () => Promise<void>;
}

/**
 * Liest die registrierten Multi-Login-Apps aus GET /api/v06/multilogin/apps.
 * Bei 404 (oder Netzwerkfehler) greift automatisch der Fallback auf Codex/Antigravity/Manus.
 */
export function useMultiLoginApps(): UseMultiLoginAppsResult {
  const [apps, setApps] = useState<MultiLoginAppDef[]>(FALLBACK_MULTI_LOGIN_APPS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isFallback, setIsFallback] = useState(true);

  const fetchApps = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(API_PATHS_V06.multiLoginApps, {
        headers: { Accept: "application/json" },
      });

      if (res.status === 404) {
        // Expliziter 404-Fallback laut Spezifikation Schritt 5
        setApps(FALLBACK_MULTI_LOGIN_APPS);
        setIsFallback(true);
        return;
      }

      if (!res.ok) {
        throw new Error(`GET ${API_PATHS_V06.multiLoginApps} returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setApps(data);
        setIsFallback(false);
      } else {
        // Leere Liste -> Fallback beibehalten
        setApps(FALLBACK_MULTI_LOGIN_APPS);
        setIsFallback(true);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setApps(FALLBACK_MULTI_LOGIN_APPS);
      setIsFallback(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchApps();
  }, []);

  return {
    apps,
    loading,
    error,
    isFallback,
    refetch: fetchApps,
  };
}
