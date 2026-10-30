/**
 * Connect-Sozial: Research Projects Service (v06 / A21)
 *
 * Verantwortlich für:
 * - Kollaborative Forschungsprojekte (z. B. mit GitHub-Repo)
 * - Erscheinen in der Timeline als 'project_update'
 * - Non-Profit Kennzeichnung
 * - Löschen = Archivieren
 */

import { randomUUID } from "node:crypto";
import type { ResearchProject } from "../../contracts/v06/social";
import { createPost } from "./posts";

export interface CreateProjectInput {
  title: string;
  goal: string;
  repoUrl?: string;
  accountCompanyId: string;
  isNonProfit?: boolean;
}

export interface StoredProject extends ResearchProject {
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

const memoryProjects = new Map<string, StoredProject>();

export function resetMemoryProjectsStore(): void {
  memoryProjects.clear();
}

export function seedMemoryProject(project: StoredProject): void {
  memoryProjects.set(project.id, { ...project });
}

/**
 * Erstellt ein neues Forschungsprojekt und veröffentlicht ein Update in der Timeline.
 */
export async function createProject(
  input: CreateProjectInput,
  options?: { dbOverride?: any },
): Promise<ResearchProject> {
  if (!input.title || input.title.trim() === "") {
    throw new Error("Projekttitel ist erforderlich.");
  }
  if (!input.goal || input.goal.trim() === "") {
    throw new Error("Projektziel (goal) ist erforderlich.");
  }
  if (!input.accountCompanyId || input.accountCompanyId.trim() === "") {
    throw new Error("accountCompanyId ist erforderlich.");
  }

  const id = `proj_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();

  const stored: StoredProject = {
    id,
    title: input.title.trim(),
    goal: input.goal.trim(),
    repoUrl: input.repoUrl?.trim() || undefined,
    accountCompanyId: input.accountCompanyId.trim(),
    isNonProfit: input.isNonProfit ?? true,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  memoryProjects.set(id, stored);

  const sql = options?.dbOverride;
  if (sql) {
    try {
      await sql`
        INSERT INTO research_projects (id, title, goal, repo_url, account_company_id, is_non_profit, status, created_at, updated_at)
        VALUES (${id}, ${stored.title}, ${stored.goal}, ${stored.repoUrl || null}, ${stored.accountCompanyId}, ${stored.isNonProfit}, ${stored.status}, now(), now())
      `;
    } catch {
      // In-Memory Fallback
    }
  }

  // Erscheinen in der Timeline als 'project_update'
  const repoNotice = stored.repoUrl ? `\nRepository: ${stored.repoUrl}` : "";
  const nonProfitNotice = stored.isNonProfit ? " [Non-Profit Forschung]" : "";
  const updateText = `🔬 Neues Forschungsprojekt gestartet${nonProfitNotice}:\n"${stored.title}"\nZiel: ${stored.goal}${repoNotice}`;

  try {
    await createPost(
      {
        authorCompanyId: stored.accountCompanyId,
        kind: "project_update",
        text: updateText,
      },
      options,
    );
  } catch (err) {
    console.error("[v06-projects] Fehler beim Erstellen des Timeline-Updates:", err);
  }

  return {
    id: stored.id,
    title: stored.title,
    goal: stored.goal,
    repoUrl: stored.repoUrl,
    accountCompanyId: stored.accountCompanyId,
    isNonProfit: stored.isNonProfit,
    status: stored.status,
  };
}

/**
 * Listet aktive Forschungsprojekte auf.
 */
export async function listProjects(
  options: {
    accountCompanyId?: string;
    status?: "open" | "running" | "done";
    limit?: number;
    dbOverride?: any;
  } = {},
): Promise<ResearchProject[]> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);

  const projects = Array.from(memoryProjects.values()).filter((p) => {
    if (p.archivedAt) return false;
    if (options.accountCompanyId && p.accountCompanyId !== options.accountCompanyId) return false;
    if (options.status && p.status !== options.status) return false;
    return true;
  });

  projects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return projects.slice(0, limit).map((p) => ({
    id: p.id,
    title: p.title,
    goal: p.goal,
    repoUrl: p.repoUrl,
    accountCompanyId: p.accountCompanyId,
    isNonProfit: p.isNonProfit,
    status: p.status,
  }));
}

/**
 * Liest ein Forschungsprojekt anhand seiner ID.
 */
export async function getProjectById(
  id: string,
  options?: { dbOverride?: any },
): Promise<ResearchProject | null> {
  const p = memoryProjects.get(id);
  if (p && !p.archivedAt) {
    return {
      id: p.id,
      title: p.title,
      goal: p.goal,
      repoUrl: p.repoUrl,
      accountCompanyId: p.accountCompanyId,
      isNonProfit: p.isNonProfit,
      status: p.status,
    };
  }
  return null;
}

/**
 * Archiviert ein Projekt (Löschen = archivieren).
 */
export async function archiveProject(
  id: string,
  options?: { dbOverride?: any },
): Promise<boolean> {
  const p = memoryProjects.get(id);
  if (!p || p.archivedAt) return false;
  p.archivedAt = new Date().toISOString();
  return true;
}
