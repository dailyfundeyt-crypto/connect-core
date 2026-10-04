import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { client } from "@/lib/client";

/** The Brain areas an agent may read or write (see Brain/CONVENTIONS.md). */
export const BRAIN_AREAS = [
  { id: "Kern", label: "Kern", hint: "AGENTS, hot, index, Regeln, agents.json" },
  { id: "Shared", label: "Shared", hint: "Geprüfte Fakten für alle" },
  { id: "Projects", label: "Projekte (alle)", hint: "Alle Projekt-Übersichten und ihre Vault-Notizen" },
  { id: "Memory:eigen", label: "Memory (eigen)", hint: "Nur der eigene Ordner" },
  { id: "Memory", label: "Memory (alle)", hint: "Notizen aller Agents" },
  { id: "Daily", label: "Daily", hint: "Gemeinsamer Tagesüberblick" },
  { id: "Inbox", label: "Inbox", hint: "Vorschläge für Shared" },
  { id: "Skills", label: "Skills", hint: "Wiederverwendbare Abläufe" },
  { id: "log", label: "Log", hint: "Änderungsprotokoll" },
] as const;
/** A fixed area or one project: `Projekt:<id>` (projects come from agents.json). */
export type BrainAreaId = (typeof BRAIN_AREAS)[number]["id"] | `Projekt:${string}`;
export type BrainProject = {
  id: string;
  name: string;
  kind?: string;
  parent?: string | null;
  moc?: string | null;
  folders: string[];
  files: string[];
};
export const VAULT_PREFIX = "Vault/";

export type BrainStatus =
  | {
      available: true;
      path: string;
      vaultPath?: string | null;
      files: number;
      vaultFiles?: number;
      head: { hash: string; date: string; subject: string } | null;
    }
  | { available: false; reason: string; path?: string | null };

export type BrainFileInfo = { path: string; size: number; mtime: string };
export type BrainLogEntry = { date: string; time: string; agent: string; action: string; files: string[]; note: string };
export type BrainAgentEntry = {
  slug: string;
  name?: string;
  kind?: string;
  connectAgentId?: string;
  read: BrainAreaId[];
  write: BrainAreaId[];
  note?: string;
};
export type BrainActivity = {
  reads: number;
  writes: number;
  denied?: number;
  last: string | null;
  lastRead?: string | null;
  lastWrite?: string | null;
};
export type BrainGraphNode = {
  id: string;
  label: string;
  kind: "note" | "vault" | "missing" | "agent" | "area";
  group: string;
  project?: string;
  path?: string;
  degree: number;
  hub: boolean;
};
export type BrainGraphEdge = { source: string; target: string; kind: "link" | "read" | "write" | "area" };
export type BrainGraph = { available: boolean; nodes: BrainGraphNode[]; edges: BrainGraphEdge[] };

export type BrainAgents = {
  available: boolean;
  reason?: string;
  defaults?: { read: BrainAreaId[]; write: BrainAreaId[] };
  agents: BrainAgentEntry[];
  projects?: BrainProject[];
  activity?: Record<string, BrainActivity>;
  memoryFolders?: string[];
};

/**
 * The Brain endpoints answer "not available" on hosted deployments, and an older server answers the
 * SPA's HTML or 404: all of those become the fallback. Only a refused path (400) is an error.
 */
async function brainGet<T>(path: string, fallback: T): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include" });
  } catch {
    return fallback;
  }
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("application/json") ? ((await response.json().catch(() => null)) as unknown) : null;
  if (response.status === 400) {
    throw new Error((body as { error?: string } | null)?.error ?? "Ungültige Anfrage");
  }
  if (!response.ok || !body || typeof body !== "object") return fallback;
  return body as T;
}

const NOT_AVAILABLE = "Brain nicht verfügbar";

export const brainKeys = {
  all: ["brain"] as const,
  status: () => [...brainKeys.all, "status"] as const,
  tree: () => [...brainKeys.all, "tree"] as const,
  file: (path: string) => [...brainKeys.all, "file", path] as const,
  search: (q: string) => [...brainKeys.all, "search", q] as const,
  log: (agent?: string) => [...brainKeys.all, "log", agent ?? "*"] as const,
  agents: () => [...brainKeys.all, "agents"] as const,
  graph: (agents: boolean) => [...brainKeys.all, "graph", agents] as const,
  backlinks: (path: string) => [...brainKeys.all, "backlinks", path] as const,
};

export function brainGraphQueryOptions(agents: boolean) {
  return queryOptions({
    queryKey: brainKeys.graph(agents),
    queryFn: () =>
      brainGet<BrainGraph>(`/api/brain/graph${agents ? "?agents=1" : ""}`, { available: false, nodes: [], edges: [] }),
    staleTime: 30_000,
  });
}

export function brainBacklinksQueryOptions(path: string) {
  return queryOptions({
    queryKey: brainKeys.backlinks(path),
    enabled: path.length > 0,
    queryFn: () =>
      brainGet<{ available: boolean; backlinks: { path: string; context: string }[] }>(
        `/api/brain/backlinks?path=${encodeURIComponent(path)}`,
        { available: false, backlinks: [] },
      ),
  });
}

export function brainStatusQueryOptions() {
  return queryOptions({
    queryKey: brainKeys.status(),
    queryFn: () => brainGet<BrainStatus>("/api/brain/status", { available: false, reason: NOT_AVAILABLE }),
    staleTime: 15_000,
  });
}

export function brainTreeQueryOptions() {
  return queryOptions({
    queryKey: brainKeys.tree(),
    queryFn: () =>
      brainGet<{ available: boolean; files: BrainFileInfo[] }>("/api/brain/tree", { available: false, files: [] }),
  });
}

export function brainFileQueryOptions(path: string) {
  return queryOptions({
    queryKey: brainKeys.file(path),
    enabled: path.length > 0,
    queryFn: async () => {
      const result = await brainGet<{ available: boolean; file?: { path: string; content: string; mtime: string; size: number; readOnly?: boolean } }>(
        `/api/brain/file?path=${encodeURIComponent(path)}`,
        { available: false },
      );
      return result.file ?? null;
    },
  });
}

export function brainSearchQueryOptions(q: string) {
  return queryOptions({
    queryKey: brainKeys.search(q),
    enabled: q.trim().length >= 2,
    queryFn: () =>
      brainGet<{ available: boolean; hits: { path: string; line: number; text: string }[] }>(
        `/api/brain/search?q=${encodeURIComponent(q.trim())}`,
        { available: false, hits: [] },
      ),
  });
}

export function brainLogQueryOptions(agent?: string, limit = 30) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (agent) params.set("agent", agent);
  return queryOptions({
    queryKey: [...brainKeys.log(agent), limit],
    queryFn: () =>
      brainGet<{ available: boolean; entries: BrainLogEntry[] }>(`/api/brain/log?${params}`, {
        available: false,
        entries: [],
      }),
  });
}

export function brainAgentsQueryOptions() {
  return queryOptions({
    queryKey: brainKeys.agents(),
    queryFn: () => brainGet<BrainAgents>("/api/brain/agents", { available: false, agents: [] }),
  });
}

export function saveBrainScopesMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (input: {
      slug: string;
      name?: string;
      kind?: string;
      connectAgentId?: string;
      read: BrainAreaId[];
      write: BrainAreaId[];
    }) =>
      client<string | null>(`/api/brain/agents/${encodeURIComponent(input.slug)}`, "commit", {
        method: "PUT",
        body: input,
        fallback: "Rechte konnten nicht gespeichert werden",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: brainKeys.all });
    },
  };
}

/** Brain slug for a Connect agent without an explicit entry: `connect-<name>`. */
export function connectAgentSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `connect-${base || "agent"}`;
}

export function findBrainEntry(agents: BrainAgentEntry[], agent: { id: string; name: string }) {
  return (
    agents.find((entry) => entry.connectAgentId === agent.id) ??
    agents.find((entry) => entry.slug === connectAgentSlug(agent.name))
  );
}

export function areaLabel(id: string, projects: BrainProject[] = []) {
  if (id.startsWith("Projekt:")) {
    const project = projects.find((p) => `Projekt:${p.id}` === id);
    return project ? project.name : id.slice(8);
  }
  return BRAIN_AREAS.find((area) => area.id === id)?.label ?? id;
}
