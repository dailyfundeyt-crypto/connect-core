/**
 * Lane 10: Connect-MCP Grants & Access Control (Prompts 10.1 & 10.2).
 *
 * Verwaltet Berechtigungen und Tokens für Grok-Bot-Agenten & externe Systeme:
 * - Hyper:           swarm:hyper, app:open_qr
 * - Flux:            swarm:flux
 * - Connect Wartung: agents:health
 * - Analysis:        swarm:analysis
 * - CNT Code:        brain:write, skills:*, agents:subagents
 *
 * Inklusive Audit-Log (Migration 0091) für jeden MCP-Aufruf.
 */

import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import type { McpGrant } from "../contracts/api";

export type McpAuditStatus = "success" | "denied" | "error";

export type McpAuditLogRow = {
  id: string;
  grantId: string | null;
  agentName: string | null;
  tokenHash: string | null;
  toolName: string;
  paramsSummary: string | null;
  status: McpAuditStatus;
  statusDetail: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export const DEFAULT_GROK_AGENT_SCOPES: Record<string, string[]> = {
  Hyper: ["swarm:hyper", "app:open_qr"],
  Flux: ["swarm:flux"],
  "Connect Wartung": ["agents:health"],
  Analysis: ["swarm:analysis"],
  "CNT Code": ["brain:write", "skills:*", "agents:subagents"],
};

let tableReady: Promise<void> | null = null;

export function ensureMcpGrantsTables(database: Database): Promise<void> {
  tableReady ??= (async () => {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS mcp_grants (
        id text PRIMARY KEY,
        company_id text NOT NULL,
        agent_name text NOT NULL,
        token_hash text NOT NULL UNIQUE,
        scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
        expires_at timestamptz,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS mcp_grants_company_idx ON mcp_grants (company_id)
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS mcp_grants_agent_idx ON mcp_grants (agent_name)
    `);

    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS mcp_audit_log (
        id text PRIMARY KEY,
        grant_id text,
        agent_name text,
        token_hash text,
        tool_name text NOT NULL,
        params_summary text,
        status text NOT NULL CHECK (status IN ('success', 'denied', 'error')),
        status_detail text,
        ip_address text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS mcp_audit_log_created_idx ON mcp_audit_log (created_at DESC)
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS mcp_audit_log_grant_idx ON mcp_audit_log (grant_id)
    `);
  })().catch((err) => {
    tableReady = null;
    throw err;
  });
  return tableReady;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("base64url");
}

export function generateGrantToken(): { plaintext: string; hash: string } {
  // cpt_ Prefix für Connect Partner Token
  const randomPart = randomBytes(24).toString("base64url");
  const plaintext = `cpt_${randomPart}`;
  const hash = hashToken(plaintext);
  return { plaintext, hash };
}

// In-Memory-Fallback für lokale Tests & Hochverfügbarkeit
const inMemoryGrants = new Map<string, McpGrant>();
const inMemoryAuditLogs: McpAuditLogRow[] = [];

export async function createMcpGrant(
  database: Database | undefined,
  params: {
    companyId: string;
    agentName: string;
    scopes?: string[];
    expiresAt?: string | null;
  },
): Promise<{ grant: McpGrant; plaintextToken: string }> {
  const { plaintext, hash } = generateGrantToken();
  const id = `grant_${randomBytes(12).toString("hex")}`;
  const now = new Date().toISOString();

  const scopes = params.scopes && params.scopes.length > 0
    ? params.scopes
    : DEFAULT_GROK_AGENT_SCOPES[params.agentName] || ["swarm:general"];

  const grant: McpGrant = {
    id,
    companyId: params.companyId,
    agentName: params.agentName,
    tokenHash: hash,
    scopes,
    expiresAt: params.expiresAt ?? undefined,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  inMemoryGrants.set(id, grant);
  inMemoryGrants.set(hash, grant);

  if (database) {
    try {
      await ensureMcpGrantsTables(database);
      await database.execute(sql`
        INSERT INTO mcp_grants (id, company_id, agent_name, token_hash, scopes, expires_at, is_active, created_at, updated_at)
        VALUES (
          ${id},
          ${params.companyId},
          ${params.agentName},
          ${hash},
          ${JSON.stringify(scopes)}::jsonb,
          ${params.expiresAt ? new Date(params.expiresAt) : null},
          true,
          NOW(),
          NOW()
        )
      `);
    } catch (err) {
      console.warn("[McpGrants] DB Insert fallback to in-memory:", err);
    }
  }

  return { grant, plaintextToken: plaintext };
}

export async function listMcpGrants(
  database: Database | undefined,
  companyId?: string,
): Promise<McpGrant[]> {
  if (database) {
    try {
      await ensureMcpGrantsTables(database);
      const res = await database.execute(sql`
        SELECT id, company_id, agent_name, token_hash, scopes, expires_at, is_active, created_at, updated_at
        FROM mcp_grants
        ${companyId ? sql`WHERE company_id = ${companyId}` : sql``}
        ORDER BY created_at DESC
      `);
      if (Array.isArray(res)) {
        return (res as any[]).map((r) => ({
          id: r.id,
          companyId: r.company_id,
          agentName: r.agent_name,
          tokenHash: r.token_hash,
          scopes: Array.isArray(r.scopes) ? r.scopes : (typeof r.scopes === "string" ? JSON.parse(r.scopes) : []),
          expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : undefined,
          isActive: Boolean(r.is_active),
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        }));
      }
    } catch (err) {
      console.warn("[McpGrants] DB List fallback to in-memory:", err);
    }
  }

  const list = Array.from(inMemoryGrants.values()).filter(
    (g, idx, arr) => arr.findIndex((x) => x.id === g.id) === idx,
  );
  if (companyId) {
    return list.filter((g) => g.companyId === companyId);
  }
  return list;
}

export async function resolveMcpGrantByToken(
  database: Database | undefined,
  token: string,
): Promise<McpGrant | null> {
  const hash = hashToken(token);
  const mem = inMemoryGrants.get(hash);
  if (mem && mem.isActive) {
    if (!mem.expiresAt || new Date(mem.expiresAt) > new Date()) {
      return mem;
    }
  }

  if (database) {
    try {
      await ensureMcpGrantsTables(database);
      const res = await database.execute(sql`
        SELECT id, company_id, agent_name, token_hash, scopes, expires_at, is_active, created_at, updated_at
        FROM mcp_grants
        WHERE token_hash = ${hash} AND is_active = true
        LIMIT 1
      `);
      if (Array.isArray(res) && res.length > 0) {
        const r: any = res[0];
        if (r.expires_at && new Date(r.expires_at) <= new Date()) {
          return null; // abgelaufen
        }
        const grant: McpGrant = {
          id: r.id,
          companyId: r.company_id,
          agentName: r.agent_name,
          tokenHash: r.token_hash,
          scopes: Array.isArray(r.scopes) ? r.scopes : (typeof r.scopes === "string" ? JSON.parse(r.scopes) : []),
          expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : undefined,
          isActive: Boolean(r.is_active),
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        };
        inMemoryGrants.set(grant.id, grant);
        inMemoryGrants.set(hash, grant);
        return grant;
      }
    } catch (err) {
      console.warn("[McpGrants] DB resolve error:", err);
    }
  }

  return null;
}

export async function deleteMcpGrant(
  database: Database | undefined,
  id: string,
): Promise<boolean> {
  inMemoryGrants.delete(id);
  if (database) {
    try {
      await ensureMcpGrantsTables(database);
      await database.execute(sql`
        UPDATE mcp_grants SET is_active = false, updated_at = NOW() WHERE id = ${id}
      `);
      return true;
    } catch (err) {
      console.warn("[McpGrants] DB Delete error:", err);
    }
  }
  return true;
}

/**
 * Überprüft, ob ein Grant den erforderlichen Scope besitzt.
 * Unterstützt Wildcards:
 *  - "*" gewährt alles
 *  - "swarm:*" gewährt alle swarm:-Scopes
 *  - "skills:*" gewährt alle skills:-Scopes
 */
export function checkGrantScope(
  grant: McpGrant | null | undefined,
  requiredScope: string,
): { allowed: boolean; reason?: string } {
  if (!grant) {
    return { allowed: false, reason: "Kein gültiger MCP-Grant angegeben." };
  }
  if (!grant.isActive) {
    return { allowed: false, reason: "Dieser MCP-Grant ist deaktiviert." };
  }
  if (grant.expiresAt && new Date(grant.expiresAt) <= new Date()) {
    return { allowed: false, reason: "Dieser MCP-Grant ist abgelaufen." };
  }

  const scopes = grant.scopes || [];
  if (scopes.includes("*")) {
    return { allowed: true };
  }
  if (scopes.includes(requiredScope)) {
    return { allowed: true };
  }

  const [category] = requiredScope.split(":");
  if (category && scopes.includes(`${category}:*`)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `403 Forbidden: Agent "${grant.agentName}" hat keine Berechtigung für Scope "${requiredScope}". Vorhandene Berechtigungen: ${scopes.join(", ") || "keine"}.`,
  };
}

export async function recordMcpAuditLog(
  database: Database | undefined,
  entry: {
    grantId?: string | null;
    agentName?: string | null;
    tokenHash?: string | null;
    toolName: string;
    paramsSummary?: string | null;
    status: McpAuditStatus;
    statusDetail?: string | null;
    ipAddress?: string | null;
  },
): Promise<void> {
  const row: McpAuditLogRow = {
    id: `audit_${randomBytes(12).toString("hex")}`,
    grantId: entry.grantId ?? null,
    agentName: entry.agentName ?? null,
    tokenHash: entry.tokenHash ?? null,
    toolName: entry.toolName,
    paramsSummary: entry.paramsSummary ?? null,
    status: entry.status,
    statusDetail: entry.statusDetail ?? null,
    ipAddress: entry.ipAddress ?? null,
    createdAt: new Date().toISOString(),
  };

  inMemoryAuditLogs.unshift(row);
  if (inMemoryAuditLogs.length > 500) {
    inMemoryAuditLogs.pop();
  }

  if (database) {
    try {
      await ensureMcpGrantsTables(database);
      await database.execute(sql`
        INSERT INTO mcp_audit_log (id, grant_id, agent_name, token_hash, tool_name, params_summary, status, status_detail, ip_address, created_at)
        VALUES (
          ${row.id},
          ${row.grantId},
          ${row.agentName},
          ${row.tokenHash},
          ${row.toolName},
          ${row.paramsSummary},
          ${row.status},
          ${row.statusDetail},
          ${row.ipAddress},
          NOW()
        )
      `);
    } catch (err) {
      // Ignoriere DB-Audit-Fehler um den Request nicht zu blockieren
    }
  }
}

export async function listMcpAuditLogs(
  database: Database | undefined,
  limit = 50,
): Promise<McpAuditLogRow[]> {
  if (database) {
    try {
      await ensureMcpGrantsTables(database);
      const res = await database.execute(sql`
        SELECT id, grant_id, agent_name, token_hash, tool_name, params_summary, status, status_detail, ip_address, created_at
        FROM mcp_audit_log
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);
      if (Array.isArray(res)) {
        return (res as any[]).map((r) => ({
          id: r.id,
          grantId: r.grant_id,
          agentName: r.agent_name,
          tokenHash: r.token_hash,
          toolName: r.tool_name,
          paramsSummary: r.params_summary,
          status: r.status,
          statusDetail: r.status_detail,
          ipAddress: r.ip_address,
          createdAt: new Date(r.created_at).toISOString(),
        }));
      }
    } catch (err) {
      // Fallback in-memory
    }
  }
  return inMemoryAuditLogs.slice(0, limit);
}

/**
 * Initialisiert die standardmäßigen 5 Grok-Bot-Agenten (Hyper, Flux, Connect Wartung, Analysis, CNT Code)
 */
export async function seedDefaultGrokGrants(
  database: Database | undefined,
  companyId = "default-company",
): Promise<Record<string, { grant: McpGrant; plaintextToken: string }>> {
  const seeded: Record<string, { grant: McpGrant; plaintextToken: string }> = {};
  const existing = await listMcpGrants(database, companyId);

  for (const [agentName, scopes] of Object.entries(DEFAULT_GROK_AGENT_SCOPES)) {
    const found = existing.find((g) => g.agentName === agentName);
    if (!found) {
      const res = await createMcpGrant(database, {
        companyId,
        agentName,
        scopes,
      });
      seeded[agentName] = res;
    }
  }
  return seeded;
}
