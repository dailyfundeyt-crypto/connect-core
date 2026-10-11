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
  location: () => [...brainKeys.all, "location"] as const,
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

/**
 * Writes a `.md` file back into the Brain.
 *
 * The counterpart to `brainFileQueryOptions`: reading a file that lives on disk and
 * saving the edits back to the same path is the whole point of showing the vault
 * here as editable notes rather than as a read-only tree.
 *
 * `mode: "create"` refuses to overwrite an existing file, which is what a new note
 * wants. `mode: "write"` replaces it, which is what saving an edited note wants --
 * there is nothing to protect there, the file being replaced is the one just read.
 */
export function brainSaveNoteMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (input: { path: string; content: string; mode: "create" | "write" }) =>
      client<{ path: string; created: boolean }>("/api/brain/note", "commit", {
        method: "PUT",
        body: input,
        fallback: "Notiz konnte nicht gespeichert werden",
      }),
    onSuccess: (result: { path: string; created: boolean }) => {
      // The saved file, the tree it sits in and the graph all read from disk, so all
      // three are stale now. Leaving them cached shows the pre-edit text next to the
      // edit that just landed.
      void queryClient.invalidateQueries({ queryKey: brainKeys.file(result.path) });
      void queryClient.invalidateQueries({ queryKey: brainKeys.all });
    },
  };
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

export type BrainLocation = {
  brainPath: string | null;
  vaultPath: string | null;
  /** `saved` = chosen in this app, `env` = from `connect.env`, `default` = built-in guess. */
  source: "saved" | "env" | "default";
};

export function brainLocationQueryOptions() {
  return queryOptions({
    queryKey: brainKeys.location(),
    queryFn: () =>
      brainGet<BrainLocation>("/api/brain/location", {
        brainPath: null,
        vaultPath: null,
        source: "default",
      }),
    staleTime: 60_000,
  });
}

/**
 * Copies a file's location to the clipboard, as the absolute path on disk.
 *
 * This is what "show me where this is" means for the sidebar. It replaced opening
 * the Windows Explorer, which turned out to be the wrong shape: the Explorer only
 * exists on the desktop app, it took a Rust command and a new capability to
 * reach, and it was the kind of thing that breaks the moment the vault lives
 * somewhere else. A copied path works the same in the browser and in the app, and
 * it is what you actually want when the next step is pasting it into Obsidian,
 * into a terminal or into somebody else's chat.
 *
 * `path` is relative to the Brain, so it is joined onto the configured root here.
 * The join is done on the client because the frontend is the only side that knows
 * both halves; a wrong join produces a path that simply does not exist rather than
 * one that points somewhere real.
 *
 * Returns the reason it failed, or `null` when the path is on the clipboard.
 */
export async function copyBrainPath(path: string): Promise<string | null> {
  const location = await brainGet<BrainLocation>(
    "/api/brain/location",
    { brainPath: null, vaultPath: null, source: "default" },
  );
  if (!location.brainPath) return "Kein Brain-Ordner festgelegt.";

  /*
   * `..` is dropped rather than resolved. It cannot come from the tree -- that is
   * built from real files -- but a hand-written value should not be able to walk
   * the join out of the vault before it is pasted somewhere.
   */
  const relative = path
    .split(/[\\/]+/)
    .filter((part) => part && part !== ".." && part !== ".")
    .join("/");
  const separator = location.brainPath.includes("\\") ? "\\" : "/";
  const absolute = relative
    ? `${location.brainPath.replace(/[\\/]+$/, "")}${separator}${relative.replace(/\//g, separator)}`
    : location.brainPath;

  try {
    await navigator.clipboard.writeText(absolute);
    return null;
  } catch {
    /*
     * The clipboard needs a secure context and a user gesture, and this is called
     * from a menu click, so it should hold. When it does not, saying so beats a
     * silent no-op that leaves somebody pasting whatever was on the clipboard
     * before.
     */
    return "Pfad konnte nicht kopiert werden.";
  }
}

/**
 * Points the Brain at another folder.
 *
 * Every Brain query is invalidated afterwards, not just the location one: the
 * status, the tree and the graph all read from the folder that just changed, and
 * leaving them cached would show the old folder's files next to the new path.
 */
export function saveBrainLocationMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (input: { path: string; vaultPath?: string | null }) =>
      client<BrainLocation>("/api/brain/location", "commit", {
        method: "PUT",
        body: input,
        fallback: "Ordner konnte nicht gespeichert werden",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: brainKeys.all });
    },
  };
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
