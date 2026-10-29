/**
 * Test-Doppel: Fake-DB fuer den MCP-OAuth-Store.
 *
 * Nur ERFUNDENE Daten: fiktive Nutzer, fiktive Client-IDs, fiktive Tokens.
 * Kein echter Postgres, keine echten Tokens.
 */

import type { Database } from "../src/db/client";
import { sqlParams, sqlText } from "./fake-workspace-db";

type FakeRow = Record<string, unknown>;

/** Fake-OAuth-Datenbank: Clients, Authorization-Codes, Refresh-Tokens, Access-Tokens. */
export class FakeOAuthStore {
  readonly clients: FakeRow[] = [];
  readonly codes: FakeRow[] = [];
  readonly refreshTokens: FakeRow[] = [];
  /** Access-Tokens (das sind `connect_mcp_tokens`-Zeilen). */
  readonly accessTokens: FakeRow[] = [];

  private nextId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
  }

  database(): Database {
    const self = this;
    const db = {
      execute: async (q: unknown) => {
        const flat = sqlText(q).replace(/\s+/g, " ").trim();
        const params = sqlParams(q);

        // --- Schema (idempotent, additiv) ---------------------------------
        if (/CREATE TABLE IF NOT EXISTS connect_mcp_oauth/i.test(flat)) return [];
        if (/CREATE INDEX IF NOT EXISTS connect_mcp_oauth/i.test(flat)) return [];
        if (/CREATE TABLE IF NOT EXISTS connect_mcp_tokens/i.test(flat)) return [];
        if (/ALTER TABLE connect_mcp_tokens ADD COLUMN/i.test(flat)) return [];
        if (/ALTER TABLE connect_mcp_tokens ALTER COLUMN/i.test(flat)) return [];
        if (/CREATE INDEX IF NOT EXISTS connect_mcp_tokens/i.test(flat)) return [];

        // --- Clients -------------------------------------------------------
        if (/INSERT INTO connect_mcp_oauth_clients/.test(flat)) {
          const [id, clientName, redirectUris] = params as string[];
          const row: FakeRow = {
            id,
            client_name: clientName,
            redirect_uris: JSON.parse(redirectUris) as string[],
            created_at: new Date().toISOString(),
          };
          self.clients.push(row);
          return [row];
        }
        if (/FROM connect_mcp_oauth_clients WHERE id = /.test(flat)) {
          const id = String(params[0]);
          return self.clients.filter((c) => c.id === id);
        }

        // --- Authorization-Codes -------------------------------------------
        if (/INSERT INTO connect_mcp_oauth_codes/.test(flat)) {
          const [
            code,
            clientId,
            redirectUri,
            codeChallenge,
            codeChallengeMethod,
            userId,
            scope,
            expiresAt,
          ] = params as string[];
          const row: FakeRow = {
            code,
            client_id: clientId,
            redirect_uri: redirectUri,
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
            user_id: userId,
            scope,
            expires_at: expiresAt,
            created_at: new Date().toISOString(),
          };
          self.codes.push(row);
          return [row];
        }
        if (/DELETE FROM connect_mcp_oauth_codes WHERE code = /.test(flat)) {
          const code = String(params[0]);
          const index = self.codes.findIndex((c) => c.code === code);
          if (index < 0) return [];
          const [row] = self.codes.splice(index, 1);
          return [row];
        }

        // --- Refresh-Token --------------------------------------------------
        if (/INSERT INTO connect_mcp_oauth_refresh_tokens/.test(flat)) {
          const [id, tokenHash, clientId, userId, scope, expiresAt] = params as string[];
          const row: FakeRow = {
            id,
            token_hash: tokenHash,
            client_id: clientId,
            user_id: userId,
            scope,
            expires_at: expiresAt,
            created_at: new Date().toISOString(),
          };
          self.refreshTokens.push(row);
          return [row];
        }
        if (/DELETE FROM connect_mcp_oauth_refresh_tokens WHERE token_hash = /.test(flat)) {
          const tokenHash = String(params[0]);
          const index = self.refreshTokens.findIndex((r) => r.token_hash === tokenHash);
          if (index < 0) return [];
          const [row] = self.refreshTokens.splice(index, 1);
          return [row];
        }

        // --- Access-Tokens (connect_mcp_tokens) ------------------------------
        if (/INSERT INTO connect_mcp_tokens/.test(flat)) {
          const [id, userId, tokenHash, label, lifetime, scope, expiresAt] = params as string[];
          const row: FakeRow = {
            id,
            user_id: userId,
            token_hash: tokenHash,
            label,
            lifetime,
            scope,
            expires_at: expiresAt,
            last_used_at: null,
            created_at: new Date().toISOString(),
          };
          self.accessTokens.push(row);
          return [row];
        }
        if (/FROM connect_mcp_tokens WHERE token_hash = /.test(flat)) {
          const tokenHash = String(params[0]);
          return self.accessTokens.filter((t) => t.token_hash === tokenHash);
        }
        if (/UPDATE connect_mcp_tokens SET last_used_at/.test(flat)) return [];

        return [];
      },
    };
    return db as unknown as Database;
  }

  /** Der Benutzer, zu dem ein Access-Token gehoert (fuer die Firmen-Zuordnung). */
  userIdOfAccessToken(tokenHash: string): string | null {
    const row = this.accessTokens.find((t) => t.token_hash === tokenHash);
    return row ? String(row.user_id) : null;
  }
}
