/**
 * Connect-MCP Token-Verwaltung (Stufe 5 Commit 1).
 *
 * Tokens werden in `connect_mcp_tokens` gespeichert. Schema wird beim
 * ersten Server-Start lazy angelegt (IF NOT EXISTS), damit wir keine
 * Drizzle-Migration brauchen.
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

import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

export type McpTokenLifetime = "probe" | "permanent";

export type McpTokenRow = {
  id: string;
  userId: string;
  /** SHA-256-Hash des Tokens, base64url-encoded. NIEMALS das Klartext-Token speichern. */
  tokenHash: string;
  /** Menschen-lesbares Label ("Grok-Bot auf meinem Laptop") */
  label: string;
  lifetime: McpTokenLifetime;
  /** ISO-Timestamp, wann der Token abläuft. NULL = permanent. */
  expiresAt: string | null;
  /** ISO-Timestamp des letzten Aufrufs (für UI-Anzeige) */
  lastUsedAt: string | null;
  createdAt: string;
};

export type McpTokenCreate = {
  userId: string;
  label: string;
  lifetime: McpTokenLifetime;
};

export type McpTokenCreated = McpTokenCreate & {
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
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
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

  await database.execute(
    sql`INSERT INTO connect_mcp_tokens
      (id, user_id, token_hash, label, lifetime, expires_at, created_at)
      VALUES (${id}, ${input.userId}, ${tokenHash}, ${input.label}, ${input.lifetime},
              ${expiresAt}, now())`,
  );

  return {
    ...input,
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
): Promise<{ id: string; email?: string; name?: string } | null> {
  if (!token || token.length < 16) return null;
  await ensureConnectMcpTables(database);
  const tokenHash = hashToken(token);

  const rows = (await database.execute(
    sql`SELECT user_id, expires_at FROM connect_mcp_tokens
        WHERE token_hash = ${tokenHash} LIMIT 1`,
  )) as Array<{ user_id: string; expires_at: string | null }>;
  const row = rows[0];
  if (!row) return null;

  // Probe-Tokens: prüfen, ob abgelaufen
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return null;
  }

  // Last-Used aktualisieren (fire-and-forget, Fehler ignorieren)
  void database
    .execute(
      sql`UPDATE connect_mcp_tokens SET last_used_at = now() WHERE token_hash = ${tokenHash}`,
    )
    .catch(() => {});

  return { id: row.user_id };
}

/** Liste aller Tokens eines Users (für UI). Klartext-Token wird NICHT zurückgegeben. */
export async function listConnectMcpTokens(
  database: Database,
  userId: string,
): Promise<McpTokenRow[]> {
  await ensureConnectMcpTables(database);
  const rows = (await database.execute(
    sql`SELECT id, user_id, token_hash, label, lifetime, expires_at, last_used_at, created_at
        FROM connect_mcp_tokens WHERE user_id = ${userId} ORDER BY created_at DESC`,
  )) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    tokenHash: String(r.token_hash),
    label: String(r.label),
    lifetime: (r.lifetime as McpTokenLifetime) ?? "probe",
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
