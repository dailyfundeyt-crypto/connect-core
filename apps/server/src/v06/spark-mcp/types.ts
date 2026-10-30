import type { SparkMcpToolName, FolderContext } from "../../contracts/v06/spark-mcp";

export type { SparkMcpToolName, FolderContext };

export type BrowserFolderKind = "normal" | "settings";

export interface SparkNoteRecord {
  id: string;
  companyId: string;
  title: string;
  content: string;
  folderId: string | null;
  isTrashed: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentAuthContext {
  agentId: string;
  agentName: string;
  companyId: string;
  scopes: string[];
  isLocal: boolean;
  isTunnel: boolean;
}

export interface SparkFolderRecord {
  id: string;
  parentId: string | null;
  name: string;
  kind: BrowserFolderKind;
  ownerScope: string;
  instructionNoteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SparkLinkRecord {
  id: string;
  folderId: string;
  url: string;
  title: string;
  noteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface McpToolContext {
  agent: AgentAuthContext;
}
