import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_PATHS_V06,
} from "@/contracts/v06/api-paths";
import {
  type BrowserProfile,
  type ProfileTab,
  type ProfileTabGroup,
} from "@/contracts/v06/browser-profiles";

/**
 * Browser-Profile API-Client (A16, Konsum von A09).
 *
 * Der Live-Preview-Endpunkt `/api/v06/browser-profiles/:id/preview` und ein
 * Update-Endpunkt fuer die Gruppen-Zuordnung eines Tabs existieren auf dem
 * Server, sind aber (noch) nicht in `contracts/v06/api-paths.ts` enthalten.
 * Bis der Contract erweitert ist, bleiben beide lokal definiert.
 */
// TODO-CONTRACT: Preview-URL in api-paths.ts aufnehmen (A00/A09).
export function profilePreviewPath(
  profileId: string,
  targetId?: string | null,
): string {
  const base = `${API_PATHS_V06.browserProfiles}/${encodeURIComponent(profileId)}/preview`;
  return targetId ? `${base}?targetId=${encodeURIComponent(targetId)}` : base;
}

// TODO-CONTRACT: PUT /api/v06/browser-profiles/:id/tabs/:tabId in api-paths.ts aufnehmen
// (Backend-Store kann es schon, der Route fehlt — siehe Bericht A16 "Wiring-Bedarf").
export function profileTabItemPath(profileId: string, tabId: string): string {
  return `${API_PATHS_V06.browserProfileTabs(profileId)}/${encodeURIComponent(tabId)}`;
}

export interface UseBrowserProfilesResult {
  profiles: BrowserProfile[];
  /** Nur noch nicht beendete Profile — die Tabs in der Leiste oben. */
  activeProfiles: BrowserProfile[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createProfile: (name: string) => Promise<BrowserProfile | null>;
  endProfile: (profileId: string) => Promise<boolean>;
}

/**
 * Liste der Browser-Profile eines Agenten inkl. Anlegen (max. 10, geprueft am
 * Server) und Beenden (`POST .../:id/end`). Nach dem Beenden verschwindet das
 * Profil aus der Liste; die Tabs stellt der Server beim naechsten Start
 * desselben Namens wieder her (TabStore-Restore).
 */
export function useBrowserProfiles(agentId: string | null | undefined): UseBrowserProfilesResult {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [loading, setLoading] = useState(Boolean(agentId));
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!agentId) {
      setProfiles([]);
      setLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const url = `${API_PATHS_V06.browserProfiles}?agentId=${encodeURIComponent(agentId)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        // 404 kann bedeuten: Server aelter als das Backend oder Flag aus.
        throw new Error(`GET browser-profiles antwortete mit HTTP ${res.status}`);
      }
      const data = (await res.json()) as BrowserProfile[];
      if (requestIdRef.current !== requestId) return;
      setProfiles(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setProfiles([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const createProfile = useCallback(
    async (name: string): Promise<BrowserProfile | null> => {
      if (!agentId) return null;
      const res = await fetch(API_PATHS_V06.browserProfiles, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ agentId, name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `POST browser-profiles antwortete mit HTTP ${res.status}`);
      }
      const profile = (await res.json()) as BrowserProfile;
      setProfiles((list) => [...list, profile]);
      return profile;
    },
    [agentId],
  );

  const endProfile = useCallback(
    async (profileId: string): Promise<boolean> => {
      const res = await fetch(API_PATHS_V06.browserProfileEnd(profileId), {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `POST end antwortete mit HTTP ${res.status}`);
      }
      setProfiles((list) =>
        list.map((p) => (p.id === profileId ? { ...p, status: "ended" as const } : p)),
      );
      return true;
    },
    [],
  );

  return {
    profiles,
    activeProfiles: profiles.filter((p) => p.status === "active"),
    loading,
    error,
    refetch,
    createProfile,
    endProfile,
  };
}

export interface UseProfileContentResult {
  groups: ProfileTabGroup[];
  tabs: ProfileTab[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createGroup: (name: string, parentId?: string) => Promise<ProfileTabGroup | null>;
  /** Optimistische Gruppen-Zuordnung eines Tabs (PUT, siehe TODO-CONTRACT oben). */
  moveTab: (tabId: string, groupId: string | null) => Promise<boolean>;
  openTab: (url: string, groupId?: string) => Promise<ProfileTab | null>;
  closeTab: (tabId: string) => Promise<boolean>;
}

/**
 * Tabs und Gruppen eines Profils. Bei Profilwechsel laedt der Hook neu
 * (ueber requestId abgesichert): der Inhalt zeigt immer wirklich die Daten des
 * gewaehlten Profils.
 */
export function useProfileContent(
  profileId: string | null | undefined,
): UseProfileContentResult {
  const [groups, setGroups] = useState<ProfileTabGroup[]>([]);
  const [tabs, setTabs] = useState<ProfileTab[]>([]);
  const [loading, setLoading] = useState(Boolean(profileId));
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!profileId) {
      setGroups([]);
      setTabs([]);
      setLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const [groupsRes, tabsRes] = await Promise.all([
        fetch(API_PATHS_V06.browserProfileGroups(profileId), { headers: { Accept: "application/json" } }),
        fetch(API_PATHS_V06.browserProfileTabs(profileId), { headers: { Accept: "application/json" } }),
      ]);
      if (!groupsRes.ok || !tabsRes.ok) {
        throw new Error(
          `Profil-Inhalt antwortete mit HTTP ${groupsRes.ok ? tabsRes.status : groupsRes.status}`,
        );
      }
      const groupsData = (await groupsRes.json()) as ProfileTabGroup[];
      const tabsData = (await tabsRes.json()) as ProfileTab[];
      if (requestIdRef.current !== requestId) return;
      setGroups(Array.isArray(groupsData) ? groupsData : []);
      setTabs(Array.isArray(tabsData) ? tabsData : []);
      setError(null);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const createGroup = useCallback(
    async (name: string, parentId?: string): Promise<ProfileTabGroup | null> => {
      if (!profileId) return null;
      const res = await fetch(API_PATHS_V06.browserProfileGroups(profileId), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, parentId: parentId ?? undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `POST groups antwortete mit HTTP ${res.status}`);
      }
      await refetch();
      return (await res.json()) as ProfileTabGroup;
    },
    [profileId, refetch],
  );

  const moveTab = useCallback(
    async (tabId: string, groupId: string | null): Promise<boolean> => {
      if (!profileId) return false;
      const previous = tabs;
      // Optimistisch: die UI zeigt sofort die neue Zuordnung.
      setTabs((list) => list.map((t) => (t.id === tabId ? { ...t, groupId: groupId ?? undefined } : t)));
      try {
        const res = await fetch(profileTabItemPath(profileId, tabId), {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ groupId: groupId ?? undefined }),
        });
        if (!res.ok) {
          throw new Error(`PUT tabs/${tabId} antwortete mit HTTP ${res.status}`);
        }
        return true;
      } catch (err) {
        setTabs(previous);
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [profileId, tabs],
  );

  const openTab = useCallback(
    async (url: string, groupId?: string): Promise<ProfileTab | null> => {
      if (!profileId) return null;
      const res = await fetch(API_PATHS_V06.browserProfileTabs(profileId), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ url, groupId: groupId ?? undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `POST tabs antwortete mit HTTP ${res.status}`);
      }
      await refetch();
      return (await res.json()) as ProfileTab;
    },
    [profileId, refetch],
  );

  const closeTab = useCallback(
    async (tabId: string): Promise<boolean> => {
      if (!profileId) return false;
      const previous = tabs;
      setTabs((list) => list.filter((t) => t.id !== tabId));
      try {
        const res = await fetch(profileTabItemPath(profileId, tabId), {
          method: "DELETE",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`DELETE tabs/${tabId} antwortete mit HTTP ${res.status}`);
        return true;
      } catch (err) {
        setTabs(previous);
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [profileId, tabs],
  );

  return {
    groups,
    tabs,
    loading,
    error,
    refetch,
    createGroup,
    moveTab,
    openTab,
    closeTab,
  };
}
