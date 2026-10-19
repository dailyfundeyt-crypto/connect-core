import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { client } from "@/lib/client";
import { brainKeys, type BrainAreaId } from "@/lib/brain/queries";

/** MAPS-Daten fuer die Brain-Seite. Jede Zahl hier kommt aus einer Datei im Brain (Zeigen, nicht speichern). */
export type MapsFileRule = { path: string; read?: boolean; write?: boolean };
export type MapsArea = {
  id: string;
  name: string;
  kind?: string;
  parent?: string | null;
  bereich: string | null;
  wegweiser: string;
  prefixes: string[];
  files: string[];
  moved: { from: string; to: string }[];
  missing: string[];
  count: number;
};
export type MapsAgent = {
  slug: string;
  name: string;
  kind: string | null;
  read: BrainAreaId[];
  write: BrainAreaId[];
  files: MapsFileRule[];
  mapPath: string;
  areas: string[];
  writeAreas: string[];
  touched: { path: string; action: string; at: string }[];
};
export type MapsRun = { date: string; time: string; routine: string; agent: string; status: string; ms: number; note: string };
export type MapsRoutine = {
  name: string;
  zweck: string;
  agent: string;
  aktion: string;
  at?: string;
  every?: string;
  machine?: string;
  aktiv?: boolean;
  last: MapsRun | null;
  fails: number;
  paused: boolean;
};
export type MapsNeed = { index: number; done: boolean; text: string; agent: string | null; at: string | null };
export type MapsAgendaItem = { date: string; text: string; path: string; line: number; kind: "aufgabe" | "tagesnotiz" };
export type MapsLint = {
  at: string;
  scanned: number;
  broken: { from: string; link: string; wegweiser: boolean }[];
  brokenTotal: number;
  folders: { area: string; problem: string }[];
};
export type MapsDashboard =
  | {
      available: true;
      corePrefix: string;
      mapPath: string;
      hasMap: boolean;
      areas: MapsArea[];
      agents: MapsAgent[];
      routines: MapsRoutine[];
      routinesError: string | null;
      runs: MapsRun[];
      failCap: number;
      needs: MapsNeed[];
      needsPath: string;
      agenda: { today: string; heute: MapsAgendaItem[]; naechste: MapsAgendaItem[] };
      lint: MapsLint | null;
    }
  | { available: false; reason?: string };

export type MapsAccess = {
  path: string;
  corePath: string;
  vault: boolean;
  agents: { slug: string; name: string; area: string | null; read: boolean; write: boolean; rule: MapsFileRule | null }[];
};

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!(response.headers.get("content-type") ?? "").includes("application/json")) return fallback;
    const body = (await response.json()) as T;
    return body ?? fallback;
  } catch {
    return fallback;
  }
}

export const mapsKeys = {
  dashboard: () => [...brainKeys.all, "maps"] as const,
  access: (path: string) => [...brainKeys.all, "access", path] as const,
};

export function mapsDashboardQueryOptions() {
  return queryOptions({
    queryKey: mapsKeys.dashboard(),
    queryFn: () => getJson<MapsDashboard>("/api/brain/maps", { available: false, reason: "Server ohne MAPS (Neustart noetig?)" }),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

export function mapsAccessQueryOptions(path: string) {
  return queryOptions({
    queryKey: mapsKeys.access(path),
    enabled: path.length > 0,
    queryFn: () => getJson<(MapsAccess & { available: true }) | { available: false }>(`/api/brain/access?path=${encodeURIComponent(path)}`, { available: false }),
  });
}

const invalidate = (queryClient: QueryClient) => void queryClient.invalidateQueries({ queryKey: brainKeys.all });

export function runRoutineMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (name: string) =>
      client<{ status: string; note: string }>("/api/brain/pulse/run", { unwrap: true, method: "POST", body: { name }, fallback: "Routine konnte nicht laufen" }),
    onSettled: () => invalidate(queryClient),
  };
}

export function resumeRoutineMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (name: string) =>
      client<{ available: boolean }>("/api/brain/pulse/resume", { unwrap: true, method: "POST", body: { name }, fallback: "Fortsetzen fehlgeschlagen" }),
    onSettled: () => invalidate(queryClient),
  };
}

export function toggleNeedMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (input: { index: number; done: boolean }) =>
      client<{ available: boolean }>("/api/brain/needs", { unwrap: true, method: "PUT", body: input, fallback: "Abhaken fehlgeschlagen" }),
    onSettled: () => invalidate(queryClient),
  };
}

export function saveAgentRulesMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (input: { slug: string; read: BrainAreaId[]; write: BrainAreaId[]; files: MapsFileRule[] }) =>
      client<{ available: boolean }>(`/api/brain/agents/${encodeURIComponent(input.slug)}`, {
        unwrap: true,
        method: "PUT",
        body: input,
        fallback: "Rechte konnten nicht gespeichert werden",
      }),
    onSettled: () => invalidate(queryClient),
  };
}
