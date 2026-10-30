/**
 * Token-Verwaltung, Rate-Limiting & Audit-Log (v06 / Wave 2 / A18).
 *
 * Sicherheitsregeln:
 * 1. Tokens werden NIEMALS im Klartext gespeichert – nur als SHA-256-Hash.
 * 2. Plaintext wird nur ein einziges Mal bei der Erstellung zurückgegeben.
 * 3. Kein Logging von Token-Plaintexts in Logs oder Audit-Records.
 * 4. Token-Rotation möglich (altes Token widerrufen, neues erzeugen).
 * 5. Rate-Limit pro Token / Principal.
 * 6. Jede MCP-Aktion wird lückenlos auditiert.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import type {
  McpAuditLogEntry,
  McpAuditStatus,
  McpTokenCreated,
  McpTokenRecord,
} from "./types";

// ============================================================================
// In-Memory Speicher & Caches
// ============================================================================

const inMemoryTokens = new Map<string, McpTokenRecord>();
const inMemoryAuditLogs: McpAuditLogEntry[] = [];

// Rate-Limiting
type RateLimitRecord = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateLimitRecord>();
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000; // 1 Minute
const DEFAULT_RATE_LIMIT_MAX = 120; // 120 Anfragen / Minute

let tableInitPromise: Promise<void> | null = null;

export async function ensureMcpTokensTables(database: Database): Promise<void> {
  tableInitPromise ??= (async () => {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS mcp_tokens (
        id text PRIMARY KEY,
        principal text NOT NULL,
        token_hash text NOT NULL UNIQUE,
        label text NOT NULL,
        lifetime text NOT NULL DEFAULT 'permanent',
        expires_at timestamptz,
        last_used_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS mcp_tokens_token_hash_idx ON mcp_tokens (token_hash)
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS mcp_tokens_principal_idx ON mcp_tokens (principal)
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS mcp_tokens_revoked_at_idx ON mcp_tokens (revoked_at)
    `);

    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS mcp_audit_logs (
        id text PRIMARY KEY,
        token_id text,
        principal text,
        company_id text,
        tool_name text NOT NULL,
        params_summary text,
        status text NOT NULL CHECK (status IN ('success', 'denied', 'error')),
        status_detail text,
        ip_address text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS mcp_audit_logs_created_at_idx ON mcp_audit_logs (created_at DESC)
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS mcp_audit_logs_principal_idx ON mcp_audit_logs (principal)
    `);
  })().catch((err) => {
    tableInitPromise = null;
    throw err;
  });
  return tableInitPromise;
}

// ============================================================================
// Hashing & Generierung
// ============================================================================

export function hashToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("base64url");
}

export function generatePlaintextToken(): string {
  // cpt_ Prefix: Connect Partner Token
  const random = randomBytes(32).toString("base64url");
  return `cpt_${random}`;
}

// ============================================================================
// CRUD & Rotation
// ============================================================================

/**
 * Erstellt einen neuen MCP-Token. Gibt den Klartext-Token NUR EINMAL zurück!
 */
export async function createMcpToken(
  params: {
    principal: string;
    label: string;
    lifetime?: "probe" | "permanent";
    expiresAt?: string | null;
  },
  database?: Database,
): Promise<McpTokenCreated> {
  const plaintextToken = generatePlaintextToken();
  const tokenHash = hashToken(plaintextToken);
  const id = `token_${randomBytes(10).toString("hex")}`;
  const now = new Date().toISOString();

  const lifetime = params.lifetime || "permanent";
  const expiresAt =
    lifetime === "probe"
      ? new Date(Date.now() + 60_000).toISOString()
      : params.expiresAt || null;

  const record: McpTokenRecord = {
    id,
    principal: params.principal.trim(),
    tokenHash,
    label: params.label.trim(),
    lifetime,
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  inMemoryTokens.set(tokenHash, record);
  inMemoryTokens.set(id, record);

  if (database) {
    try {
      await ensureMcpTokensTables(database);
      await database.execute(sql`
        INSERT INTO mcp_tokens (id, principal, token_hash, label, lifetime, expires_at, last_used_at, revoked_at, created_at, updated_at)
        VALUES (
          ${record.id},
          ${record.principal},
          ${record.tokenHash},
          ${record.label},
          ${record.lifetime},
          ${record.expiresAt ? new Date(record.expiresAt) : null},
          null,
          null,
          ${new Date(record.createdAt)},
          ${new Date(record.updatedAt)}
        )
      `);
    } catch (err) {
      console.warn("[McpTokens] DB Insert fallback to in-memory:", err);
    }
  }

  return {
    id,
    principal: record.principal,
    label: record.label,
    lifetime: record.lifetime,
    plaintextToken,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  };
}

/**
 * Validiert ein Plaintext-Token und löst den zugehörigen TokenRecord auf.
 * Timing-sicherer Vergleich und Prüfung auf revoked_at / expires_at.
 */
export async function resolveMcpToken(
  plaintextToken: string,
  database?: Database,
): Promise<McpTokenRecord | null> {
  if (!plaintextToken || typeof plaintextToken !== "string") return null;
  const clean = plaintextToken.trim();
  if (clean.length < 16) return null;

  const tokenHash = hashToken(clean);
  const hashBuf = Buffer.from(tokenHash, "utf-8");

  // In-Memory Suche
  const mem = inMemoryTokens.get(tokenHash);
  if (mem) {
    const memBuf = Buffer.from(mem.tokenHash, "utf-8");
    if (hashBuf.length === memBuf.length && timingSafeEqual(hashBuf, memBuf)) {
      if (mem.revokedAt) return null;
      if (mem.expiresAt && new Date(mem.expiresAt) <= new Date()) return null;
      mem.lastUsedAt = new Date().toISOString();
      return mem;
    }
  }

  if (database) {
    try {
      await ensureMcpTokensTables(database);
      const res = await database.execute(sql`
        SELECT id, principal, token_hash, label, lifetime, expires_at, last_used_at, revoked_at, created_at, updated_at
        FROM mcp_tokens
        WHERE token_hash = ${tokenHash}
        LIMIT 1
      `);

      if (Array.isArray(res) && res.length > 0) {
        const r: any = res[0];
        const dbHash = String(r.token_hash);
        const dbBuf = Buffer.from(dbHash, "utf-8");

        if (hashBuf.length === dbBuf.length && timingSafeEqual(hashBuf, dbBuf)) {
          if (r.revoked_at) return null;
          if (r.expires_at && new Date(r.expires_at) <= new Date()) return null;

          const record: McpTokenRecord = {
            id: String(r.id),
            principal: String(r.principal),
            tokenHash: dbHash,
            label: String(r.label),
            lifetime: (r.lifetime as "probe" | "permanent") || "permanent",
            expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
            lastUsedAt: new Date().toISOString(),
            revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
          };

          inMemoryTokens.set(tokenHash, record);
          inMemoryTokens.set(record.id, record);

          // Letzte Verwendung asynchron aktualisieren
          void database
            .execute(sql`UPDATE mcp_tokens SET last_used_at = NOW() WHERE id = ${record.id}`)
            .catch(() => {});

          return record;
        }
      }
    } catch (err) {
      console.warn("[McpTokens] DB resolve error:", err);
    }
  }

  return null;
}

/**
 * Rotiert einen Token: Widerruft den alten Token und erzeugt einen neuen für denselben Principal.
 */
export async function rotateMcpToken(
  oldTokenId: string,
  database?: Database,
): Promise<McpTokenCreated | null> {
  const old = inMemoryTokens.get(oldTokenId);
  if (!old) return null;

  // Altes Token widerrufen
  await revokeMcpToken(oldTokenId, database);

  // Neues Token mit denselben Parametern erstellen
  return createMcpToken(
    {
      principal: old.principal,
      label: `${old.label} (Rotiert am ${new Date().toLocaleDateString("de-DE")})`,
      lifetime: old.lifetime,
    },
    database,
  );
}

/**
 * Widerruft einen Token sofort (Soft-Delete über revoked_at).
 */
export async function revokeMcpToken(
  tokenId: string,
  database?: Database,
): Promise<boolean> {
  const token = inMemoryTokens.get(tokenId);
  const now = new Date().toISOString();

  if (token) {
    token.revokedAt = now;
    token.updatedAt = now;
  }

  if (database) {
    try {
      await ensureMcpTokensTables(database);
      await database.execute(sql`
        UPDATE mcp_tokens
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE id = ${tokenId}
      `);
      return true;
    } catch (err) {
      console.warn("[McpTokens] DB Revoke error:", err);
    }
  }

  return Boolean(token);
}

/**
 * Listet Tokens auf (Klartext ist darin NIEMALS enthalten).
 */
export async function listMcpTokens(
  principal?: string,
  database?: Database,
): Promise<McpTokenRecord[]> {
  if (database) {
    try {
      await ensureMcpTokensTables(database);
      const res = await database.execute(sql`
        SELECT id, principal, token_hash, label, lifetime, expires_at, last_used_at, revoked_at, created_at, updated_at
        FROM mcp_tokens
        ORDER BY created_at DESC
      `);

      if (Array.isArray(res)) {
        for (const r of res as any[]) {
          const record: McpTokenRecord = {
            id: String(r.id),
            principal: String(r.principal),
            tokenHash: String(r.token_hash),
            label: String(r.label),
            lifetime: (r.lifetime as "probe" | "permanent") || "permanent",
            expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
            lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
            revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
          };
          inMemoryTokens.set(record.id, record);
          inMemoryTokens.set(record.tokenHash, record);
        }
      }
    } catch (err) {
      console.warn("[McpTokens] DB list fallback to in-memory:", err);
    }
  }

  let list = Array.from(new Set(inMemoryTokens.values()));
  if (principal) {
    list = list.filter((t) => t.principal.toLowerCase() === principal.toLowerCase());
  }
  return list;
}

// ============================================================================
// Rate-Limiting
// ============================================================================

export function checkTokenRateLimit(
  tokenOrHash: string,
  maxRequests = Number(process.env.CONNECT_MCP_RATE_LIMIT) || DEFAULT_RATE_LIMIT_MAX,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const key = tokenOrHash.length > 40 ? tokenOrHash.slice(0, 40) : tokenOrHash;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterSeconds: 0 };
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, retryAfterSeconds: 0 };
}

export function resetRateLimitsForTests(): void {
  rateLimitMap.clear();
}

// ============================================================================
// Audit-Logging
// ============================================================================

export async function recordMcpAuditLog(
  entry: {
    tokenId?: string | null;
    principal?: string | null;
    companyId?: string | null;
    toolName: string;
    paramsSummary?: string | null;
    status: McpAuditStatus;
    statusDetail?: string | null;
    ipAddress?: string | null;
  },
  database?: Database,
): Promise<McpAuditLogEntry> {
  const row: McpAuditLogEntry = {
    id: `audit_${randomBytes(10).toString("hex")}`,
    tokenId: entry.tokenId ?? null,
    principal: entry.principal ?? null,
    companyId: entry.companyId ?? null,
    toolName: entry.toolName,
    paramsSummary: entry.paramsSummary ?? null,
    status: entry.status,
    statusDetail: entry.statusDetail ?? null,
    ipAddress: entry.ipAddress ?? null,
    createdAt: new Date().toISOString(),
  };

  inMemoryAuditLogs.unshift(row);
  if (inMemoryAuditLogs.length > 1000) {
    inMemoryAuditLogs.pop();
  }

  if (database) {
    try {
      await ensureMcpTokensTables(database);
      await database.execute(sql`
        INSERT INTO mcp_audit_logs (id, token_id, principal, company_id, tool_name, params_summary, status, status_detail, ip_address, created_at)
        VALUES (
          ${row.id},
          ${row.tokenId},
          ${row.principal},
          ${row.companyId},
          ${row.toolName},
          ${row.paramsSummary},
          ${row.status},
          ${row.statusDetail},
          ${row.ipAddress},
          ${new Date(row.createdAt)}
        )
      `);
    } catch {
      // Audit-Log Fehler blockieren den eigentlichen API-Aufruf nicht
    }
  }

  return row;
}

export async function listMcpAuditLogs(
  database?: Database,
  limit = 50,
): Promise<McpAuditLogEntry[]> {
  if (database) {
    try {
      await ensureMcpTokensTables(database);
      const res = await database.execute(sql`
        SELECT id, token_id, principal, company_id, tool_name, params_summary, status, status_detail, ip_address, created_at
        FROM mcp_audit_logs
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);
      if (Array.isArray(res)) {
        return (res as any[]).map((r) => ({
          id: String(r.id),
          tokenId: r.token_id ? String(r.token_id) : null,
          principal: r.principal ? String(r.principal) : null,
          companyId: r.company_id ? String(r.company_id) : null,
          toolName: String(r.tool_name),
          paramsSummary: r.params_summary ? String(r.params_summary) : null,
          status: r.status as McpAuditStatus,
          statusDetail: r.status_detail ? String(r.status_detail) : null,
          ipAddress: r.ip_address ? String(r.ip_address) : null,
          createdAt: new Date(r.created_at).toISOString(),
        }));
      }
    } catch {
      // Fallback in-memory
    }
  }
  return inMemoryAuditLogs.slice(0, limit);
}

export function clearTokensForTests(): void {
  inMemoryTokens.clear();
  inMemoryAuditLogs.length = 0;
  rateLimitMap.clear();
}
