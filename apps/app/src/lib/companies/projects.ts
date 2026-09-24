/**
 * Projects live under a company. Local-first (localStorage).
 * Each project belongs to an app folder (Arc, Linear, …) used on Level 3
 * to nest agents under that app logo. Double-click opens an X-style project profile.
 */

export type AppKey = "arc" | "linear" | "slack" | "browser";

export type AppDefinition = {
  key: AppKey;
  name: string;
  /** Squircle app icon path */
  logo: string;
  /** Soft banner wash behind the project profile */
  banner: string;
};

export const APP_CATALOG: AppDefinition[] = [
  {
    key: "arc",
    name: "Arc",
    logo: "/apps/arc.png",
    banner: "/companies/_banner-template.png?v=5",
  },
  {
    key: "linear",
    name: "Linear",
    logo: "/apps/linear.png",
    banner: "/companies/_banner-template.png?v=5",
  },
  {
    key: "slack",
    name: "Slack",
    logo: "/apps/slack.png",
    banner: "/companies/_banner-template.png?v=5",
  },
  {
    key: "browser",
    name: "Browser",
    logo: "/apps/browser.png",
    banner: "/companies/_banner-template.png?v=5",
  },
];

export function getApp(key: string | undefined): AppDefinition {
  return (
    APP_CATALOG.find((a) => a.key === key) ??
    APP_CATALOG.find((a) => a.key === "arc")!
  );
}

export type ConnectProject = {
  id: string;
  companyId: string;
  name: string;
  description: string;
  accent: string;
  /** Project avatar — usually the app logo */
  logo?: string;
  /** App folder key for Level 3 agent grouping */
  appFolder: AppKey;
  /** Agents nested under this project's app folder on Level 3 */
  agentIds: string[];
};

const KEY = "connect.projects";
/** v3: Zentrale (3) · Research (2) · Delivered (2) — real roster counts. */
const SEEDED_KEY = "connect.projects.seeded.v3";

const LEGACY_SEED_NAMES = new Set([
  "Research tabs",
  "Delivery board",
  "Team channel",
]);

function readAll(): ConnectProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeProject);
  } catch {
    return [];
  }
}

function normalizeProject(value: unknown): ConnectProject {
  const p = value as Partial<ConnectProject>;
  const app = getApp(p.appFolder);
  return {
    id: String(p.id ?? ""),
    companyId: String(p.companyId ?? ""),
    name: String(p.name ?? "Project"),
    description: String(p.description ?? ""),
    accent: String(p.accent ?? "#0f766e"),
    logo: p.logo ?? app.logo,
    appFolder: app.key,
    agentIds: Array.isArray(p.agentIds)
      ? p.agentIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function writeAll(list: ConnectProject[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("connect-projects-changed"));
  void import("./workspace-sync").then((m) => m.scheduleConnectWorkspacePush());
}

const ACCENTS = [
  "#0f766e",
  "#7c3aed",
  "#ca8a04",
  "#0369a1",
  "#be123c",
  "#15803d",
];

export function listProjects(companyId: string): ConnectProject[] {
  return readAll().filter((p) => p.companyId === companyId);
}

/**
 * Reorder projects for one company. `orderedIds` is the new full sequence.
 */
export function reorderProjects(
  companyId: string,
  orderedIds: string[],
): ConnectProject[] {
  const all = readAll();
  const company = all.filter((p) => p.companyId === companyId);
  const others = all.filter((p) => p.companyId !== companyId);
  const byId = new Map(company.map((p) => [p.id, p]));
  const ordered: ConnectProject[] = [];
  for (const id of orderedIds) {
    const project = byId.get(id);
    if (project) {
      ordered.push(project);
      byId.delete(id);
    }
  }
  for (const leftover of byId.values()) ordered.push(leftover);
  writeAll([...ordered, ...others]);
  return ordered;
}

/**
 * Reorder agents inside a project folder.
 */
export function reorderProjectAgents(
  projectId: string,
  orderedAgentIds: string[],
): ConnectProject | undefined {
  const project = getProject(projectId);
  if (!project) return undefined;
  const set = new Set(project.agentIds);
  const ordered = orderedAgentIds.filter((id) => set.has(id));
  for (const id of project.agentIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return updateProject(projectId, { agentIds: ordered });
}

export function getProject(id: string): ConnectProject | undefined {
  return readAll().find((p) => p.id === id);
}

/**
 * Seed Zentrale / Research / Delivered once per company so Employees matches
 * the real team folders (3 + 2 + 2 unique agents = 7).
 */
export function ensureSeedProjects(
  companyId: string,
  companyAgentIds: string[],
): void {
  if (typeof window === "undefined") return;
  try {
    const seeded = JSON.parse(
      window.localStorage.getItem(SEEDED_KEY) ?? "{}",
    ) as Record<string, boolean>;
    if (seeded[companyId]) return;

    const [a, b, c, d, e, f, g] = companyAgentIds;
    const recipes: {
      name: string;
      description: string;
      app: AppKey;
      agents: string[];
    }[] = [
      {
        name: "Zentrale",
        description: "Leadership and day-to-day ops.",
        app: "slack",
        agents: [a, b, c].filter(Boolean) as string[],
      },
      {
        name: "Research",
        description: "Browse, collect, and brief.",
        app: "arc",
        agents: [d, e].filter(Boolean) as string[],
      },
      {
        name: "Delivered",
        description: "Issues, cycles, and shipping.",
        app: "linear",
        agents: [f, g].filter(Boolean) as string[],
      },
    ];

    // Drop legacy English seed folders so counts stay honest.
    const kept = listProjects(companyId).filter(
      (p) => !LEGACY_SEED_NAMES.has(p.name),
    );
    const otherCompanies = readAll().filter((p) => p.companyId !== companyId);
    writeAll([...kept, ...otherCompanies]);

    const have = new Set(listProjects(companyId).map((p) => p.name));
    for (const recipe of recipes) {
      if (have.has(recipe.name)) {
        const existing = listProjects(companyId).find(
          (p) => p.name === recipe.name,
        );
        if (existing) {
          updateProject(existing.id, { agentIds: recipe.agents });
        }
        continue;
      }
      createProject({
        companyId,
        name: recipe.name,
        description: recipe.description,
        appFolder: recipe.app,
        agentIds: recipe.agents,
        logo: getApp(recipe.app).logo,
      });
    }

    seeded[companyId] = true;
    window.localStorage.setItem(SEEDED_KEY, JSON.stringify(seeded));
  } catch {
    /* ignore */
  }
}

/** Unique agents on the company roster and in every team folder. */
export function countCompanyEmployees(
  companyId: string,
  companyAgentIds: readonly string[] = [],
): number {
  const ids = new Set(companyAgentIds.filter(Boolean));
  for (const project of listProjects(companyId)) {
    for (const id of project.agentIds) ids.add(id);
  }
  return ids.size;
}

export function createProject(input: {
  companyId: string;
  name: string;
  description?: string;
  appFolder?: AppKey | string;
  logo?: string;
  agentIds?: string[];
}): ConnectProject {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  const all = readAll();
  const app = getApp(input.appFolder);
  const id = `${input.companyId}-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32)}-${Date.now().toString(36)}`;
  const project: ConnectProject = {
    id,
    companyId: input.companyId,
    name,
    description: (input.description ?? "").trim() || `${app.name} project`,
    accent: ACCENTS[all.length % ACCENTS.length],
    logo: input.logo ?? app.logo,
    appFolder: app.key,
    agentIds: input.agentIds ?? [],
  };
  writeAll([project, ...all]);
  return project;
}

export function deleteProject(id: string): boolean {
  const all = readAll();
  const next = all.filter((p) => p.id !== id);
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}

export function updateProject(
  id: string,
  patch: Partial<
    Pick<
      ConnectProject,
      "name" | "description" | "logo" | "appFolder" | "agentIds" | "accent"
    >
  >,
): ConnectProject | undefined {
  const all = readAll();
  const index = all.findIndex((p) => p.id === id);
  if (index < 0) return undefined;
  const current = all[index];
  const app = getApp(patch.appFolder ?? current.appFolder);
  const next: ConnectProject = {
    ...current,
    ...patch,
    appFolder: app.key,
    logo: patch.logo ?? (patch.appFolder ? app.logo : current.logo) ?? app.logo,
  };
  all[index] = next;
  writeAll(all);
  return next;
}

/** Add agents to a project (idempotent). Used by channel “Assign to project”. */
export function assignAgentsToProject(
  projectId: string,
  agentIds: readonly string[],
): ConnectProject | undefined {
  const project = getProject(projectId);
  if (!project) return undefined;
  const merged = [...new Set([...project.agentIds, ...agentIds.filter(Boolean)])];
  return updateProject(projectId, { agentIds: merged });
}

/** Remove agents from a project. */
export function removeAgentsFromProject(
  projectId: string,
  agentIds: readonly string[],
): ConnectProject | undefined {
  const project = getProject(projectId);
  if (!project) return undefined;
  const drop = new Set(agentIds);
  return updateProject(projectId, {
    agentIds: project.agentIds.filter((id) => !drop.has(id)),
  });
}

/** True when every given agent is already on the project. */
export function projectHasAgents(
  project: ConnectProject,
  agentIds: readonly string[],
): boolean {
  if (agentIds.length === 0) return false;
  const set = new Set(project.agentIds);
  return agentIds.every((id) => set.has(id));
}

/** Projects grouped by app folder for Level 3. */
export function projectsByApp(
  companyId: string,
): { app: AppDefinition; projects: ConnectProject[] }[] {
  const projects = listProjects(companyId);
  const map = new Map<AppKey, ConnectProject[]>();
  for (const project of projects) {
    const list = map.get(project.appFolder) ?? [];
    list.push(project);
    map.set(project.appFolder, list);
  }
  // Always show known apps that have projects; order follows catalog
  return APP_CATALOG.map((app) => ({
    app,
    projects: map.get(app.key) ?? [],
  })).filter((row) => row.projects.length > 0);
}

export function subscribeProjects(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("connect-projects-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("connect-projects-changed", handler);
    window.removeEventListener("storage", handler);
  };
}
