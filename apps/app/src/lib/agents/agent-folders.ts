/**
 * Agenten-Ordner für das Agenten-Raster (Lane A28).
 *
 * EIGENTÜMER: A28. Andere Lanes lesen diese Datei, ändern sie aber NICHT.
 *
 * Warum kein eigener Store?
 * -----------------------
 * Connect hat heute schon genau diese Ordner: `ConnectProject` in
 * `@/lib/companies/projects`. Sie halten eine `agentIds`-Liste, werden per
 * Drag & Drop gefüllt, lassen sich umbenennen und zuklappen — und sie werden
 * über `workspace-sync` serverseitig nach Postgres gespiegelt
 * (`connect.projects` steht in `WORKSPACE_KEYS`). Damit ist „Speicherung
 * serverseitig" und „vorhandene Gruppen nutzen" (Aufgabe 2) in einem Schritt
 * erledigt, ohne einen zweiten, konkurrierenden Ordner-Speicher zu erfinden.
 *
 * Diese Datei ist die schmale, getestbare Fassade darüber: sie kennt die
 * Ordner-Semantik (ein Agent liegt in höchstens einem Ordner), rechnet die
 * Sortierung und das Verschieben, und kapselt die Details des Projects-Stores.
 * Der Projects-Store selbst bleibt unangetastet.
 */

import {
  assignAgentsToProject,
  createProject,
  deleteProject,
  listProjects,
  removeAgentsFromProject,
  reorderProjectAgents,
  subscribeProjects,
  updateProject,
  type ConnectProject,
} from "@/lib/companies/projects";

/** Ein Ordner im Agenten-Raster. Dünnere Hülle um `ConnectProject`. */
export type AgentFolder = {
  id: string;
  companyId: string;
  name: string;
  /** Agent-IDs in der Reihenfolge, in der sie im Raster stehen. */
  agentIds: string[];
};

/** Was ein Drop eines Agenten bewirken soll. */
export type AgentFolderMove =
  | { kind: "into"; folderId: string; position?: number }
  | { kind: "out" };

/**
 * Ordnernamen normalisieren: getrimmt, ohne Leerzeichen-Folge, höchstens 48
 * Zeichen. Leer heißt „ungültig" — der Aufrufer entscheidet, was passiert.
 */
export function normalizeFolderName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 48);
}

/** Wandelt einen Project in die Raster-Form. */
export function toAgentFolder(project: ConnectProject): AgentFolder {
  return {
    id: project.id,
    companyId: project.companyId,
    name: project.name,
    agentIds: [...project.agentIds],
  };
}

/** Alle Ordner einer Firma, in stabiler Reihenfolge. */
export function listAgentFolders(companyId: string | null): AgentFolder[] {
  if (!companyId) return [];
  return listProjects(companyId).map(toAgentFolder);
}

/** Einen Ordner einer Firma anhand der Id finden. */
export function findAgentFolder(
  companyId: string | null,
  folderId: string,
): AgentFolder | null {
  if (!companyId || !folderId) return null;
  const found = listProjects(companyId).find((p) => p.id === folderId);
  return found ? toAgentFolder(found) : null;
}

/** Einen Ordner anlegen. Wirft bei leerem Namen. */
export function createAgentFolder(
  companyId: string,
  rawName: string,
): AgentFolder {
  const name = normalizeFolderName(rawName);
  if (!name) throw new Error("Name is required.");
  const project = createProject({ companyId, name });
  return toAgentFolder(project);
}

/** Einen Ordner umbenennen. */
export function renameAgentFolder(
  companyId: string,
  folderId: string,
  rawName: string,
): AgentFolder | null {
  const name = normalizeFolderName(rawName);
  if (!name) return null;
  const existing = findAgentFolder(companyId, folderId);
  if (!existing) return null;
  const updated = updateProject(folderId, { name });
  return updated ? toAgentFolder(updated) : null;
}

/**
 * Agent in einen Ordner legen — idempotent.
 *
 * Ein Agent liegt in höchstens einem Ordner: vorherige Zugehörigkeiten werden
 * entfernt. Sonst taucht derselbe Agent in zwei Ordnern auf und der Nutzer
 * kann nicht mehr sagen, wo er ihn findet.
 */
export function addAgentToFolder(
  companyId: string,
  folderId: string,
  agentId: string,
): AgentFolder | null {
  const target = findAgentFolder(companyId, folderId);
  if (!target || !agentId) return null;
  removeAgentFromEveryFolder(companyId, agentId, target.id);
  if (!target.agentIds.includes(agentId)) {
    assignAgentsToProject(folderId, [agentId]);
  }
  return findAgentFolder(companyId, folderId);
}

/** Agent aus einem Ordner nehmen (landet danach in „ohne Ordner"). */
export function removeAgentFromFolder(
  companyId: string,
  folderId: string,
  agentId: string,
): AgentFolder | null {
  const target = findAgentFolder(companyId, folderId);
  if (!target) return null;
  if (target.agentIds.includes(agentId)) {
    removeAgentsFromProject(folderId, [agentId]);
  }
  return findAgentFolder(companyId, folderId);
}

/**
 * Ordner löschen. Die Agenten darin landen danach in „ohne Ordner" — sie
 * werden nicht mitgelöscht.
 */
export function deleteAgentFolder(
  companyId: string,
  folderId: string,
): boolean {
  const target = findAgentFolder(companyId, folderId);
  if (!target) return false;
  return deleteProject(folderId);
}

/**
 * Drag & Drop-Ziel ausführen.
 *
 * `into` legt den Agenten in den Ordner (und entfernt ihn aus allen anderen),
 * `out` nimmt ihn aus seinem Ordner heraus.
 */
export function applyAgentFolderMove(
  companyId: string,
  agentId: string,
  move: AgentFolderMove,
): AgentFolder[] {
  if (!companyId || !agentId) return listAgentFolders(companyId);
  if (move.kind === "out") {
    removeAgentFromEveryFolder(companyId, agentId, null);
    return listAgentFolders(companyId);
  }
  const target = findAgentFolder(companyId, move.folderId);
  if (!target) return listAgentFolders(companyId);
  removeAgentFromEveryFolder(companyId, agentId, target.id);
  const ids = target.agentIds.includes(agentId)
    ? target.agentIds
    : [...target.agentIds, agentId];
  const ordered =
    typeof move.position === "number"
      ? insertAt(ids, agentId, move.position)
      : ids;
  reorderProjectAgents(target.id, ordered);
  return listAgentFolders(companyId);
}

/**
 * Reihenfolge der Agenten innerhalb eines Ordners ändern.
 */
export function reorderFolderAgents(
  companyId: string,
  folderId: string,
  orderedAgentIds: string[],
): AgentFolder | null {
  const folder = findAgentFolder(companyId, folderId);
  if (!folder) return null;
  const set = new Set(folder.agentIds);
  const ordered = orderedAgentIds.filter((id) => set.has(id));
  for (const id of folder.agentIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  reorderProjectAgents(folderId, ordered);
  return findAgentFolder(companyId, folderId);
}

/**
 * Agenten aus allen Ordnern entfernen — außer optional dem Zielordner.
 * Sorgt dafür, dass ein Agent in höchstens einem Ordner liegt.
 */
function removeAgentFromEveryFolder(
  companyId: string,
  agentId: string,
  keepFolderId: string | null,
): void {
  for (const project of listProjects(companyId)) {
    if (project.id === keepFolderId) continue;
    if (project.agentIds.includes(agentId)) {
      removeAgentsFromProject(project.id, [agentId]);
    }
  }
}

/** Id an Position `position` einfügen (nach dem Herausnehmen). */
function insertAt(ids: string[], id: string, position: number): string[] {
  const without = ids.filter((x) => x !== id);
  const at = Math.max(0, Math.min(position, without.length));
  without.splice(at, 0, id);
  return without;
}

/**
 * Ordner + Agenten aufteilen.
 *
 * Reine Funktion, damit sie ohne Browser getestet werden kann. Agenten, die in
 * keinem Ordner liegen, kommen unter `unfiled`; Agenten in Ordnern, die es
 * nicht mehr gibt, ebenfalls.
 */
export function partitionAgentsByFolder<T extends { id: string }>(
  agents: readonly T[],
  folders: readonly AgentFolder[],
): {
  folders: { folder: AgentFolder; agents: T[] }[];
  unfiled: T[];
} {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const assigned = new Set<string>();
  const result: { folder: AgentFolder; agents: T[] }[] = [];
  for (const folder of folders) {
    const list: T[] = [];
    for (const agentId of folder.agentIds) {
      assigned.add(agentId);
      const agent = byId.get(agentId);
      if (agent) list.push(agent);
    }
    result.push({ folder, agents: list });
  }
  const unfiled = agents.filter((a) => !assigned.has(a.id));
  return { folders: result, unfiled };
}

/**
 * Änderungen an den Ordnern (über den Projects-Store) beobachten.
 */
export function subscribeAgentFolders(cb: () => void): () => void {
  return subscribeProjects(cb);
}
