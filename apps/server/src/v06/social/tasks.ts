/**
 * Connect-Sozial: Project Tasks Service (v06 / A21)
 *
 * Verantwortlich für:
 * - Aufgabenstruktur als Baum / DAG (ProjectTask)
 * - Zuordnung zu Bots (assigneeBotId)
 * - Statusübergänge: todo -> claimed -> done | blocked
 * - Löschen = Archivieren
 */

import { randomUUID } from "node:crypto";
import type { ProjectTask } from "../../contracts/v06/social";
import { getProjectById } from "./projects";

export interface CreateTaskInput {
  projectId?: string;
  parentId?: string;
  title: string;
  acceptance: string;
  status?: "todo" | "claimed" | "done" | "blocked";
  assigneeBotId?: string;
}

export interface StoredTask extends ProjectTask {
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

const memoryTasks = new Map<string, StoredTask>();

export function resetMemoryTasksStore(): void {
  memoryTasks.clear();
}

export function seedMemoryTask(task: StoredTask): void {
  memoryTasks.set(task.id, { ...task });
}

/**
 * Erstellt eine neue Aufgabe für ein Projekt.
 */
export async function createProjectTask(
  projectId: string,
  input: CreateTaskInput,
  options?: { dbOverride?: any },
): Promise<ProjectTask> {
  if (!projectId || projectId.trim() === "") {
    throw new Error("projectId ist erforderlich.");
  }
  if (!input.title || input.title.trim() === "") {
    throw new Error("Aufgabentitel ist erforderlich.");
  }
  if (!input.acceptance || input.acceptance.trim() === "") {
    throw new Error("Akzeptanzkriterien (acceptance) sind erforderlich.");
  }

  const project = await getProjectById(projectId, options);
  if (!project) {
    throw new Error(`Projekt mit ID '${projectId}' wurde nicht gefunden.`);
  }

  if (input.parentId) {
    const parent = memoryTasks.get(input.parentId);
    if (!parent || parent.archivedAt || parent.projectId !== projectId) {
      throw new Error(`Übergeordnete Aufgabe (parentId) '${input.parentId}' nicht im Projekt gefunden.`);
    }
  }

  const validStatuses: ProjectTask["status"][] = ["todo", "claimed", "done", "blocked"];
  const status = input.status || "todo";
  if (!validStatuses.includes(status)) {
    throw new Error(`Ungültiger Status: '${status}'. Erlaubt sind: ${validStatuses.join(", ")}`);
  }

  const id = `task_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();

  const stored: StoredTask = {
    id,
    projectId,
    parentId: input.parentId || undefined,
    title: input.title.trim(),
    acceptance: input.acceptance.trim(),
    status,
    assigneeBotId: input.assigneeBotId ? input.assigneeBotId.trim() : undefined,
    createdAt: now,
    updatedAt: now,
  };

  memoryTasks.set(id, stored);

  const sql = options?.dbOverride;
  if (sql) {
    try {
      await sql`
        INSERT INTO project_tasks (id, project_id, parent_id, title, acceptance, status, assignee_bot_id, created_at, updated_at)
        VALUES (${id}, ${projectId}, ${stored.parentId || null}, ${stored.title}, ${stored.acceptance}, ${stored.status}, ${stored.assigneeBotId || null}, now(), now())
      `;
    } catch {
      // In-Memory Fallback
    }
  }

  return {
    id: stored.id,
    projectId: stored.projectId,
    parentId: stored.parentId,
    title: stored.title,
    acceptance: stored.acceptance,
    status: stored.status,
    assigneeBotId: stored.assigneeBotId,
  };
}

/**
 * Listet alle Aufgaben eines Projekts als Liste auf.
 */
export async function listProjectTasks(
  projectId: string,
  options?: { dbOverride?: any },
): Promise<ProjectTask[]> {
  const tasks = Array.from(memoryTasks.values()).filter((t) => {
    if (t.archivedAt) return false;
    if (t.projectId !== projectId) return false;
    return true;
  });

  tasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return tasks.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    parentId: t.parentId,
    title: t.title,
    acceptance: t.acceptance,
    status: t.status,
    assigneeBotId: t.assigneeBotId,
  }));
}

/**
 * Aktualisiert eine bestehende Aufgabe.
 */
export async function updateProjectTask(
  id: string,
  updates: Partial<Pick<ProjectTask, "title" | "acceptance" | "status" | "assigneeBotId" | "parentId">>,
  options?: { dbOverride?: any },
): Promise<ProjectTask> {
  const t = memoryTasks.get(id);
  if (!t || t.archivedAt) {
    throw new Error(`Aufgabe mit ID '${id}' nicht gefunden.`);
  }

  if (updates.status) {
    const validStatuses: ProjectTask["status"][] = ["todo", "claimed", "done", "blocked"];
    if (!validStatuses.includes(updates.status)) {
      throw new Error(`Ungültiger Status: '${updates.status}'.`);
    }
    t.status = updates.status;
  }
  if (updates.title) t.title = updates.title.trim();
  if (updates.acceptance) t.acceptance = updates.acceptance.trim();
  if (updates.assigneeBotId !== undefined) t.assigneeBotId = updates.assigneeBotId || undefined;
  if (updates.parentId !== undefined) t.parentId = updates.parentId || undefined;
  t.updatedAt = new Date().toISOString();

  return {
    id: t.id,
    projectId: t.projectId,
    parentId: t.parentId,
    title: t.title,
    acceptance: t.acceptance,
    status: t.status,
    assigneeBotId: t.assigneeBotId,
  };
}

/**
 * Archiviert eine Aufgabe (Löschen = archivieren).
 */
export async function archiveProjectTask(
  id: string,
  options?: { dbOverride?: any },
): Promise<boolean> {
  const t = memoryTasks.get(id);
  if (!t || t.archivedAt) return false;
  t.archivedAt = new Date().toISOString();
  return true;
}
