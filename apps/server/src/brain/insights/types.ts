import type { BrainStructure, BrainStructureEdge, BrainStructureNode } from "../../contracts/api";

export interface DocInsight {
  path: string;
  title: string;
  snippet: string;
  keywords: string[];
  wordCount: number;
  mtime: string;
  areaId?: string;
  topicId?: string;
}

export interface TopicCluster {
  id: string;
  name: string;
  areaId: string;
  areaName: string;
  keywords: string[];
  docCount: number;
  score: number;
  topDocs: DocInsight[];
}

export interface AreaDepartment {
  id: string;
  name: string;
  description: string;
  color?: string;
  docCount: number;
  topics: TopicCluster[];
}

export interface BrainStructureStats {
  totalDocs: number;
  totalWords: number;
  totalTopics: number;
  totalAreas: number;
  activeAgentsCount: number;
  lastUpdated: string;
  topTopics: { name: string; count: number; score: number }[];
}

export interface ExtendedBrainStructure extends BrainStructure {
  stats: BrainStructureStats;
  areas: AreaDepartment[];
  topics: TopicCluster[];
}

export interface AgentAccessEntry {
  agentId: string;
  slug: string;
  name: string;
  kind?: string;
  connectAgentId?: string;
  note?: string;
  areas: {
    id: string;
    name: string;
    read: boolean;
    write: boolean;
  }[];
  tree: AgentFileAccessNode[];
  recentAccess: BrainAccessLogItem[];
  stats: {
    totalReadable: number;
    totalWritable: number;
    totalFiles: number;
    lastActive?: string;
  };
}

export interface AgentFileAccessNode {
  path: string;
  name: string;
  isFolder: boolean;
  read: boolean;
  write: boolean;
  ruleStatus: "explicit_allow" | "explicit_deny" | "area_inherited" | "default";
  children?: AgentFileAccessNode[];
}

export interface BrainAccessLogItem {
  id: string;
  agentId: string;
  action: "read" | "write" | "search" | "list";
  path: string;
  allowed: boolean;
  durationMs: number;
  timestamp: string;
}
