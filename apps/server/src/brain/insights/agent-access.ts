import { listAllMarkdown, readAgents } from "../store";
import { canRead, canWrite, fileRule, areaOf } from "../policy";
import { worldOf, toCore } from "../maps";
import { getRecentBrainAccess } from "./access-log";
import type { AgentAccessEntry, AgentFileAccessNode } from "./types";

export async function getAgentAccessDetails(
  root: string,
  agentSlugOrId: string,
): Promise<AgentAccessEntry> {
  const w = worldOf(root);
  const cfg = await readAgents(w.core);
  const allFiles = await listAllMarkdown(root);

  // Find target agent or default
  const agent = cfg.agents.find(
    (a) =>
      a.slug.toLowerCase() === agentSlugOrId.toLowerCase() ||
      a.connectAgentId === agentSlugOrId,
  ) ?? cfg.agents[0] ?? {
    slug: agentSlugOrId || "agent",
    name: agentSlugOrId || "Agent",
    read: cfg.defaults?.read ?? ["Kern", "Shared", "Projects"],
    write: cfg.defaults?.write ?? ["Memory:eigen", "Daily", "Inbox"],
  };

  // Build folder/file tree with permission badges
  const rootNode: AgentFileAccessNode = {
    path: "",
    name: "Brain / Vault",
    isFolder: true,
    read: true,
    write: false,
    ruleStatus: "default",
    children: [],
  };

  const folderMap = new Map<string, AgentFileAccessNode>();
  folderMap.set("", rootNode);

  let totalReadable = 0;
  let totalWritable = 0;

  // Process files
  for (const file of allFiles) {
    const corePath = toCore(w, file.path);
    const r = canRead(agent, corePath, cfg.projects);
    const wr = canWrite(agent, corePath, cfg.projects);
    const rule = fileRule(agent, corePath);

    if (r) totalReadable++;
    if (wr) totalWritable++;

    let ruleStatus: AgentFileAccessNode["ruleStatus"] = "area_inherited";
    if (rule) {
      if (rule.read === false || rule.write === false) {
        ruleStatus = "explicit_deny";
      } else {
        ruleStatus = "explicit_allow";
      }
    }

    const parts = file.path.split("/");
    let currentPath = "";

    // Ensure parent folders exist in tree
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!folderMap.has(currentPath)) {
        const folderCore = toCore(w, `${currentPath}/`);
        const folderRead = canRead(agent, folderCore, cfg.projects);
        const folderWrite = canWrite(agent, folderCore, cfg.projects);
        const folderRule = fileRule(agent, folderCore);

        const folderNode: AgentFileAccessNode = {
          path: currentPath,
          name: part,
          isFolder: true,
          read: folderRead,
          write: folderWrite,
          ruleStatus: folderRule ? "explicit_allow" : "area_inherited",
          children: [],
        };

        folderMap.set(currentPath, folderNode);
        const parent = folderMap.get(parentPath);
        if (parent) {
          parent.children = parent.children ?? [];
          parent.children.push(folderNode);
        }
      }
    }

    // Add file node
    const parent = folderMap.get(currentPath) ?? rootNode;
    const fileNode: AgentFileAccessNode = {
      path: file.path,
      name: parts[parts.length - 1],
      isFolder: false,
      read: r,
      write: wr,
      ruleStatus,
    };

    parent.children = parent.children ?? [];
    parent.children.push(fileNode);
  }

  // Determine areas list with permissions
  const areasList = cfg.areas.map((areaId) => {
    const isRead = agent.read.includes(areaId as any);
    const isWrite = agent.write.includes(areaId as any);
    return {
      id: areaId,
      name: areaId,
      read: isRead,
      write: isWrite,
    };
  });

  const recentAccess = getRecentBrainAccess(agent.slug, 30);
  const lastActive = recentAccess[0]?.timestamp;

  return {
    agentId: agent.slug,
    slug: agent.slug,
    name: agent.name || agent.slug,
    kind: agent.kind,
    connectAgentId: agent.connectAgentId,
    note: agent.note,
    areas: areasList,
    tree: rootNode.children ?? [],
    recentAccess,
    stats: {
      totalReadable,
      totalWritable,
      totalFiles: allFiles.length,
      lastActive,
    },
  };
}

export async function listAllAgentsAccess(root: string): Promise<
  {
    slug: string;
    name: string;
    connectAgentId?: string;
    readAreasCount: number;
    writeAreasCount: number;
    customRulesCount: number;
  }[]
> {
  const w = worldOf(root);
  const cfg = await readAgents(w.core).catch(() => ({ agents: [], areas: [], projects: [] }));

  return (cfg.agents ?? []).map((a) => ({
    slug: a.slug,
    name: a.name || a.slug,
    connectAgentId: a.connectAgentId,
    readAreasCount: a.read.length,
    writeAreasCount: a.write.length,
    customRulesCount: a.files?.length ?? 0,
  }));
}
