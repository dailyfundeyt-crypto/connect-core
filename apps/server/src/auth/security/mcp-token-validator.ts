import type { Context, Next } from "hono";
import postgres from "postgres";

function getSql() {
  const dbUrl =
    process.env.DATABASE_URL ||
    (process.env.DATABASE_URL ?? "");
  return postgres(dbUrl, { max: 1, idle_timeout: 3 });
}

export interface McpTokenVerificationResult {
  valid: boolean;
  agentId?: string;
  scopes?: string[];
  /** Connect-MCP-Token-Scope ("read" | "full"). Nur "full" wird hier akzeptiert. */
  tokenScope?: "full";
  error?: string;
}

export async function verifyMcpToken(token: string): Promise<McpTokenVerificationResult> {
  if (!token || typeof token !== "string" || token.trim() === "") {
    return { valid: false, error: "Missing or invalid token format" };
  }

  const sql = getSql();
  try {
    const rows = await sql`
      SELECT id, token, agent_id, scopes, expires_at, scope
      FROM connect_mcp_tokens
      WHERE token = ${token.trim()}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return { valid: false, error: "Token not found" };
    }

    const row = rows[0];
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return { valid: false, error: "Token expired" };
    }

    // Token-Scope fail-closed: Diese Middleware unterscheidet nicht zwischen
    // lesenden und schreibenden Aktionen → nur scope "full" ist erlaubt.
    // "read", fehlende oder unbekannte Werte werden abgelehnt.
    if (row.scope !== "full") {
      return { valid: false, error: "Token scope not permitted (read-only token)" };
    }

    return {
      valid: true,
      tokenScope: "full",
      agentId: row.agent_id,
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
    };
  } catch (err: any) {
    return { valid: false, error: err?.message || "Verification failed" };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export function createRequireMcpToken() {
  return async function requireMcpTokenMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Missing Bearer token" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/, "");
    const result = await verifyMcpToken(token);

    if (!result.valid) {
      return c.json({ error: result.error || "Unauthorized MCP token" }, 403);
    }

    c.set("mcpTokenInfo", result);
    return next();
  };
}
