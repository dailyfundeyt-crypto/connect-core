import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CompanyAppToggle,
  GetCompanyAppsResponse,
  UpdateCompanyAppsRequest,
  UpdateCompanyAppsResponse,
} from "@/contracts/swarm-v3";
import { APP_METADATA, type CompanyAppItem } from "./types";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

export function useCompanyApps(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((type: "success" | "error" | "info", message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToast({ id, type, message });
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3200);
  }, []);

  const queryKey = ["company-apps", companyId ?? ""];

  // 1. Query: Apps vom Server laden
  const {
    data: apps = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CompanyAppItem[]>({
    queryKey,
    enabled: Boolean(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      try {
        const res = await fetch(`/api/companies/${encodeURIComponent(companyId)}/apps`);
        if (!res.ok) {
          throw new Error(`Server status ${res.status}`);
        }
        const data: GetCompanyAppsResponse = await res.json();
        return (data.apps || []).map((app) => ({
          ...app,
          description: APP_METADATA[app.appId]?.description,
          appName: app.appName || APP_METADATA[app.appId]?.name || app.appId,
          appLogo: app.appLogo || APP_METADATA[app.appId]?.defaultLogo,
        }));
      } catch {
        // Fallback: Default canonical apps
        return Object.entries(APP_METADATA).map(([appId, meta], idx) => ({
          companyId,
          appId,
          enabled: true,
          sort: (idx + 1) * 10,
          appName: meta.name,
          appLogo: meta.defaultLogo,
          description: meta.description,
          updatedAt: new Date().toISOString(),
        }));
      }
    },
    staleTime: 1000 * 30, // 30s
  });

  // 2. Mutation: Toggles speichern mit Optimistic Updates
  const mutation = useMutation<
    UpdateCompanyAppsResponse,
    Error,
    Array<{ appId: string; enabled: boolean; sort?: number }>,
    { previousApps: CompanyAppItem[] }
  >({
    mutationFn: async (updates) => {
      if (!companyId) throw new Error("Keine aktive Firma ausgewählt");
      const payload: UpdateCompanyAppsRequest = { apps: updates };
      const res = await fetch(`/api/companies/${encodeURIComponent(companyId)}/apps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Fehler beim Speichern (${res.status})`);
      }
      return await res.json();
    },
    onMutate: async (updates) => {
      // Laufende Abfragen abbrechen
      await queryClient.cancelQueries({ queryKey });

      // Snapshot für Rollback
      const previousApps = queryClient.getQueryData<CompanyAppItem[]>(queryKey) || [];

      // Optimistic Update
      const updatedMap = new Map(updates.map((u) => [u.appId, u]));
      const nextApps = previousApps.map((item) => {
        const upd = updatedMap.get(item.appId);
        if (!upd) return item;
        return {
          ...item,
          enabled: upd.enabled,
          sort: upd.sort !== undefined ? upd.sort : item.sort,
          updatedAt: new Date().toISOString(),
        };
      });
      nextApps.sort((a, b) => a.sort - b.sort);

      queryClient.setQueryData<CompanyAppItem[]>(queryKey, nextApps);

      // Sofortiges Event für synchronisierte Menüs & Header
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("connect:company-apps-changed", {
            detail: { companyId, apps: nextApps },
          })
        );
      }

      return { previousApps };
    },
    onError: (err, _updates, context) => {
      if (context?.previousApps) {
        queryClient.setQueryData(queryKey, context.previousApps);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("connect:company-apps-changed", {
              detail: { companyId, apps: context.previousApps },
            })
          );
        }
      }
      showToast("error", `Fehler: ${err.message || "Konnte Einstellung nicht speichern"}`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("connect:company-apps-changed", {
            detail: { companyId, apps: data.apps },
          })
        );
      }
    },
  });

  // Einzelschalter toggeln
  const toggleApp = useCallback(
    (appId: string, enabled: boolean) => {
      const current = queryClient.getQueryData<CompanyAppItem[]>(queryKey) || apps;
      const target = current.find((a) => a.appId === appId);
      const appName = target?.appName || APP_METADATA[appId]?.name || appId;

      mutation.mutate([{ appId, enabled, sort: target?.sort }]);
      showToast("success", `„${appName}“ wurde ${enabled ? "aktiviert" : "deaktiviert"}.`);
    },
    [apps, mutation, queryClient, queryKey, showToast]
  );

  // Position tauschen (nach oben / unten schieben)
  const reorderApp = useCallback(
    (appId: string, direction: "up" | "down") => {
      const current = [...(queryClient.getQueryData<CompanyAppItem[]>(queryKey) || apps)];
      const index = current.findIndex((a) => a.appId === appId);
      if (index === -1) return;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return;

      // Positionen im Array tauschen
      const [moved] = current.splice(index, 1);
      current.splice(targetIndex, 0, moved);

      // Neue Sort-Werte vergeben
      const updates = current.map((item, idx) => ({
        appId: item.appId,
        enabled: item.enabled,
        sort: (idx + 1) * 10,
      }));

      mutation.mutate(updates);
      showToast("info", `Reihenfolge von „${moved.appName}“ aktualisiert.`);
    },
    [apps, mutation, queryClient, queryKey, showToast]
  );

  return {
    apps,
    isLoading,
    isError,
    error,
    refetch,
    toggleApp,
    reorderApp,
    isSaving: mutation.isPending,
    toast,
    dismissToast: () => setToast(null),
  };
}
