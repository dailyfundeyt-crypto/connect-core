import { IconArrowsMaximize, IconFocusCentered, IconMinus, IconPlus, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { agentListQueryOptions } from "@/lib/agents/queries";
import {
  type BrainAgents,
  type BrainGraph as BrainGraphData,
  brainAgentsQueryOptions,
  brainGraphQueryOptions,
  connectAgentSlug,
  findBrainEntry,
} from "@/lib/brain/queries";
import { cn } from "@/lib/utils";

/*
 * Die lokale Brain-Datenansicht. Ein Barnes-Hut-Kraftmodell hält auch größere Obsidian-Vaults
 * bedienbar; Notizen bleiben einzeln anklickbar, Ordner und Firmen-Tools bilden die Hubs.
 */

const PALETTE: Record<string, string> = {
  Kern: "#e8e8f0",
  Shared: "#5eb0ff",
  Projects: "#c9a76a",
  Daily: "#7ee0a1",
  Inbox: "#ff7aa8",
  Skills: "#c69bff",
  Vorlagen: "#8a8f9c",
  Vault: "#7d8597",
  Fehlt: "#3d424f",
  Agent: "#ff6b5c",
};
// One colour per project/company; Connect (the parent company) always gold.
const PROJECT_COLORS = ["#79b9b1", "#c9a977", "#8eacc8", "#c58fa1", "#8eb29c", "#a895c6", "#cb938a", "#cdbb83", "#83b9c4", "#b9a7cc", "#7eaf93", "#d0a5a5"];
const AGENT_COLORS = ["#d39a8e", "#91a9cf", "#b29dcc", "#82b19a", "#c9aa75", "#78b5b7", "#c38fa6", "#b1b57c"];

function colorFor(node: { group: string; project?: string }, projectIndex: Map<string, number>) {
  if (node.project) {
    if (node.project === "connect") return "#d3b37a";
    if (!projectIndex.has(node.project)) projectIndex.set(node.project, projectIndex.size);
    return PROJECT_COLORS[projectIndex.get(node.project)! % PROJECT_COLORS.length];
  }
  if (PALETTE[node.group]) return PALETTE[node.group];
  const group = node.group.toLocaleLowerCase("de");
  if (group.includes("inbox")) return PALETTE.Inbox;
  if (group.includes("daily") || group.includes("tagebuch")) return PALETTE.Daily;
  if (group.includes("spec") || group.includes("regel") || group.includes("skills")) return "#78b5b7";
  if (group.includes("wiki") || group.includes("knowledge") || group.includes("wissen")) return "#b29dcc";
  if (group.includes("alt") || group.includes("vault") || group.includes("personal") || group.includes("privat")) return "#c9aa75";
  if (group.includes("business") || group.includes("unternehmen")) return "#c38fa6";
  if (group.includes("community")) return "#82b19a";
  if (group.includes("content")) return "#d39a8e";
  if (group.includes("kern") || group.includes("core")) return PALETTE.Kern;
  if (node.group.startsWith("Memory/")) return "#81e6d9";
  return "#a0a6b4";
}

type SimNode = {
  id: string;
  label: string;
  kind: string;
  group: string;
  project?: string;
  path?: string;
  accessLabels: string[];
  accessColor?: string;
  selectedAccess?: "read" | "write";
  hub: boolean;
  r: number;
  color: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  fixed?: boolean;
};
type SimEdge = { a: SimNode; b: SimNode; kind: string };
type BrainLayout = "cloud" | "globe" | "ring" | "layers" | "wheel";
type BrainGrouping = "departments" | "folders";
type GraphSection = { label: string; color: string; x: number; y: number };

type GraphSourceNode = BrainGraphData["nodes"][number] | {
  id: string;
  label: string;
  kind: "folder";
  group: string;
  project?: string;
  path?: string;
  degree: number;
  hub: boolean;
};

function withConnectAgentNodes(
  data: BrainGraphData,
  config: BrainAgents | undefined,
  connectAgents: Array<{ id: string; name: string }> | undefined,
): BrainGraphData {
  if (!data.available || !config?.available || !connectAgents?.length) return data;
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));

  for (const agent of connectAgents) {
    if (findBrainEntry(config.agents, agent)) continue;
    const slug = connectAgentSlug(agent.name);
    const agentId = "agent:" + slug;
    if (nodes.has(agentId)) continue;
    nodes.set(agentId, { id: agentId, label: agent.name, kind: "agent", group: "Agent", degree: 0, hub: false });
  }
  return { ...data, nodes: [...nodes.values()] };
}

function agentColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AGENT_COLORS[hash % AGENT_COLORS.length];
}

function withStructureFolders(data: BrainGraphData, rootLabel: string) {
  const nodes: GraphSourceNode[] = data.nodes.filter((node) => node.kind !== "agent" && (node.kind !== "area" || node.group === "Tool"));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = data.edges.filter((edge) => {
    if (edge.kind === "link") return true;
    if (edge.kind !== "area") return false;
    return byId.get(edge.source)?.group === "Tool" || byId.get(edge.target)?.group === "Tool";
  });
  const seen = new Set(edges.map((edge) => `${edge.source}\0${edge.target}\0${edge.kind}`));
  const addEdge = (source: string, target: string) => {
    const key = `${source}\0${target}\0area`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, kind: "area" });
  };
  const rootId = "folder:root";
  const folders = new Map<string, GraphSourceNode>([[rootId, {
    id: rootId,
    label: rootLabel || "Brain",
    kind: "folder",
    group: "Root",
    path: "",
    degree: 0,
    hub: true,
  }]]);
  for (const note of nodes) {
    if (!note.path || (note.kind !== "note" && note.kind !== "vault")) continue;
    const parts = note.path.split("/");
    let parent = rootId;
    for (let index = 0; index < parts.length - 1; index++) {
      const path = parts.slice(0, index + 1).join("/");
      const id = `folder:${path}`;
      if (!folders.has(id)) {
        folders.set(id, {
          id,
          label: parts[index],
          kind: "folder",
          group: "Folder",
          project: note.project,
          path,
          degree: 0,
          hub: true,
        });
      } else if (folders.get(id)?.project !== note.project) {
        folders.get(id)!.project = undefined;
      }
      addEdge(parent, id);
      parent = id;
    }
    addEdge(parent, note.id);
    // A configured company/project hub also points to its matching vault folder.
    if (note.project) {
      const toolId = `project:${note.project}`;
      const firstVaultFolder = note.path.startsWith("Vault/") && parts.length > 2 ? `folder:${parts.slice(0, 2).join("/")}` : parent;
      if (byId.has(toolId)) addEdge(toolId, firstVaultFolder);
    }
  }
  return { nodes: [...nodes, ...folders.values()], edges };
}

function accessByNode(data: BrainGraphData) {
  const agents = data.nodes.filter((node) => node.kind === "agent");
  const access = new Map<string, Map<string, "read" | "write">>();
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  for (const agent of agents) {
    const scopes = new Map(data.edges.filter((edge) => edge.source === agent.id && (edge.kind === "read" || edge.kind === "write")).map((edge) => [edge.target, edge.kind as "read" | "write"]));
    for (const edge of data.edges) {
      if (edge.kind !== "area" || !scopes.has(edge.source)) continue;
      const target = byId.get(edge.target);
      if (!target || (target.kind !== "note" && target.kind !== "vault")) continue;
      const role = target.kind === "vault" ? "read" : scopes.get(edge.source)!;
      const names = access.get(target.id) ?? new Map<string, "read" | "write">();
      if (role === "write" || !names.has(agent.label)) names.set(agent.label, role);
      access.set(target.id, names);
    }
  }
  return access;
}

function placeStructureLayout(nodes: SimNode[], layout: BrainLayout, grouping: BrainGrouping, spacing: number, selectedAgent: string): GraphSection[] {
  const files = nodes.filter((node) => node.kind === "note" || node.kind === "vault" || node.kind === "missing");
  const rawGroupFor = (node: SimNode) => {
    if (grouping === "departments") return node.group || "Kern";
    const parts = (node.path ?? "").split("/").filter(Boolean);
    return parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0] || node.group || "Kern";
  };
  const counts = new Map<string, number>();
  for (const node of files) counts.set(rawGroupFor(node), (counts.get(rawGroupFor(node)) ?? 0) + 1);
  const allGroups = [...counts.keys()].sort((a, b) => a.localeCompare(b, "de"));
  const maxGroups = grouping === "folders" ? 15 : 11;
  const keptGroups = allGroups.length > maxGroups
    ? new Set([...allGroups].sort((a, b) => counts.get(b)! - counts.get(a)!).slice(0, maxGroups))
    : new Set(allGroups);
  const groupFor = (node: SimNode) => {
    const raw = rawGroupFor(node);
    return keptGroups.has(raw) ? raw : grouping === "folders" ? "Weitere Ordner" : "Weitere Bereiche";
  };
  const groups = [...new Set(files.map(groupFor))].sort((a, b) => a.localeCompare(b, "de"));
  if (!groups.length) return [];
  const members = new Map(groups.map((group) => [group, files.filter((node) => groupFor(node) === group)]));
  const sections: GraphSection[] = [];
  const groupIndex = new Map(groups.map((group, index) => [group, index]));
  const hashDepth = (id: string) => {
    let hash = 2166136261;
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return ((hash >>> 0) / 0xffffffff - 0.5) * 120;
  };

  if (layout === "layers") {
    const slots = 14;
    const xStep = 18 * spacing;
    const yStep = 17 * spacing;
    const gap = 42 * spacing;
    const columnWidth = (slots - 1) * xStep;
    const stride = columnWidth + gap;
    const rowCounts = groups.map((group) => Math.ceil(members.get(group)!.length / slots));
    const maxRows = Math.max(...rowCounts, 1);
    const topY = -((maxRows - 1) / 2) * yStep;
    groups.forEach((group, groupNumber) => {
      const list = members.get(group)!;
      const groupRows = rowCounts[groupNumber];
      const centerX = (groupNumber - (groups.length - 1) / 2) * stride;
      list.forEach((node, index) => {
        const column = index % slots;
        const row = Math.floor(index / slots);
        node.x = centerX + (column - (slots - 1) / 2) * xStep;
        node.y = topY + row * yStep;
        node.z = hashDepth(node.id) * 0.24;
      });
      sections.push({ label: group, color: list[0]?.color ?? "#9aa3b2", x: centerX, y: topY + groupRows * yStep + 36 * spacing });
    });

    const groupPosition = (path: string | undefined, project?: string) => {
      const needle = project ? nodes.find((node) => node.id === `project:${project}`)?.label : undefined;
      const exact = needle && groupIndex.has(needle) ? needle : undefined;
      const parts = (path ?? "").split("/").filter(Boolean);
      const candidate = grouping === "folders" ? parts.slice(0, 2).join("/") : parts[0] || "Kern";
      const key = exact ?? (groupIndex.has(candidate) ? candidate : groups.find((group) => group.startsWith(candidate) || candidate.startsWith(group)));
      return key ? groups[groupIndex.get(key)!] : groups[0];
    };
    const commonBottom = ((maxRows - 1) / 2) * yStep;
    for (const folder of nodes.filter((node) => node.kind === "folder")) {
      if (folder.id === "folder:root") {
        folder.x = 0;
        folder.y = commonBottom + 105 * spacing;
        folder.z = 0;
        continue;
      }
      const group = groupPosition(folder.path, folder.project);
      const index = groupIndex.get(group) ?? 0;
      const centerX = (index - (groups.length - 1) / 2) * stride;
      const depth = Math.max(1, (folder.path ?? "").split("/").length);
      folder.x = centerX + hashDepth(folder.id) * 0.15;
      folder.y = topY - depth * 20 * spacing;
      folder.z = hashDepth(folder.id) * 0.12;
    }
    const companyFolders = nodes.filter((node) => node.kind === "area" && node.group === "Tool");
    companyFolders.forEach((node, index) => {
      node.x = (index - (companyFolders.length - 1) / 2) * Math.min(130, 18 * groups.length);
      node.y = commonBottom + 175 * spacing;
      node.z = 0;
    });
    if (companyFolders.length) sections.push({ label: "Firmenordner", color: "#d3b37a", x: 0, y: commonBottom + 218 * spacing });
    return sections;
  }

  if (layout === "wheel") {
    const angleStep = (Math.PI * 2) / groups.length;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const centerAgent = nodes.find((node) => node.kind === "agent" && node.id === selectedAgent);
    if (centerAgent) {
      centerAgent.x = 0;
      centerAgent.y = 0;
      centerAgent.z = 0;
    }
    groups.forEach((group, groupNumber) => {
      const list = members.get(group)!;
      const angle = -Math.PI / 2 + groupNumber * angleStep;
      const sectorWidth = angleStep * 0.9;
      list.forEach((node, index) => {
        const radialRatio = Math.sqrt((index + 0.5) / list.length);
        const angularRatio = (((index * goldenAngle) % (Math.PI * 2)) / (Math.PI * 2)) - 0.5;
        const theta = angle + angularRatio * sectorWidth;
        const radius = (112 + radialRatio * 405) * spacing;
        node.x = Math.cos(theta) * radius;
        node.y = Math.sin(theta) * radius;
        node.z = hashDepth(node.id) * 0.08;
      });
      sections.push({
        label: group,
        color: list[0]?.color ?? "#9aa3b2",
        x: Math.cos(angle) * 566 * spacing,
        y: Math.sin(angle) * 566 * spacing,
      });
    });
    const scopes = nodes.filter((node) => node.kind === "area" && node.group !== "Tool");
    scopes.forEach((node, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(scopes.length, 1)) * Math.PI * 2;
      node.x = Math.cos(angle) * 78 * spacing;
      node.y = Math.sin(angle) * 78 * spacing;
      node.z = 0;
    });
    const tools = nodes.filter((node) => node.kind === "area" && node.group === "Tool");
    tools.forEach((node, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(tools.length, 1)) * Math.PI * 2;
      node.x = Math.cos(angle) * 638 * spacing;
      node.y = Math.sin(angle) * 638 * spacing;
      node.z = 0;
    });
    return sections;
  }

  if (layout === "ring") {
    const gap = (Math.PI * 2) / groups.length;
    groups.forEach((group, groupNumber) => {
      const list = members.get(group)!;
      const angle = -Math.PI / 2 + groupNumber * gap;
      const spread = gap * 0.82;
      list.forEach((node, index) => {
        const ratio = (index + 0.5) / list.length;
        const theta = angle + (ratio - 0.5) * spread;
        const radius = (95 + Math.sqrt(ratio) * 440) * spacing;
        node.x = Math.cos(theta) * radius;
        node.y = Math.sin(theta) * radius;
        node.z = hashDepth(node.id) * 0.24;
      });
      sections.push({ label: group, color: list[0]?.color ?? "#9aa3b2", x: Math.cos(angle) * 575 * spacing, y: Math.sin(angle) * 575 * spacing });
    });
    nodes.filter((node) => node.kind === "folder").forEach((node) => {
      if (node.id === "folder:root") { node.x = 0; node.y = 0; node.z = 0; return; }
      const group = groupPositionForFolder(node, groups, groupFor);
      const index = Math.max(0, groups.indexOf(group));
      const theta = -Math.PI / 2 + index * gap + hashDepth(node.id) * 0.0008;
      const radius = (70 + (node.path ?? "").split("/").length * 18) * spacing;
      node.x = Math.cos(theta) * radius;
      node.y = Math.sin(theta) * radius;
      node.z = hashDepth(node.id) * 0.12;
    });
    nodes.filter((node) => node.kind === "area" && node.group === "Tool").forEach((node, index, list) => {
      const theta = -Math.PI / 2 + (index / Math.max(list.length, 1)) * Math.PI * 2;
      node.x = Math.cos(theta) * 640 * spacing;
      node.y = Math.sin(theta) * 640 * spacing;
      node.z = 0;
    });
    return sections;
  }

  if (layout === "globe") {
    const golden = Math.PI * (3 - Math.sqrt(5));
    groups.forEach((group, groupNumber) => {
      const list = members.get(group)!;
      const longitude = (groupNumber / groups.length) * Math.PI * 2;
      const longitudeSpan = (Math.PI * 2 / groups.length) * 0.9;
      list.forEach((node, index) => {
        const latitude = Math.acos(1 - 2 * ((index + 0.5) / list.length));
        const theta = longitude + (((index * golden) % (Math.PI * 2)) / (Math.PI * 2) - 0.5) * longitudeSpan;
        const radius = 490 * spacing;
        node.x = Math.sin(latitude) * Math.cos(theta) * radius;
        node.y = Math.cos(latitude) * radius;
        node.z = Math.sin(latitude) * Math.sin(theta) * radius;
      });
      sections.push({ label: group, color: list[0]?.color ?? "#9aa3b2", x: Math.cos(longitude) * 550 * spacing, y: -Math.sin(longitude) * 550 * spacing });
    });
    nodes.filter((node) => node.kind === "folder").forEach((node) => {
      if (node.id === "folder:root") { node.x = 0; node.y = 0; node.z = 0; return; }
      const group = groupPositionForFolder(node, groups, groupFor);
      const index = Math.max(0, groups.indexOf(group));
      const theta = (index / groups.length) * Math.PI * 2;
      node.x = Math.cos(theta) * 105 * spacing;
      node.y = 0;
      node.z = Math.sin(theta) * 105 * spacing;
    });
    nodes.filter((node) => node.kind === "area" && node.group === "Tool").forEach((node, index, list) => {
      const theta = (index / Math.max(list.length, 1)) * Math.PI * 2;
      node.x = Math.cos(theta) * 620 * spacing;
      node.y = 0;
      node.z = Math.sin(theta) * 620 * spacing;
    });
  }
  return sections;
}

function groupPositionForFolder(folder: SimNode, groups: string[], groupFor: (node: SimNode) => string) {
  const parts = (folder.path ?? "").split("/").filter(Boolean);
  const key = parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0] || folder.group;
  return groups.find((group) => group === key || group.startsWith(key) || key.startsWith(group)) ?? groups[0] ?? groupFor(folder);
}

function buildSim(data: BrainGraphData, showMissing: boolean, project: string, mode: "access" | "structure", selectedAgent: string, rootLabel: string, layout: BrainLayout, grouping: BrainGrouping, spacing: number) {
  const projectIndex = new Map<string, number>();
  // Stable colours: index by project order of first appearance in a sorted list.
  for (const id of [...new Set(data.nodes.map((n) => n.project).filter(Boolean) as string[])].sort()) {
    if (id !== "connect") projectIndex.set(id, projectIndex.size);
  }
  const access = accessByNode(data);
  const source = mode === "structure" ? withStructureFolders(data, rootLabel) : { nodes: data.nodes, edges: data.edges };
  let keep = source.nodes.filter((n) => showMissing || n.kind !== "missing");
  let sourceEdges = source.edges;
  if (mode === "access") {
    const scopes = new Set(sourceEdges.filter((edge) => edge.kind === "read" || edge.kind === "write").map((edge) => edge.target));
    const reachable = new Set(scopes);
    for (const edge of sourceEdges) {
      if (edge.kind === "area" && scopes.has(edge.source)) reachable.add(edge.target);
    }
    const hasReachableNotes = source.nodes.some((node) =>
      reachable.has(node.id) && (node.kind === "note" || node.kind === "vault")
    );
    // Some agents only have default scopes and therefore no explicit graph edges yet.
    if (hasReachableNotes) {
      keep = keep.filter((node) => node.kind === "agent" || node.group === "Tool" || reachable.has(node.id));
    }
  }
  if (mode === "access" && selectedAgent) {
    const scopes = new Set(sourceEdges
      .filter((edge) => edge.source === selectedAgent && (edge.kind === "read" || edge.kind === "write"))
      .map((edge) => edge.target));
    const visible = new Set([selectedAgent, ...scopes]);
    for (const edge of sourceEdges) {
      if (edge.kind === "area" && scopes.has(edge.source)) visible.add(edge.target);
    }
    keep = keep.filter((node) => visible.has(node.id));
  }
  if (mode === "structure" && layout === "wheel") {
    keep = keep.filter((node) => node.kind !== "folder" && (node.kind !== "agent" || node.id === selectedAgent));
  }
  if (project) {
    // The project's notes, plus everything directly linked to them (context), nothing else.
    const own = new Set(keep.filter((n) => n.project === project).map((n) => n.id));
    const near = new Set(own);
    for (const e of sourceEdges) {
      if (e.kind !== "link" && !(e.kind === "read" || e.kind === "write")) continue;
      if (own.has(e.source)) near.add(e.target);
      if (own.has(e.target)) near.add(e.source);
    }
    keep = keep.filter((n) => near.has(n.id));
  }
  const ids = new Set(keep.map((n) => n.id));
  const agentOptions = new Map(data.nodes.filter((node) => node.kind === "agent").map((node) => [node.id, node]));
  const selectedAgentLabel = agentOptions.get(selectedAgent)?.label;
  const nodes: SimNode[] = keep.map((n, i) => {
    const angle = i * 2.399963; // Goldener Winkel: gleichmäßiger Start ohne Zufall.
    const radius = 12 * Math.sqrt(i + 1);
    const r = mode === "structure"
      ? n.kind === "agent" ? 9
        : n.kind === "folder" ? (n.id === "folder:root" ? 7 : 2.8)
          : n.kind === "area" ? 5
            : n.kind === "missing" ? 1.4
              : Math.min(2.4 + Math.sqrt(n.degree) * 0.45 + (n.hub ? 1.2 : 0), 6)
      : n.kind === "agent" ? 9 : n.kind === "area" || n.kind === "folder" ? 8 : n.kind === "missing" ? 2 : Math.min(3 + Math.sqrt(n.degree) * 1.6 + (n.hub ? 3 : 0), 15);
    const accessNames = [...(access.get(n.id) ?? new Map()).entries()];
    const selectedColor = selectedAgent ? agentColor(selectedAgent) : undefined;
    const selectedAccess = selectedAgentLabel ? access.get(n.id)?.get(selectedAgentLabel) : undefined;
    return {
      ...n,
      accessLabels: accessNames.map(([name, role]) => `${name} · ${role === "write" ? "lesen/schreiben" : "lesen"}`),
      accessColor: selectedAgent && selectedAccess ? selectedColor : accessNames.length > 1 ? "#d9dce4" : accessNames[0] ? agentColor([...agentOptions.entries()].find(([, agent]) => agent.label === accessNames[0][0])?.[0] ?? "") : selectedColor,
      selectedAccess,
      r: mode === "structure" && layout === "wheel" && n.kind === "agent" ? 24 : r,
      color: n.kind === "agent" ? agentColor(n.id) : colorFor(n, projectIndex),
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      z: mode === "structure" ? (() => {
        let hash = 2166136261;
        for (const char of n.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
        return ((hash >>> 0) / 0xffffffff - 0.5) * 520;
      })() : 0,
      vx: 0,
      vy: 0,
    };
  });
  const sections = mode === "structure" ? placeStructureLayout(nodes, layout, grouping, spacing, selectedAgent) : [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: SimEdge[] = sourceEdges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ a: byId.get(e.source)!, b: byId.get(e.target)!, kind: e.kind }));
  const neighbours = new Map<string, Set<string>>();
  for (const e of edges) {
    (neighbours.get(e.a.id) ?? neighbours.set(e.a.id, new Set()).get(e.a.id)!).add(e.b.id);
    (neighbours.get(e.b.id) ?? neighbours.set(e.b.id, new Set()).get(e.b.id)!).add(e.a.id);
  }
  const groups = [...new Set(nodes.filter((n) => n.kind !== "area" && n.kind !== "folder").map((n) => n.group))];
  const legend = groups
    .map((group) => {
      const node = nodes.find((n) => n.group === group)!;
      return { group, project: node.project, color: node.color };
    })
    .sort((a, b) => (a.project === "connect" ? -1 : b.project === "connect" ? 1 : 0) || (a.project ? 0 : 1) - (b.project ? 0 : 1) || a.group.localeCompare(b.group, "de"));
  return { nodes, edges, neighbours, legend, sections };
}

function step(nodes: SimNode[], edges: SimEdge[], alpha: number) {
  type Quad = { x0: number; y0: number; x1: number; y1: number; mass: number; cx: number; cy: number; items?: SimNode[]; children?: (Quad | null)[] };
  // Keep the total repulsion nearly constant as the vault grows. A fixed 2,600
  // charge expands a 2k-note graph so far that fit-to-view makes every dot tiny.
  const charge = Math.min(120, Math.max(8, 640 / Math.sqrt(Math.max(nodes.length, 1))));
  const buildQuad = (items: SimNode[], x0: number, y0: number, x1: number, y1: number, depth = 0): Quad | null => {
    if (!items.length) return null;
    let cx = 0;
    let cy = 0;
    for (const node of items) {
      cx += node.x;
      cy += node.y;
    }
    cx /= items.length;
    cy /= items.length;
    const quad: Quad = { x0, y0, x1, y1, mass: items.length, cx, cy };
    if (items.length < 2 || depth >= 18 || Math.max(x1 - x0, y1 - y0) < 0.5) {
      quad.items = items;
      return quad;
    }
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const buckets: SimNode[][] = [[], [], [], []];
    for (const node of items) buckets[(node.x >= mx ? 1 : 0) + (node.y >= my ? 2 : 0)].push(node);
    quad.children = [
      buildQuad(buckets[0], x0, y0, mx, my, depth + 1),
      buildQuad(buckets[1], mx, y0, x1, my, depth + 1),
      buildQuad(buckets[2], x0, my, mx, y1, depth + 1),
      buildQuad(buckets[3], mx, my, x1, y1, depth + 1),
    ];
    return quad;
  };
  const minX = Math.min(...nodes.map((node) => node.x)) - 1;
  const minY = Math.min(...nodes.map((node) => node.y)) - 1;
  const maxX = Math.max(...nodes.map((node) => node.x)) + 1;
  const maxY = Math.max(...nodes.map((node) => node.y)) + 1;
  const root = buildQuad(nodes, minX, minY, maxX, maxY);
  const repel = (node: SimNode, quad: Quad) => {
    const width = Math.max(quad.x1 - quad.x0, quad.y1 - quad.y0);
    const contains = node.x >= quad.x0 && node.x < quad.x1 && node.y >= quad.y0 && node.y < quad.y1;
    const dx = quad.cx - node.x;
    const dy = quad.cy - node.y;
    const d2 = dx * dx + dy * dy;
    if (quad.items) {
      for (const other of quad.items) {
        if (other === node) continue;
        const ox = other.x - node.x;
        const oy = other.y - node.y;
        const distance2 = ox * ox + oy * oy;
        if (distance2 < 640_000) {
          const distance = Math.sqrt(Math.max(distance2, 0.01));
          const force = ((node.kind === "missing" || other.kind === "missing" ? charge * 0.55 : charge) * alpha) / Math.max(distance2, 0.01);
          node.vx -= (ox / distance) * force;
          node.vy -= (oy / distance) * force;
        }
      }
      return;
    }
    if (!contains && d2 > 0.01 && width / Math.sqrt(d2) < 0.72) {
      if (d2 < 640_000) {
        const distance = Math.sqrt(d2);
        const force = ((node.kind === "missing" ? charge * 0.55 : charge) * alpha * quad.mass) / d2;
        node.vx -= (dx / distance) * force;
        node.vy -= (dy / distance) * force;
      }
      return;
    }
    for (const child of quad.children ?? []) if (child) repel(node, child);
  };
  if (root) for (const node of nodes) repel(node, root);
  for (const e of edges) {
    // Note-to-note links are context, not the folder/access layout; keep them out of the overview forces.
    if (e.kind === "link") continue;
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const rest = e.kind === "area" ? 80 : e.kind === "link" ? (e.a.kind === "missing" || e.b.kind === "missing" ? 38 : 72) : 120;
    const k = (e.kind === "area" ? 0.012 : 0.05) * alpha;
    const f = (d - rest) * k;
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    e.a.vx += fx;
    e.a.vy += fy;
    e.b.vx -= fx;
    e.b.vy -= fy;
  }
  for (const node of nodes) {
    node.vx -= node.x * 0.006 * alpha;
    node.vy -= node.y * 0.006 * alpha;
    if (node.fixed) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= 0.6;
    node.vy *= 0.6;
    const speed = Math.hypot(node.vx, node.vy);
    if (!Number.isFinite(speed) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      node.x = 0;
      node.y = 0;
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    if (speed > 24) {
      node.vx = (node.vx / speed) * 24;
      node.vy = (node.vy / speed) * 24;
    }
    node.x = Math.max(-10_000, Math.min(10_000, node.x + node.vx));
    node.y = Math.max(-10_000, Math.min(10_000, node.y + node.vy));
  }
}

export function BrainGraph({
  selected,
  onOpen,
  className,
  rootLabel = "Brain",
  fullPage = false,
}: {
  selected?: string;
  onOpen: (path: string) => void;
  className?: string;
  rootLabel?: string;
  fullPage?: boolean;
}) {
  const [mode, setMode] = useState<"access" | "structure">("access");
  const [threeD, setThreeD] = useState(false);
  const [layout, setLayout] = useState<BrainLayout>("layers");
  const [grouping, setGrouping] = useState<BrainGrouping>("departments");
  const [showFileNames, setShowFileNames] = useState(false);
  const [showHubNames, setShowHubNames] = useState(true);
  const [nodeSize, setNodeSize] = useState(1);
  const [spacing, setSpacing] = useState(1);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [showMissing, setShowMissing] = useState(false);
  const [project, setProject] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [showFileMatches, setShowFileMatches] = useState(false);
  const [searchFocusId, setSearchFocusId] = useState<string | null>(null);
  const [tall, setTall] = useState(false);
  const navigate = useNavigate();
  const graph = useQuery(brainGraphQueryOptions(true));
  const brainAgents = useQuery(brainAgentsQueryOptions());
  const connectAgents = useQuery(agentListQueryOptions());
  const graphData = useMemo(
    () => graph.data ? withConnectAgentNodes(graph.data, brainAgents.data, connectAgents.data) : undefined,
    [graph.data, brainAgents.data, connectAgents.data],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of graphData?.nodes ?? []) if (n.project && !seen.has(n.project)) seen.set(n.project, n.group);
    for (const n of graphData?.nodes ?? []) if (n.id.startsWith("project:") && n.project) seen.set(n.project, n.label);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (a.id === "connect" ? -1 : b.id === "connect" ? 1 : a.name.localeCompare(b.name, "de")));
  }, [graph.data]);
  const agentOptions = useMemo(
    () => (graphData?.nodes ?? []).filter((node) => node.kind === "agent").map((node) => ({ id: node.id, name: node.label })).sort((a, b) => a.name.localeCompare(b.name, "de")),
    [graphData],
  );
  const selectedAgentSlug = selectedAgent.startsWith("agent:") ? selectedAgent.slice("agent:".length) : "";
  const selectedBrainEntry = brainAgents.data?.agents.find((entry) => entry.slug === selectedAgentSlug);
  const selectedConnectAgent = selectedBrainEntry?.connectAgentId
    ? connectAgents.data?.find((agent) => agent.id === selectedBrainEntry.connectAgentId)
    : connectAgents.data?.find((agent) => connectAgentSlug(agent.name) === selectedAgentSlug);
  const [hover, setHover] = useState<{ label: string; sub: string; x: number; y: number } | null>(null);
  const sim = useMemo(
    () => (graphData?.available ? buildSim(graphData, showMissing, project, mode, selectedAgent, rootLabel, mode === "structure" ? layout : "cloud", grouping, spacing) : null),
    [graphData, showMissing, project, mode, selectedAgent, rootLabel, layout, grouping, spacing],
  );
  const use3D = mode === "structure" && threeD;
  const fileMatches = useMemo(() => {
    const query = fileQuery.trim().toLocaleLowerCase("de");
    if (!query || mode !== "structure") return [];
    return (sim?.nodes ?? [])
      .filter((node) => (node.kind === "note" || node.kind === "vault") && `${node.label} ${node.path ?? ""}`.toLocaleLowerCase("de").includes(query))
      .sort((a, b) => (a.path ?? a.label).localeCompare(b.path ?? b.label, "de"))
      .slice(0, 6);
  }, [fileQuery, mode, sim]);
  const focusedFile = searchFocusId ? sim?.nodes.find((node) => node.id === searchFocusId && (node.kind === "note" || node.kind === "vault")) : undefined;
  const view = useRef({ x: 0, y: 0, k: 1, yaw: 0.38, pitch: -0.22 });
  const alpha = useRef(1);
  const hoverId = useRef<string | null>(null);
  const searchFocusRef = useRef(searchFocusId);
  searchFocusRef.current = searchFocusId;
  const displayRef = useRef({ showFileNames, showHubNames, nodeSize });
  displayRef.current = { showFileNames, showHubNames, nodeSize };
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const controls = useRef<{ zoom: (factor: number) => void; fit: () => void; focus: (id: string) => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !sim) return;
    const ctx = canvas.getContext("2d")!;
    let width = 0;
    let height = 0;
    let frame = 0;
    let warm = 0;
    const forceLayout = mode === "access" || layout === "cloud";
    view.current = { x: 0, y: 0, k: 1, yaw: use3D ? 0.38 : 0, pitch: use3D ? -0.22 : 0 };
    alpha.current = forceLayout ? 1 : 0;
    // Kurzes Vorlayout, bevor die erste Ansicht erscheint.
    if (forceLayout) while (warm++ < 24) step(sim.nodes, sim.edges, Math.max(alpha.current *= 0.97, 0.2));

    const projectNode = (node: SimNode) => {
      if (!use3D) return { x: node.x, y: node.y, depth: 0, scale: 1 };
      const { yaw, pitch } = view.current;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const rotatedX = node.x * cy - node.z * sy;
      const rotatedZ = node.x * sy + node.z * cy;
      const rotatedY = node.y * cp - rotatedZ * sp;
      const depth = node.y * sp + rotatedZ * cp;
      const scale = Math.max(0.62, Math.min(1.65, 1100 / (1100 - depth)));
      return { x: rotatedX * scale, y: rotatedY * scale, depth, scale };
    };
    const fit = () => {
      if (!sim.nodes.length || !width) return;
      const positions = sim.nodes.map(projectNode);
      const sectionPositions = use3D ? [] : sim.sections;
      const xs = [...positions.map((p) => p.x), ...sectionPositions.map((section) => section.x)];
      const ys = [...positions.map((p) => p.y), ...sectionPositions.map((section) => section.y)];
      // Keep room for the canvas labels as well as the node centers. This is
      // especially important for the Brain/root label under tall layer groups.
      const w = Math.max(...xs) - Math.min(...xs) + 240;
      const h = Math.max(...ys) - Math.min(...ys) + 240;
      const k = Math.min(width / w, height / h, 2.2);
      const radialWheel = mode === "structure" && layout === "wheel";
      const centerX = radialWheel ? 0 : (Math.max(...xs) + Math.min(...xs)) / 2;
      const centerY = radialWheel ? 0 : (Math.max(...ys) + Math.min(...ys)) / 2;
      view.current = { ...view.current, k, x: width / 2 - centerX * k, y: height / 2 - centerY * k };
    };
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();
    fit();

    const toWorld = (sx: number, sy: number) => ({ x: (sx - view.current.x) / view.current.k, y: (sy - view.current.y) / view.current.k });
    const nodeAt = (sx: number, sy: number) => {
      const p = toWorld(sx, sy);
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const node of sim.nodes) {
        const projected = projectNode(node);
        const d = Math.hypot(projected.x - p.x, projected.y - p.y) * view.current.k;
        const hit = Math.max(node.r * projected.scale * view.current.k + 3, 8);
        if (d < hit && d < bestD) {
          best = node;
          bestD = d;
        }
      }
      return best;
    };

    let touched = false;
    let refitted = false;
    const draw = () => {
      if (forceLayout && alpha.current > 0.004) {
        step(sim.nodes, sim.edges, alpha.current);
        alpha.current *= 0.99;
        // Once settled, frame the graph again unless the user has already zoomed or panned.
        if (!refitted && alpha.current < 0.08) {
          refitted = true;
          if (!touched) fit();
        }
      }
      const { x, y, k } = view.current;
      ctx.fillStyle = "#0e0f13";
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      const focus = hoverId.current ?? searchFocusRef.current;
      const near = focus ? sim.neighbours.get(focus) : null;
      const display = displayRef.current;
      const positions = new Map(sim.nodes.map((node) => [node.id, projectNode(node)]));
      const visibleFileCount = sim.nodes.reduce((count, node) => {
        if (node.kind !== "note" && node.kind !== "vault") return count;
        if (mode === "structure" && layout === "wheel" && selectedAgent && !node.selectedAccess) return count;
        const p = positions.get(node.id)!;
        const sx = x + p.x * k;
        const sy = y + p.y * k;
        return count + (sx >= 0 && sx <= width && sy >= 0 && sy <= height ? 1 : 0);
      }, 0);
      const renderNodes = use3D
        ? [...sim.nodes].sort((a, b) => positions.get(a.id)!.depth - positions.get(b.id)!.depth)
        : sim.nodes;
      if (mode === "structure" && layout === "layers" && display.showHubNames && !use3D) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const section of sim.sections) {
          ctx.fillStyle = section.color;
          ctx.globalAlpha = 0.92;
          ctx.font = `600 ${Math.max(10 / k, 3)}px Inter Variable, sans-serif`;
          let shortName = section.label;
          const maxLabelWidth = 18 * 14 * spacing * 0.9;
          while (shortName.length > 5 && ctx.measureText(shortName).width > maxLabelWidth) shortName = `${shortName.slice(0, -2)}…`;
          ctx.fillText(shortName, section.x, section.y);
        }
        ctx.globalAlpha = 1;
        ctx.textBaseline = "alphabetic";
      }
      if (mode === "structure" && layout === "wheel" && display.showHubNames && !use3D) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const section of sim.sections) {
          ctx.fillStyle = section.color;
          ctx.globalAlpha = 0.94;
          ctx.font = `600 ${Math.max(10 / k, 3)}px Inter Variable, sans-serif`;
          let shortName = section.label;
          const maxLabelWidth = 18 * 14 * spacing * 0.9;
          while (shortName.length > 5 && ctx.measureText(shortName).width > maxLabelWidth) shortName = `${shortName.slice(0, -2)}…`;
          ctx.fillText(shortName, section.x, section.y);
        }
        ctx.globalAlpha = 1;
        ctx.textBaseline = "alphabetic";
      }
      // Edge strokes and node dots have a CSS-pixel minimum so the overview
      // remains legible even when a large vault needs a very small fit scale.
      ctx.lineWidth = Math.max(0.85 / k, 0.25);
      for (const e of sim.edges) {
        const lit = focus && (e.a.id === focus || e.b.id === focus);
        if (mode === "structure" && layout !== "cloud" && !lit) continue;
        if (e.kind === "link" && !lit && (mode === "access" || k < 1.5 || (mode === "structure" && !!focus))) continue;
        const a = positions.get(e.a.id)!;
        const b = positions.get(e.b.id)!;
        const agent = e.a.kind === "agent" ? e.a : e.b.kind === "agent" ? e.b : null;
        const hub = e.a.group === "Tool" ? e.a : e.b.group === "Tool" ? e.b : null;
        const baseAlpha = e.kind === "write" ? 0.68 : e.kind === "read" ? 0.4 : e.kind === "area" ? 0.12 : 0.1;
        ctx.globalAlpha = focus && !lit ? baseAlpha * 0.12 : baseAlpha;
        ctx.strokeStyle = lit
          ? "rgba(205,215,255,0.96)"
          : e.kind === "write"
            ? agent?.color ?? hub?.color ?? "#ff6b5c"
            : e.kind === "read"
              ? agent?.color ?? hub?.color ?? "#ff6b5c"
              : e.kind === "area"
                ? hub?.color ?? "#818a9a"
                : "#9aa3b2";
        if (e.kind === "read") ctx.setLineDash([5 / k, 4 / k]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (e.kind === "read") ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      for (const node of renderNodes) {
        const p = positions.get(node.id)!;
        const dimForAgent = mode === "structure" && layout === "wheel" && !!selectedAgent &&
          (node.kind === "note" || node.kind === "vault") && !node.selectedAccess;
        const dim = focus ? node.id !== focus && !near?.has(node.id) : dimForAgent;
        const minimumPixels = mode === "structure"
          ? node.kind === "folder" ? 2.2 : node.kind === "missing" ? 1 : 0.9
          : node.kind === "agent" ? 5.2 : node.kind === "area" || node.kind === "folder" ? 4 : node.kind === "missing" ? 1.8 : node.hub ? 3.2 : 2.2;
        const radius = Math.max(node.r * p.scale * display.nodeSize, minimumPixels / (k * p.scale));
        ctx.globalAlpha = dim ? 0.18 : 1;
        ctx.beginPath();
        if (node.kind === "area" || node.kind === "folder") {
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1.4 / k;
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = "#0e0f13";
          ctx.fill();
          ctx.stroke();
        } else if (node.kind === "agent" && mode === "structure" && layout === "wheel") {
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 18 / k;
          ctx.fillStyle = "#12141a";
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 2 / k;
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.fillStyle = node.color;
          ctx.arc(p.x, p.y, Math.max(3 / k, radius * 0.2), 0, Math.PI * 2);
          ctx.fill();
        } else if (node.kind === "agent") {
          ctx.fillStyle = node.color;
          ctx.moveTo(p.x, p.y - radius);
          ctx.lineTo(p.x + radius, p.y);
          ctx.lineTo(p.x, p.y + radius);
          ctx.lineTo(p.x - radius, p.y);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = node.color;
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        const hasHighlightedAgentAccess = mode === "structure" && layout === "wheel" ? !!node.selectedAccess : node.accessLabels.length > 0;
        if (hasHighlightedAgentAccess && node.kind !== "agent" && node.kind !== "area" && node.kind !== "folder") {
          ctx.strokeStyle = node.accessColor ?? "#d9dce4";
          ctx.globalAlpha = dim ? 0.12 : 0.46;
          ctx.lineWidth = 1.2 / k;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius + 1.2 / k, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = dim ? 0.18 : 1;
        }
        if (node.path && node.path === selectedRef.current) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5 / k;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius + 3 / k, 0, Math.PI * 2);
          ctx.stroke();
        }
        const fileLabelsReady = display.showFileNames && k > 1.8 && visibleFileCount <= 80;
        const label =
          node.id === focus ||
          (fileLabelsReady && (node.kind === "note" || node.kind === "vault")) ||
          (!!near?.has(node.id) && node.kind !== "note" && node.kind !== "vault") ||
          (mode === "access" && node.kind === "agent") ||
          (node.kind === "area" && mode === "access" && !!selectedAgent) ||
          (mode === "access" && node.group === "Tool") ||
          (mode === "structure" && layout !== "layers" && display.showHubNames && node.kind === "folder" && (node.id === "folder:root" && k > 0.9 || k > 1.35 && (!focus || !!near?.has(node.id)))) ||
          (mode === "structure" && layout !== "layers" && display.showHubNames && node.group === "Tool" && k > 1.35) ||
          (mode === "structure" && layout === "layers" && display.showHubNames && node.kind === "area" && node.group === "Tool") ||
          (mode === "structure" && layout === "layers" && display.showHubNames && node.id === "folder:root") ||
          (node.kind === "missing" && k > 2.2);
        if (label && !(dim && node.kind === "missing")) {
          ctx.globalAlpha = dim ? 0.15 : node.id === focus ? 1 : 0.8;
          ctx.fillStyle = node.kind === "missing" ? "#6b7180" : "#d9dce4";
          ctx.font = `${node.id === focus ? 600 : 400} ${Math.max(11 / (k * p.scale), 3)}px Inter Variable, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(node.label.length > 34 ? `${node.label.slice(0, 32)}…` : node.label, p.x, p.y + radius + 11 / (k * p.scale));
          if (mode === "structure" && node.accessLabels.length && node.kind !== "folder" && node.kind !== "area" && k > 2.4 && node.id === focus) {
            ctx.globalAlpha = 0.62;
            ctx.fillStyle = node.accessColor ?? "#d9dce4";
            ctx.font = `${Math.max(8 / k, 2)}px Inter Variable, sans-serif`;
            ctx.fillText(node.accessLabels.slice(0, 2).join(", "), p.x, p.y + radius + 22 / (k * p.scale));
          }
        }
        ctx.globalAlpha = 1;
      }
      if (mode === "structure" && layout === "wheel") {
        const centerAgent = sim.nodes.find((node) => node.kind === "agent" && node.id === selectedAgent);
        const center = centerAgent ? positions.get(centerAgent.id) : undefined;
        if (centerAgent && center) {
          ctx.globalAlpha = 1;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `600 ${Math.max(10 / k, 3)}px Inter Variable, sans-serif`;
          ctx.fillStyle = centerAgent.color;
          ctx.fillText("BOT", center.x, center.y - 38 / k);
          ctx.fillStyle = "#f2f3f7";
          ctx.font = `500 ${Math.max(11 / k, 3)}px Inter Variable, sans-serif`;
          ctx.fillText(centerAgent.label, center.x, center.y + 42 / k);
          ctx.textBaseline = "alphabetic";
        }
      }
      ctx.restore();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    let drag: { node: SimNode | null; sx: number; sy: number; vx: number; vy: number; yaw: number; pitch: number; moved: boolean; pan: boolean } | null = null;
    const local = (event: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { sx: event.clientX - rect.left, sy: event.clientY - rect.top };
    };
    const down = (event: PointerEvent) => {
      touched = true;
      const { sx, sy } = local(event);
      const node = nodeAt(sx, sy);
      drag = { node, sx, sy, vx: view.current.x, vy: view.current.y, yaw: view.current.yaw, pitch: view.current.pitch, moved: false, pan: event.shiftKey || !use3D };
      if (node) node.fixed = true;
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      const { sx, sy } = local(event);
      if (drag) {
        if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = true;
        if (drag.node) {
          const p = toWorld(sx, sy);
          if (use3D) {
            const old = projectNode(drag.node);
            const rx = p.x / old.scale;
            const ry = p.y / old.scale;
            const cp = Math.cos(view.current.pitch);
            const sp = Math.sin(view.current.pitch);
            const cy = Math.cos(view.current.yaw);
            const syaw = Math.sin(view.current.yaw);
            const rotatedY = ry * cp + old.depth * sp;
            const rotatedZ = -ry * sp + old.depth * cp;
            drag.node.x = rx * cy + rotatedZ * syaw;
            drag.node.y = rotatedY;
            drag.node.z = -rx * syaw + rotatedZ * cy;
          } else {
            drag.node.x = p.x;
            drag.node.y = p.y;
          }
          alpha.current = Math.max(alpha.current, 0.3);
        } else if (use3D && !drag.pan) {
          view.current.yaw = drag.yaw + (sx - drag.sx) * 0.008;
          view.current.pitch = Math.max(-1.42, Math.min(1.42, drag.pitch + (sy - drag.sy) * 0.008));
        } else {
          view.current.x = drag.vx + sx - drag.sx;
          view.current.y = drag.vy + sy - drag.sy;
        }
        return;
      }
      const node = nodeAt(sx, sy);
      hoverId.current = node?.id ?? null;
      canvas.style.cursor = node ? (node.kind === "note" || node.kind === "vault" ? "pointer" : "default") : use3D ? "grab" : "default";
      setHover(
        node
          ? {
              label: node.label,
              sub: node.path
                ? [node.project ? `${node.group} · ` : "", node.path, node.kind === "vault" ? "nur lesen" : "", node.accessLabels.length ? `Zugriff: ${node.accessLabels.join(", ")}` : "Kein Agentenzugriff eingetragen"].filter(Boolean).join(" · ")
                : node.kind === "missing"
                  ? "Notiz gibt es (noch) nicht"
                  : node.kind === "agent"
                    ? "Agent · Zugriff auf Bereiche und verbundene Firmenordner"
                    : node.kind === "folder"
                      ? `Ordner · ${node.path || rootLabel}`
                      : node.group === "Tool"
                        ? "Verbundener Firmenordner / Tool"
                        : "Brain-Bereich",
              x: sx,
              y: sy,
            }
          : null,
      );
    };
    const up = (event: PointerEvent) => {
      if (drag?.node) {
        drag.node.fixed = false;
        if (!drag.moved && drag.node.path && (drag.node.kind === "note" || drag.node.kind === "vault")) onOpenRef.current(drag.node.path);
      }
      drag = null;
      canvas.releasePointerCapture?.(event.pointerId);
    };
    const leave = () => {
      if (!drag) {
        hoverId.current = null;
        setHover(null);
      }
    };
    const zoomAt = (factor: number, sx: number, sy: number) => {
      const k = Math.min(Math.max(view.current.k * factor, 0.15), 6);
      const ratio = k / view.current.k;
      view.current = { ...view.current, k, x: sx - (sx - view.current.x) * ratio, y: sy - (sy - view.current.y) * ratio };
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      touched = true;
      const { sx, sy } = local(event);
      zoomAt(Math.exp(-event.deltaY * 0.0015), sx, sy);
    };
    const focus = (id: string) => {
      const node = sim.nodes.find((item) => item.id === id);
      if (!node) return;
      const p = projectNode(node);
      const k = Math.max(view.current.k, 2.3);
      view.current = { ...view.current, k, x: width / 2 - p.x * k, y: height / 2 - p.y * k };
      touched = true;
    };
    controls.current = { zoom: (f) => zoomAt(f, width / 2, height / 2), fit, focus };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [sim, mode, rootLabel, use3D]);

  useEffect(() => {
    if (searchFocusId) controls.current?.focus(searchFocusId);
  }, [sim, searchFocusId]);

  if (graph.isPending) return <Skeleton className={cn(fullPage ? "h-full w-full" : "h-[420px] w-full rounded-xl", className)} />;
  if (!graphData?.available || !sim) {
    return (
      <div className={cn("grid place-items-center text-center text-sm text-muted-foreground", fullPage ? "h-full w-full" : "rounded-xl border border-dashed px-4 py-8", className)}>
        Die lokalen Brain-Daten konnten für den Graphen nicht geladen werden. Prüfe den verbundenen Spark Brain Ordner.
      </div>
    );
  }
  const notes = sim.nodes.filter((n) => n.kind === "note" || n.kind === "vault").length;
  const accessibleNotes = sim.nodes.filter((n) => (n.kind === "note" || n.kind === "vault") && n.selectedAccess).length;
  const connections = mode === "access"
    ? sim.edges.filter((e) => e.kind !== "link").length
    : sim.edges.filter((e) => e.kind === "link").length;
  const connectionLabel = mode === "access" ? "Zugriffe" : "Notizlinks";
  const focusFile = (node: SimNode) => {
    setSearchFocusId(node.id);
    setFileQuery(node.label);
    setShowFileMatches(false);
    controls.current?.focus(node.id);
  };

  return (
    <div className={cn("overflow-hidden bg-[#0e0f13] text-[#d9dce4]", fullPage ? "flex h-full min-h-0 flex-col" : "rounded-xl border border-white/10", className)}>
      <div className="flex flex-col gap-2 border-b border-white/10 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div aria-label="Graphansicht" className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-1" role="group">
            <button
              aria-pressed={mode === "access"}
              className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors", mode === "access" ? "bg-white/15 text-white" : "text-white/55 hover:text-white")}
              onClick={() => setMode("access")}
              type="button"
            >
              Agentenzugriff
            </button>
            <button
              aria-pressed={mode === "structure"}
              className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors", mode === "structure" ? "bg-white/15 text-white" : "text-white/55 hover:text-white")}
              onClick={() => { setMode("structure"); setThreeD(layout === "globe"); }}
              type="button"
            >
              Datenstruktur
            </button>
          </div>
          <span className="text-xs text-white/45">
            {mode === "structure" && layout === "wheel" && selectedAgent
              ? `${notes} Notizen · ${accessibleNotes} mit Zugriff`
              : `${notes} Notizen · ${connections} ${connectionLabel}`}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {mode === "access" ? (
              <>
                <select
                  aria-label="Agent auswählen"
                  className="rounded-md border border-white/15 bg-[#16181e] px-2 py-1.5 text-xs text-white/85"
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  value={selectedAgent}
                >
                  <option value="">Alle Agenten</option>
                  {agentOptions.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
                {selectedConnectAgent ? (
                  <button
                    className="rounded-md border border-white/15 bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/[0.14]"
                    onClick={() => void navigate({ to: "/agents", search: { agent: selectedConnectAgent.id, tab: "mine", section: "brain" } })}
                    type="button"
                  >
                    Rechte verwalten
                  </button>
                ) : null}
              </>
            ) : null}
            {mode === "structure" && layout === "wheel" ? (
              <select
                aria-label="Bot auswählen"
                className="rounded-md border border-white/15 bg-[#16181e] px-2 py-1.5 text-xs text-white/85"
                onChange={(e) => setSelectedAgent(e.target.value)}
                value={selectedAgent}
              >
                <option value="">Bot auswählen …</option>
                {agentOptions.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            ) : null}
            <select
              aria-label="Projekt-Filter"
              className="rounded-md border border-white/15 bg-[#16181e] px-2 py-1.5 text-xs text-white/85"
              onChange={(e) => setProject(e.target.value)}
              value={project}
            >
              <option value="">Alle Firmenordner</option>
              {projectOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            {mode === "structure" ? (
              <>
                <div className="relative flex items-center gap-1.5">
                  <form
                    className="relative"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (fileMatches[0]) focusFile(fileMatches[0]);
                    }}
                  >
                    <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-white/40" />
                    <input
                      aria-label="Brain-Datei suchen"
                      className="w-44 rounded-md border border-white/15 bg-[#16181e] py-1.5 pr-2 pl-8 text-xs text-white/90 placeholder:text-white/40 focus:border-white/30 focus:outline-none"
                      onChange={(event) => { setFileQuery(event.target.value); setShowFileMatches(true); }}
                      onFocus={() => setShowFileMatches(true)}
                      placeholder="Datei suchen …"
                      value={fileQuery}
                    />
                  </form>
                  <button
                    aria-label={threeD ? "3D-Ansicht aktiv, zu 2D wechseln" : "Zu 3D-Ansicht wechseln"}
                    aria-pressed={threeD}
                    className={cn("rounded-md border px-2.5 py-1.5 text-xs font-medium", threeD ? "border-white/20 bg-white/15 text-white" : "border-white/10 text-white/55 hover:text-white")}
                    onClick={() => setThreeD((value) => !value)}
                    title={threeD ? "Zu 2D wechseln" : "3D drehen aktivieren"}
                    type="button"
                  >
                    {threeD ? "3D" : "2D"}
                  </button>
                  {fileQuery.trim() && showFileMatches ? (
                    <div className="absolute top-full right-0 z-30 mt-1 max-h-64 w-80 overflow-auto rounded-lg border border-white/10 bg-[#17191f] p-1 shadow-xl">
                      {fileMatches.length ? fileMatches.map((node) => (
                        <button
                          className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-white/[0.08]"
                          key={node.id}
                          onClick={() => focusFile(node)}
                          type="button"
                        >
                          <span className="block truncate text-xs text-white/90">{node.label}</span>
                          <span className="block truncate text-[10px] text-white/45">{node.path}</span>
                        </button>
                      )) : <p className="px-2 py-2 text-xs text-white/45">Keine passende Datei gefunden</p>}
                    </div>
                  ) : null}
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/70">
                  <input checked={showMissing} className="accent-[#7c8cff]" onChange={(e) => setShowMissing(e.target.checked)} type="checkbox" />
                  Fehlende Links
                </label>
              </>
            ) : null}
          </div>
        </div>
        {mode === "structure" ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] pt-2">
            <div aria-label="Graph-Layout" className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-1" role="group">
              {([
                ["cloud", "Cloud"],
                ["globe", "Globus"],
                ["ring", "Ring"],
                ["wheel", "Bot-Rad"],
                ["layers", "Ebenen"],
              ] as const).map(([id, label]) => (
                <button
                  aria-pressed={layout === id}
                  className={cn("rounded-md px-2 py-1 text-[11px] transition-colors", layout === id ? "bg-white/15 text-white" : "text-white/55 hover:text-white")}
                  key={id}
                  onClick={() => {
                    setLayout(id);
                    setThreeD(id === "globe");
                    setSearchFocusId(null);
                    if (id === "wheel" && !selectedAgent && agentOptions[0]) setSelectedAgent(agentOptions[0].id);
                  }}
                  type="button"
                >{label}</button>
              ))}
            </div>
            <div aria-label="Gruppierung" className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-1" role="group">
              {([["departments", "Abteilungen"], ["folders", "Ordner"]] as const).map(([id, label]) => (
                <button
                  aria-pressed={grouping === id}
                  className={cn("rounded-md px-2 py-1 text-[11px] transition-colors", grouping === id ? "bg-white/15 text-white" : "text-white/55 hover:text-white")}
                  key={id}
                  onClick={() => setGrouping(id)}
                  type="button"
                >{label}</button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-white/65">
              <input checked={showFileNames} className="accent-[#a9b1c4]" onChange={(event) => setShowFileNames(event.target.checked)} type="checkbox" />
              Dateinamen
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-white/65">
              <input checked={showHubNames} className="accent-[#a9b1c4]" onChange={(event) => setShowHubNames(event.target.checked)} type="checkbox" />
              Hub-Namen
            </label>
            <label className="flex items-center gap-2 text-[11px] text-white/55" title="Punktgröße anpassen">
              Punkt
              <input aria-label="Knotengröße" className="w-16 accent-[#a9b1c4]" max="1.8" min="0.6" onChange={(event) => setNodeSize(Number(event.target.value))} step="0.1" type="range" value={nodeSize} />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-white/55" title="Abstand zwischen Gruppen anpassen">
              Abstand
              <input aria-label="Gruppenabstand" className="w-16 accent-[#a9b1c4]" max="1.8" min="0.7" onChange={(event) => setSpacing(Number(event.target.value))} step="0.1" type="range" value={spacing} />
            </label>
          </div>
        ) : null}
        <p className="text-[11px] text-white/40">
          {mode === "access"
            ? "Agent → Bereiche → freigegebene Notizen"
            : layout === "wheel"
              ? "Bot-Rad · Helle Punkte = Zugriff · Ziehen zum Verschieben · Mausrad zum Zoomen"
              : threeD
                ? "3D-Graph · Ziehen zum Drehen · Shift + Ziehen zum Verschieben · Mausrad zum Zoomen"
                : "2D-Graph · Ziehen zum Verschieben · Mausrad zum Zoomen"}
        </p>
      </div>
      <div className={cn("relative", fullPage ? "min-h-0 flex-1" : tall ? "h-[680px]" : "h-[420px]")} ref={wrapRef}>
        <canvas aria-label="Brain-Graph" className="absolute inset-0 touch-none" ref={canvasRef} />
        {mode === "structure" && layout === "wheel" && selectedAgent ? (
          <div className="pointer-events-none absolute top-1/2 left-1/2 z-[2] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
            <span className="grid size-14 place-items-center rounded-full border-2 bg-[#111318] shadow-[0_0_28px_rgba(211,154,142,0.2)]" style={{ borderColor: agentColor(selectedAgent) }}>
              <span className="size-3 rounded-full" style={{ background: agentColor(selectedAgent), boxShadow: `0 0 14px ${agentColor(selectedAgent)}` }} />
            </span>
            <span className="rounded bg-[#0e0f13]/90 px-2 py-0.5 text-[10px] font-medium text-white/90">
              {agentOptions.find((agent) => agent.id === selectedAgent)?.name ?? "Bot"}
            </span>
          </div>
        ) : null}
        {!notes ? <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-white/50">Keine Notizen im verbundenen Brain-Ordner gefunden.</div> : null}
        {focusedFile ? (
          <div className="absolute top-3 left-3 z-10 max-w-[min(420px,70%)] rounded-lg border border-white/10 bg-[#17191f]/95 px-3 py-2 shadow-lg backdrop-blur">
            <div className="truncate text-sm font-medium text-white">{focusedFile.label}</div>
            <div className="mt-0.5 truncate text-xs text-white/55">{focusedFile.path}</div>
            <div className="mt-2 flex gap-2">
              <button className="rounded-md bg-white/10 px-2 py-1 text-xs text-white/85 hover:bg-white/15" onClick={() => focusedFile.path && onOpen(focusedFile.path)} type="button">Datei öffnen</button>
              <button className="rounded-md px-2 py-1 text-xs text-white/50 hover:text-white" onClick={() => setSearchFocusId(null)} type="button">Fokus lösen</button>
            </div>
          </div>
        ) : null}
        {hover ? (
          <div
            className="pointer-events-none absolute z-10 max-w-64 rounded-md border border-white/10 bg-black/80 px-2 py-1 text-xs shadow-lg backdrop-blur"
            style={{ left: Math.min(hover.x + 12, (wrapRef.current?.clientWidth ?? 400) - 220), top: hover.y + 12 }}
          >
            <div className="font-medium text-white">{hover.label}</div>
            <div className="truncate text-white/50">{hover.sub}</div>
          </div>
        ) : null}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {[
            { icon: IconPlus, title: "Hineinzoomen", run: () => controls.current?.zoom(1.3) },
            { icon: IconMinus, title: "Herauszoomen", run: () => controls.current?.zoom(1 / 1.3) },
            { icon: IconFocusCentered, title: "Alles zeigen", run: () => controls.current?.fit() },
            ...(!fullPage ? [{ icon: IconArrowsMaximize, title: tall ? "Kleiner" : "Größer", run: () => setTall((v) => !v) }] : []),
          ].map(({ icon: Icon, title, run }) => (
            <button
              className="rounded-md border border-white/10 bg-white/5 p-1 text-white/70 hover:bg-white/10 hover:text-white"
              key={title}
              onClick={run}
              title={title}
              type="button"
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
        <div className="absolute bottom-2 left-2 flex max-w-[85%] flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/55">
          {mode === "access" ? agentOptions.map((agent) => (
            <span className="pointer-events-none flex items-center gap-1" key={agent.id}>
              <span className="size-2 rounded-full" style={{ background: agentColor(agent.id) }} />
              {agent.name}
            </span>
          )) : null}
          {mode === "structure" && (layout === "layers" || layout === "wheel") ? null : sim.legend.map((item) =>
            item.project ? (
              <button
                className={cn("flex items-center gap-1 hover:text-white", project === item.project && "text-white")}
                key={item.group}
                onClick={() => setProject(project === item.project ? "" : item.project!)}
                title={project === item.project ? "Filter aufheben" : `Nur ${item.group} zeigen`}
                type="button"
              >
                <span className="size-2 rounded-full" style={{ background: item.color }} />
                {item.group}
              </button>
            ) : (
              <span className="pointer-events-none flex items-center gap-1" key={item.group}>
                <span className="size-2 rounded-full" style={{ background: item.color }} />
                {item.group === "Projects" ? "Projekte" : item.group}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
