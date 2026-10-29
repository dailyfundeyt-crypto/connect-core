/**
 * Connect-MCP Token-Verwaltung (Stufe 5 Commit 1).
 *
 * Tokens werden in `connect_mcp_tokens` gespeichert. Schema wird beim
 * ersten Server-Start lazy angelegt (IF NOT EXISTS), damit wir keine
 * Drizzle-Migration brauchen. Spalten-Migrationen (z.B. `scope`) laufen
 * ebenfalls idempotent in `ensureConnectMcpTables()`.
 *
 * - Token-Format: 32 Byte Random, base64url-encoded (43 Zeichen)
 * - Lifetime: 60s (probe) oder permanent (mit user-bestätigtem Flag)
 * - Hash: SHA-256 des Tokens (nicht das Token selbst!)
 *   → Bei DB-Leak sind die Tokens nicht direkt verwendbar
 *
 * Diese Datei implementiert die CRUD-Operationen. Der UI-Generator
 * (Commit 8: Admin-Page) ruft `createToken()` auf, der Router ruft
 * `resolveToken()` auf.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

// ============================================================================
// In-Memory Rate Limiting pro Token
// ============================================================================

type RateLimitRecord = { count: number; resetAt: number };
const tokenRateLimitMap = new Map<string, RateLimitRecord>();
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000; // 1 Minute
const DEFAULT_RATE_LIMIT_MAX = 120; // 120 Anfragen / Minute

export function checkTokenRateLimit(
  tokenOrHash: string,
  maxRequests = Number(process.env.CONNECT_MCP_RATE_LIMIT) || DEFAULT_RATE_LIMIT_MAX,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const key = tokenOrHash.length > 40 ? tokenOrHash.slice(0, 40) : tokenOrHash;
  const now = Date.now();
  const entry = tokenRateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    tokenRateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterSeconds: 0 };
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, retryAfterSeconds: 0 };
}

export function resetTokenRateLimitsForTests(): void {
  tokenRateLimitMap.clear();
}

export type McpTokenLifetime = "probe" | "permanent";

/**
 * Berechtigungsumfang eines Tokens.
 *   - "read": nur Tools mit readOnly/readOnlyHint=true (fail-closed)
 *   - "full": alle Tools (Verhalten vor Einführung der Scopes)
 * Bestandstokens (vor der Migration) werden "full", neue Tokens default "read".
 */
export type McpTokenScope = "read" | "full";

export const DEFAULT_MCP_TOKEN_SCOPE: McpTokenScope = "read";

export function isMcpTokenScope(value: unknown): value is McpTokenScope {
  return value === "read" || value === "full";
}

/** Unbekannte/fehlende DB-Werte → "read" (fail-closed). */
export function normalizeMcpTokenScope(value: unknown): McpTokenScope {
  return value === "full" ? "full" : "read";
}

export type McpTokenRow = {
  id: string;
  userId: string;
  /** SHA-256-Hash des Tokens, base64url-encoded. NIEMALS das Klartext-Token speichern. */
  tokenHash: string;
  /** Menschen-lesbares Label ("Grok-Bot auf meinem Laptop") */
  label: string;
  lifetime: McpTokenLifetime;
  scope: McpTokenScope;
  /** ISO-Timestamp, wann der Token abläuft. NULL = permanent. */
  expiresAt: string | null;
  /** ISO-Timestamp des letzten Aufrufs (für UI-Anzeige) */
  lastUsedAt: string | null;
  createdAt: string;
};

/**
 * Listen-Eintrag für die UI / GET /tokens. Enthält bewusst KEINEN tokenHash
 * (auch Hashes werden nicht nach außen gegeben).
 */
export type McpTokenListItem = Omit<McpTokenRow, "tokenHash">;

export type McpTokenCreate = {
  userId: string;
  label: string;
  lifetime: McpTokenLifetime;
  /** Default: "read" */
  scope?: McpTokenScope;
};

export type McpTokenCreated = McpTokenCreate & {
  scope: McpTokenScope;
  /** Das Klartext-Token — NUR EINMAL bei der Erstellung zurückgeben! */
  plaintextToken: string;
  expiresAt: string | null;
  id: string;
};

let ready: Promise<void> | null = null;

export function ensureConnectMcpTables(database: Database): Promise<void> {
  ready ??= (async () => {
    await database.execute(sql`CREATE TABLE IF NOT EXISTS connect_mcp_tokens (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      token_hash text NOT NULL UNIQUE,
      label text NOT NULL,
      lifetime text NOT NULL CHECK (lifetime IN ('probe', 'permanent')),
      expires_at timestamptz,
      last_used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      scope text NOT NULL DEFAULT 'read' CONSTRAINT connect_mcp_tokens_scope_check CHECK (scope IN ('read', 'full'))
    )`);
    // Migration (Token-Scopes): Bestandstabellen ohne `scope`-Spalte bekommen
    // die Spalte mit DEFAULT 'full' → alle existierenden Tokens behalten vollen
    // Zugriff. Danach wird der Default für neue Zeilen auf 'read' gesetzt.
    // Alle Schritte sind idempotent.
    await database.execute(
      sql`ALTER TABLE connect_mcp_tokens ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'full'`,
    );
    await database.execute(
      sql`ALTER TABLE connect_mcp_tokens ALTER COLUMN scope SET DEFAULT 'read'`,
    );
    await database.execute(sql`DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'connect_mcp_tokens_scope_check'
        ) THEN
          ALTER TABLE connect_mcp_tokens
            ADD CONSTRAINT connect_mcp_tokens_scope_check CHECK (scope IN ('read', 'full'));
        END IF;
      END $$`);
    await database.execute(
      sql`CREATE INDEX IF NOT EXISTS connect_mcp_tokens_user_idx ON connect_mcp_tokens (user_id)`,
    );
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

// ============================================================================
// Token Hashing
// ============================================================================

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

// ============================================================================
// CRUD
// ============================================================================

/**
 * Erstellt einen neuen Token. Gibt das Klartext-Token EINMAL zurück.
 * Nach diesem Call ist das Token nur noch über seinen Hash auffindbar.
 */
export async function createConnectMcpToken(
  database: Database,
  input: McpTokenCreate,
): Promise<McpTokenCreated> {
  await ensureConnectMcpTables(database);
  const plaintextToken = generateToken();
  const tokenHash = hashToken(plaintextToken);
  const id = `mcp-${randomBytes(8).toString("hex")}`;
  const expiresAt =
    input.lifetime === "probe"
      ? new Date(Date.now() + 60_000).toISOString()
      : null;
  const scope: McpTokenScope = isMcpTokenScope(input.scope) ? input.scope : DEFAULT_MCP_TOKEN_SCOPE;

  await database.execute(
    sql`INSERT INTO connect_mcp_tokens
      (id, user_id, token_hash, label, lifetime, scope, expires_at, created_at)
      VALUES (${id}, ${input.userId}, ${tokenHash}, ${input.label}, ${input.lifetime},
              ${scope}, ${expiresAt}, now())`,
  );

  return {
    ...input,
    scope,
    plaintextToken,
    expiresAt,
    id,
  };
}

/**
 * Validiert einen Bearer-Token und gibt die User-Identität zurück.
 * Aktualisiert `last_used_at` als Side-Effect.
 */
export async function resolveConnectMcpToken(
  database: Database,
  token: string,
): Promise<{ id: string; email?: string; name?: string; scope: McpTokenScope } | null> {
  if (!token || token.length < 16) return null;
  await ensureConnectMcpTables(database);
  const tokenHash = hashToken(token);
  const tokenHashBuf = Buffer.from(tokenHash, "utf-8");

  const rows = (await database.execute(
    sql`SELECT id, user_id, token_hash, expires_at, scope FROM connect_mcp_tokens
        WHERE token_hash = ${tokenHash} LIMIT 1`,
  )) as Array<{
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: string | null;
    scope: string | null;
  }>;
  const row = rows[0];
  if (!row) return null;

  // Constant-time hash verification via timingSafeEqual
  const dbHashBuf = Buffer.from(row.token_hash, "utf-8");
  if (tokenHashBuf.length !== dbHashBuf.length || !timingSafeEqual(tokenHashBuf, dbHashBuf)) {
    return null;
  }

  // Probe-Tokens: prüfen, ob abgelaufen
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return null;
  }

  // Last-Used aktualisieren (fire-and-forget, Fehler ignorieren)
  void database
    .execute(
      sql`UPDATE connect_mcp_tokens SET last_used_at = now() WHERE id = ${row.id}`,
    )
    .catch(() => {});

  return { id: row.user_id, scope: normalizeMcpTokenScope(row.scope) };
}

/**
 * Liste aller Tokens eines Users (für UI). Weder Klartext-Token noch
 * tokenHash werden zurückgegeben (token_hash wird gar nicht erst selektiert).
 */
export async function listConnectMcpTokens(
  database: Database,
  userId: string,
): Promise<McpTokenListItem[]> {
  await ensureConnectMcpTables(database);
  const rows = (await database.execute(
    sql`SELECT id, user_id, label, lifetime, scope, expires_at, last_used_at, created_at
        FROM connect_mcp_tokens WHERE user_id = ${userId} ORDER BY created_at DESC`,
  )) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    label: String(r.label),
    lifetime: (r.lifetime as McpTokenLifetime) ?? "probe",
    scope: normalizeMcpTokenScope(r.scope),
    expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null,
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at as string).toISOString() : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

/** Widerruft einen Token (für UI). */
export async function revokeConnectMcpToken(
  database: Database,
  userId: string,
  tokenId: string,
): Promise<boolean> {
  await ensureConnectMcpTables(database);
  await database.execute(
    sql`DELETE FROM connect_mcp_tokens WHERE id = ${tokenId} AND user_id = ${userId}`,
  );
  // Drizzle's pg-driver gibt kein rowcount zurück; wir lesen den Token zur Verifikation.
  const after = (await database.execute(
    sql`SELECT 1 FROM connect_mcp_tokens WHERE id = ${tokenId} LIMIT 1`,
  )) as Array<unknown>;
  return after.length === 0;
}
