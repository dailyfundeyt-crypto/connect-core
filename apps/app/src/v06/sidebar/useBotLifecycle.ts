import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { API_PATHS_V06 } from "@/contracts/v06/api-paths";
import type {
  HardDeleteBotReq,
  HardDeleteBotRes,
  RemoveBotFromCompanyReq,
} from "@/contracts/v06/bot-lifecycle";
import { agentKeys } from "@/lib/agents/queries";
import { listProjects, removeAgentsFromProject } from "@/lib/companies/projects";
import { getCompany, updateCompany } from "@/lib/companies/store";

export interface LifecycleToastState {
  message: string;
  type: "success" | "error";
  id: number;
}

export interface UseBotLifecycleResult {
  removeFromCompany: (
    botId: string,
    companyId: string,
    botName?: string,
  ) => Promise<boolean>;
  hardDelete: (botId: string, confirmName: string) => Promise<boolean>;
  isRemoving: boolean;
  isDeleting: boolean;
  toast: LifecycleToastState | null;
  dismissToast: () => void;
}

/**
 * useBotLifecycle (A01 - v06)
 *
 * Verwaltet Bot-Lifecycle-Aktionen:
 * 1. „Aus Firma entfernen“: Optimistische Entfernung aus Firma & Projekten; POST remove-from-company; bei Fehler Rollback + Toast.
 * 2. „Endgültig löschen“: POST hard-delete mit confirmName; bei Erfolg Invalidation & Export-Pfad im Toast.
 */
export function useBotLifecycle(): UseBotLifecycleResult {
  const queryClient = useQueryClient();
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<LifecycleToastState | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const removeFromCompany = useCallback(
    async (botId: string, companyId: string, botName?: string): Promise<boolean> => {
      if (!botId || !companyId) return false;

      // 1. Snapshot des Ist-Zustands fuer moeglichen Rollback
      const previousCompany = getCompany(companyId);
      const previousAgentIds = previousCompany ? [...previousCompany.agentIds] : null;

      // Betroffene Projekte fuer Rollback merken
      const companyProjects = listProjects(companyId);
      const affectedProjectIds: string[] = [];
      for (const p of companyProjects) {
        if (p.agentIds.includes(botId)) {
          affectedProjectIds.push(p.id);
        }
      }

      // 2. Optimistisches Update im UI / lokalen Store
      try {
        if (previousCompany) {
          const nextIds = previousCompany.agentIds.filter((id) => id !== botId);
          await updateCompany(companyId, { agentIds: nextIds });
        }
        for (const pId of affectedProjectIds) {
          removeAgentsFromProject(pId, [botId]);
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("connect-active-company"));
        }
      } catch (optimisticErr) {
        console.warn("Optimistic update failed:", optimisticErr);
      }

      setIsRemoving(true);

      // 3. API-Aufruf
      try {
        const payload: RemoveBotFromCompanyReq = { botId, companyId };
        const res = await fetch(API_PATHS_V06.botRemoveFromCompany(botId), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Server antwortete mit ${res.status}: ${errText || res.statusText}`);
        }

        const displayName = botName ? `„${botName}“` : "Bot";
        showToast(`${displayName} wurde aus der Firma entfernt.`, "success");
        await queryClient.invalidateQueries({ queryKey: agentKeys.all });
        return true;
      } catch (err: any) {
        // 4. Rollback bei Fehler
        if (previousCompany && previousAgentIds) {
          try {
            await updateCompany(companyId, { agentIds: previousAgentIds });
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("connect-active-company"));
            }
          } catch (rollbackErr) {
            console.error("Rollback failed:", rollbackErr);
          }
        }
        showToast(
          `Fehler beim Entfernen aus der Firma: ${err?.message || "Unbekannter Fehler"}`,
          "error",
        );
        return false;
      } finally {
        setIsRemoving(false);
      }
    },
    [queryClient, showToast],
  );

  const hardDelete = useCallback(
    async (botId: string, confirmName: string): Promise<boolean> => {
      if (!botId || !confirmName) return false;

      setIsDeleting(true);
      try {
        const payload: HardDeleteBotReq = { botId, confirmName };
        const res = await fetch(API_PATHS_V06.botHardDelete(botId), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Server antwortete mit ${res.status}: ${errText || res.statusText}`);
        }

        const data: HardDeleteBotRes = await res.json().catch(() => ({
          botId,
          exportPath: "",
          deletedAt: new Date().toISOString(),
        }));

        const exportHint = data.exportPath ? ` (Export: ${data.exportPath})` : "";
        showToast(`Bot „${confirmName}“ wurde endgültig gelöscht${exportHint}.`, "success");

        // Cache und UI synchronisieren
        await queryClient.invalidateQueries({ queryKey: agentKeys.all });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("connect-active-company"));
        }
        return true;
      } catch (err: any) {
        showToast(
          `Fehler beim endgültigen Löschen: ${err?.message || "Unbekannter Fehler"}`,
          "error",
        );
        throw err;
      } finally {
        setIsDeleting(false);
      }
    },
    [queryClient, showToast],
  );

  return {
    removeFromCompany,
    hardDelete,
    isRemoving,
    isDeleting,
    toast,
    dismissToast,
  };
}

export default useBotLifecycle;
