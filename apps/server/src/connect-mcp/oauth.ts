/**
 * Connect-MCP: OAuth 2.1 Authorization-Server für externe MCP-Clients.
 *
 * WARUM
 *
 * Ein MCP-Client (Grok-Bot, Codex, Perplexity, Claude …) soll sich wie bei
 * jedem anderen MCP-Server anmelden können: er schickt den Nutzer in den
 * Browser, der meldet sich mit seinem Google-Konto an, und der Client bekommt
 * danach ein Access-Token. Dieses Token ist an die User-ID gebunden, die der
 * Anmeldung zugrunde liegt — also an genau das Konto, dessen Profil
 * (Workspace-Zeile `u:<userId>:connect.companies.custom`) die Firmen liefert.
 * Ein anderes Google-Konto sieht damit andere Firmen, andere Agenten.
 *
 * Das ist bewusst KEIN statischer Token: der alte Weg (`POST /tokens`,
 * loopback-only) bleibt als Werkzeug für die eigene Automation erhalten.
 *
 * DER FLOW (Authorization Code + PKCE, OAuth 2.1)
 *
 *   1. GET  /api/connect-mcp/.well-known/oauth-protected-resource
 *      -> welche Authorization-Server dieser Resource-Server nutzt
 *   2. GET  /api/connect-mcp/.well-known/oauth-authorization-server
 *      -> Endpunkte (authorize/token/register)
 *   3. POST /api/connect-mcp/register  (RFC 7591, dynamische Registrierung)
 *   4. GET  /api/connect-mcp/authorize?response_type=code&client_id=…&
 *      redirect_uri=…&code_challenge=…&code_challenge_method=S256&state=…
 *      -> Browser: Google-Login (Better-Auth-Session) -> Freigabe-Seite
 *   5. POST /api/connect-mcp/token (authorization_code + PKCE, oder
 *      refresh_token) -> Access-Token (+ Refresh-Token)
 *
 * DAS TOKEN
 *
 * Das Access-Token ist ein normaler `connect_mcp_tokens`-Datensatz (scope
 * read/full) mit `user_id` = der angemeldeten User-ID. Damit funktioniert
 * jeder bestehende Mechanismus unverändert weiter: der Router löst es über
 * `resolveConnectMcpToken` auf, und die Firmen kommen automatisch aus der
 * Workspace-Zeile dieses Kontos.
 *
 * Für die OAuth-Autorisierungen braucht es zwei zusätzliche Tabellen
 * (rein additiv, `CREATE TABLE IF NOT EXISTS`):
 *
 *   connect_mcp_oauth_clients  — registrierte MCP-Clients (id, name, redirect URIs)
 *   connect_mcp_oauth_codes     — kurzlebige Authorization-Codes (PKCE-Hash)
 *
 * Refresh-Token: ein eigenes, ebenfalls gehashtes Token in
 * `connect_mcp_oauth_refresh_tokens`, gekoppelt an user_id + client_id. Es
 * tauscht sich gegen ein neues Access-Token ein, ohne erneute Anmeldung.
 */

import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

// ============================================================================
// Typen
// ============================================================================

export type McpOAuthClient = {
  id: string;
  clientName: string;
  redirectUris: string[];
  createdAt: string;
};

export type McpOAuthCode = {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  userId: string;
  scope: "read" | "full";
  expiresAt: string;
};

export type McpOAuthRefreshToken = {
  id: string;
  tokenHash: string;
  clientId: string;
  userId: string;
  scope: "read" | "full";
  expiresAt: string | null;
};

// ============================================================================
// Schema (lazy, additiv)
// ============================================================================

let ready: Promise<void> | null = null;

export function ensureMcpOAuthTables(database: Database): Promise<void> {
  ready ??= (async () => {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS connect_mcp_oauth_clients (
        id text PRIMARY KEY,
        client_name text NOT NULL,
        redirect_uris jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS connect_mcp_oauth_codes (
        code text PRIMARY KEY,
        client_id text NOT NULL,
        redirect_uri text NOT NULL,
        code_challenge text NOT NULL,
        code_challenge_method text NOT NULL DEFAULT 'S256',
        user_id text NOT NULL,
        scope text NOT NULL DEFAULT 'read',
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS connect_mcp_oauth_refresh_tokens (
        id text PRIMARY KEY,
        token_hash text NOT NULL UNIQUE,
        client_id text NOT NULL,
        user_id text NOT NULL,
        scope text NOT NULL DEFAULT 'read',
        expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await database.execute(
      sql`CREATE INDEX IF NOT EXISTS connect_mcp_oauth_refresh_user_idx
          ON connect_mcp_oauth_refresh_tokens (user_id)`,
    );
    await database.execute(
      sql`CREATE INDEX IF NOT EXISTS connect_mcp_oauth_codes_expires_idx
          ON connect_mcp_oauth_codes (expires_at)`,
    );
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** Nur für Tests: Schema-Cache zurücksetzen. */
export function resetMcpOAuthSchemaForTests(): void {
  ready = null;
}

// ============================================================================
// Hilfsfunktionen
// ============================================================================

export function hashOAuthSecret(value: string): string {
  return createHash("sha256").update(value.trim()).digest("base64url");
}

/** Ein Authorization-Code: kurzlebig, einmalig benutzbar. */
function generateAuthorizationCode(): string {
  return randomBytes(32).toString("base64url");
}

export function generateRefreshToken(): string {
  return `mcp_rt_${randomBytes(32).toString("base64url")}`;
}

/**
 * PKCE prüfen (RFC 7636). Nur `S256` und `plain` werden akzeptiert; `S256`
 * ist der Default und der einzige, den wir empfehlen.
 */
export function verifyPkce(
  codeChallengeMethod: string,
  codeChallenge: string,
  verifier: string,
): boolean {
  if (!verifier) return false;
  if (codeChallengeMethod === "plain") {
    return codeChallenge === verifier;
  }
  if (codeChallengeMethod !== "S256") return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  // Timing-sicher vergleichen.
  if (computed.length !== codeChallenge.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i += 1) {
    diff |= computed.charCodeAt(i) ^ codeChallenge.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================================
// Clients (RFC 7591 — dynamische Registrierung)
// ============================================================================

/**
 * Registriert einen MCP-Client. Redirect-URIs werden als Liste gespeichert;
 * ein späterer `authorize`-Aufruf muss genau eine davon treffen.
 */
export async function registerMcpOAuthClient(
  database: Database,
  input: {
    clientName: string;
    redirectUris: string[];
  },
): Promise<McpOAuthClient> {
  await ensureMcpOAuthTables(database);
  const id = `mcp_client_${randomBytes(12).toString("hex")}`;
  const createdAt = new Date().toISOString();
  await database.execute(
    sql`INSERT INTO connect_mcp_oauth_clients (id, client_name, redirect_uris, created_at)
        VALUES (${id}, ${input.clientName}, ${JSON.stringify(input.redirectUris)}::jsonb, now())`,
  );
  return { id, clientName: input.clientName, redirectUris: input.redirectUris, createdAt };
}

export async function findMcpOAuthClient(
  database: Database,
  clientId: string,
): Promise<McpOAuthClient | null> {
  await ensureMcpOAuthTables(database);
  const rows = (await database.execute(
    sql`SELECT id, client_name, redirect_uris, created_at
        FROM connect_mcp_oauth_clients WHERE id = ${clientId} LIMIT 1`,
  )) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  const raw = row.redirect_uris;
  let uris: string[] = [];
  if (Array.isArray(raw)) uris = raw.map(String);
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) uris = parsed.map(String);
    } catch {
      uris = [];
    }
  }
  return {
    id: String(row.id),
    clientName: String(row.client_name),
    redirectUris: uris,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

// ============================================================================
// Authorization-Codes
// ============================================================================

export async function createMcpAuthorizationCode(
  database: Database,
  input: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    userId: string;
    scope: "read" | "full";
    lifetimeSeconds?: number;
  },
): Promise<McpOAuthCode> {
  await ensureMcpOAuthTables(database);
  const code = generateAuthorizationCode();
  const lifetimeSeconds = input.lifetimeSeconds ?? 300;
  const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();
  await database.execute(
    sql`INSERT INTO connect_mcp_oauth_codes
        (code, client_id, redirect_uri, code_challenge, code_challenge_method, user_id, scope, expires_at)
        VALUES (${code}, ${input.clientId}, ${input.redirectUri}, ${input.codeChallenge},
                ${input.codeChallengeMethod}, ${input.userId}, ${input.scope}, ${expiresAt})`,
  );
  return {
    code,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    userId: input.userId,
    scope: input.scope,
    expiresAt,
  };
}

/**
 * Der Code wird beim Einlösen verbraucht (einmalig). Abgelaufene Codes
 * werden beim Einlösen abgewiesen.
 */
export async function consumeMcpAuthorizationCode(
  database: Database,
  code: string,
): Promise<McpOAuthCode | null> {
  await ensureMcpOAuthTables(database);
  const rows = (await database.execute(
    sql`DELETE FROM connect_mcp_oauth_codes WHERE code = ${code} RETURNING
          code, client_id, redirect_uri, code_challenge, code_challenge_method, user_id, scope, expires_at`,
  )) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  const expiresAt = new Date(row.expires_at as string);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) return null;
  const scope = row.scope === "full" ? "full" : "read";
  return {
    code: String(row.code),
    clientId: String(row.client_id),
    redirectUri: String(row.redirect_uri),
    codeChallenge: String(row.code_challenge),
    codeChallengeMethod: String(row.code_challenge_method),
    userId: String(row.user_id),
    scope,
    expiresAt: expiresAt.toISOString(),
  };
}

// ============================================================================
// Refresh-Token
// ============================================================================

export async function createMcpRefreshToken(
  database: Database,
  input: {
    clientId: string;
    userId: string;
    scope: "read" | "full";
    lifetimeSeconds?: number;
  },
): Promise<{ id: string; plaintextToken: string; expiresAt: string | null }> {
  await ensureMcpOAuthTables(database);
  const plaintextToken = generateRefreshToken();
  const id = `mcp_rto_${randomBytes(12).toString("hex")}`;
  const expiresAt =
    input.lifetimeSeconds === undefined
      ? null
      : new Date(Date.now() + input.lifetimeSeconds * 1000).toISOString();
  await database.execute(
    sql`INSERT INTO connect_mcp_oauth_refresh_tokens
        (id, token_hash, client_id, user_id, scope, expires_at)
        VALUES (${id}, ${hashOAuthSecret(plaintextToken)}, ${input.clientId}, ${input.userId},
                ${input.scope}, ${expiresAt})`,
  );
  return { id, plaintextToken, expiresAt };
}

/**
 * Ein Refresh-Token wird rotiert: beim Einlösen wird die alte Zeile gelöscht
 * und eine neue erzeugt. Ein gestohlener Refresh-Token ist damit einmalig
 * nutzbar.
 */
export async function consumeMcpRefreshToken(
  database: Database,
  token: string,
): Promise<McpOAuthRefreshToken | null> {
  await ensureMcpOAuthTables(database);
  const rows = (await database.execute(
    sql`DELETE FROM connect_mcp_oauth_refresh_tokens WHERE token_hash = ${hashOAuthSecret(token)}
        RETURNING id, token_hash, client_id, user_id, scope, expires_at`,
  )) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  const expiresAt = row.expires_at ? new Date(row.expires_at as string) : null;
  if (expiresAt && expiresAt.getTime() < Date.now()) return null;
  return {
    id: String(row.id),
    tokenHash: String(row.token_hash),
    clientId: String(row.client_id),
    userId: String(row.user_id),
    scope: row.scope === "full" ? "full" : "read",
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}
