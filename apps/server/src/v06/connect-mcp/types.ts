/**
 * Type-Definitionen für Connect-MCP (v06 / Wave 2 / A18).
 *
 * Beachtet Verträge aus `apps/server/src/contracts/v06/connect-mcp.ts`.
 */

import type { SwarmScope, SwarmGrant } from "../../contracts/v06/connect-mcp";

export type { SwarmScope, SwarmGrant };

// TODO-CONTRACT: SwarmGrant im zentralen Contract v06 um revokedAt und updatedAt ergänzen
export interface SwarmGrantWithMeta extends SwarmGrant {
  revokedAt?: string | null;
  updatedAt?: string;
}

export interface McpTokenRecord {
  id: string;
  principal: string;
  tokenHash: string;
  label: string;
  lifetime: "probe" | "permanent";
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpTokenCreated {
  id: string;
  principal: string;
  label: string;
  lifetime: "probe" | "permanent";
  plaintextToken: string;
  expiresAt: string | null;
  createdAt: string;
}

export type McpAuditStatus = "success" | "denied" | "error";

export interface McpAuditLogEntry {
  id: string;
  tokenId?: string | null;
  principal?: string | null;
  companyId?: string | null;
  toolName: string;
  paramsSummary?: string | null;
  status: McpAuditStatus;
  statusDetail?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface ConnectMcpAuthContext {
  principal: string;
  tokenId?: string;
  tokenHash?: string;
  grants: SwarmGrantWithMeta[];
  isLocal: boolean;
  isTunnel: boolean;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown> | null;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  RATE_LIMITED: -32000,
  FORBIDDEN: -32003,
} as const;

export interface ToolExecutionContext {
  auth: ConnectMcpAuthContext;
  companyId?: string;
  database?: any;
}
