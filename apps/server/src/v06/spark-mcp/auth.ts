import type { Context, MiddlewareHandler } from "hono";
import type { Database } from "../../db/client";
import { resolveMcpGrantByToken } from "../../connect-mcp/grants";
import { resolveConnectMcpToken } from "../../connect-mcp/tokens";
import type { AgentAuthContext } from "./types";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK_IP = /^(127\.|::1$|::ffff:127\.)/;

// In-Memory-Register für Tests
const testTokens = new Map<string, AgentAuthContext>();

export function registerTestAgentToken(token: string, context: AgentAuthContext): void {
  testTokens.set(token, context);
}

export function clearTestAgentTokens(): void {
  testTokens.clear();
}

/**
 * Validiert, ob der Request von localhost (Loopback) oder einem autorisierten Tunnel stammt.
 */
export function isLocalhostOrTunnel(request: Request): { isLocal: boolean; isTunnel: boolean; allowed: boolean } {
  let host = "";
  try {
    const url = new URL(request.url);
    host = url.hostname.toLowerCase();
  } catch {
    const rawHost = request.headers.get("host") || "";
    host = rawHost.split(":")[0].toLowerCase();
  }

  const isLocalHost = LOOPBACK_HOSTS.has(host);
  const cfRay = request.headers.get("cf-ray");
  const tunnelHeader = request.headers.get("x-connect-tunnel");
  const isTunnel = Boolean(cfRay || tunnelHeader);

  // In Testumgebungen oder wenn explizit Loopback vorliegt
  if (isLocalHost || (!isTunnel && process.env.NODE_ENV === "test")) {
    return { isLocal: true, isTunnel: false, allowed: true };
  }

  if (isTunnel) {
    return { isLocal: false, isTunnel: true, allowed: true };
  }

  return { isLocal: false, isTunnel: false, allowed: false };
}

export type AgentTokenResolution = {
  agent: AgentAuthContext | null;
  /** Gesetzt, wenn ein an sich gültiges Token wegen seines Scopes abgelehnt wurde. */
  deniedReason?: "read-only-token";
};

/**
 * Löst das Bearer-Token eines Agenten auf.
 * Read-Tokens aus connect_mcp_tokens werden abgelehnt (null), siehe
 * resolveAgentTokenDetailed().
 */
export async function resolveAgentToken(
  token: string | null | undefined,
  database?: Database,
): Promise<AgentAuthContext | null> {
  return (await resolveAgentTokenDetailed(token, database)).agent;
}

/**
 * Wie resolveAgentToken, liefert aber zusätzlich den Ablehnungsgrund.
 *
 * Scope-Regeln:
 *   - connect_mcp_tokens: nur scope "full" erhält Zugriff (bisherige Spark-Scopes).
 *     scope "read" (oder unbekannt) wird fail-closed gesperrt, da die Spark-MCP-
 *     Endpunkte schreibende Aktionen enthalten und hier keine Tool-Klassifizierung
 *     existiert. Später ggf. eigener Read-Pfad.
 *   - mcp_grants: unverändert; Grants tragen eigene `scopes` (grant.scopes) und
 *     werden NICHT vom Token-Scope read/full erfasst.
 *   - Env-/Test-Tokens: unverändert.
 */
export async function resolveAgentTokenDetailed(
  token: string | null | undefined,
  database?: Database,
): Promise<AgentTokenResolution> {
  if (!token || typeof token !== "string") {
    return { agent: null };
  }

  const cleanToken = token.trim();
  if (!cleanToken) return { agent: null };

  // 1. Test-Token Register
  if (testTokens.has(cleanToken)) {
    return { agent: testTokens.get(cleanToken)! };
  }

  // 2. Bekannte Umgebungs-Tokens
  if (process.env.SPARK_MCP_TOKEN && cleanToken === process.env.SPARK_MCP_TOKEN.trim()) {
    return { agent: {
      agentId: "spark-mcp-env-agent",
      agentName: "SparkMcpRootAgent",
      companyId: "*",
      scopes: ["spark:folders:write", "spark:folders:read", "*"],
      isLocal: true,
      isTunnel: false,
    } };
  }

  if (process.env.MANAGED_AGENT_TOKEN && cleanToken === process.env.MANAGED_AGENT_TOKEN.trim()) {
    return { agent: {
      agentId: "managed-agent",
      agentName: "ManagedAgent",
      companyId: "*",
      scopes: ["spark:folders:write", "spark:folders:read", "*"],
      isLocal: true,
      isTunnel: false,
    } };
  }

  if (process.env.CONNECT_AGENT_TOKEN && cleanToken === process.env.CONNECT_AGENT_TOKEN.trim()) {
    return { agent: {
      agentId: "connect-agent",
      agentName: "ConnectAgent",
      companyId: "*",
      scopes: ["spark:folders:write", "spark:folders:read", "*"],
      isLocal: true,
      isTunnel: false,
    } };
  }

  // 3. MCP Grant Token auflösen (mcp_grants)
  try {
    const grant = await resolveMcpGrantByToken(database, cleanToken);
    if (grant) {
      return { agent: {
        agentId: grant.id,
        agentName: grant.agentName,
        companyId: grant.companyId,
        scopes: grant.scopes,
        isLocal: true,
        isTunnel: false,
      } };
    }
  } catch (err) {
    console.warn("[SparkMcpAuth] resolveMcpGrantByToken error:", err);
  }

  // 4. Connect MCP Token auflösen (connect_mcp_tokens)
  if (database) {
    try {
      const user = await resolveConnectMcpToken(database, cleanToken);
      if (user) {
        // Fail-closed: nur explizites "full" bekommt die (schreibenden) Spark-Scopes.
        if (user.scope !== "full") {
          return { agent: null, deniedReason: "read-only-token" };
        }
        return { agent: {
          agentId: user.id,
          agentName: user.name || "mcp-agent",
          companyId: "*",
          scopes: ["spark:folders:write", "spark:folders:read", "*"],
          isLocal: true,
          isTunnel: false,
        } };
      }
    } catch (err) {
      console.warn("[SparkMcpAuth] resolveConnectMcpToken error:", err);
    }
  }

  return { agent: null };
}

/**
 * Prüft den Zugriff eines Agenten auf ein Zielunternehmen.
 */
export function checkCompanyAccess(agent: AgentAuthContext, targetCompanyId?: string): boolean {
  if (!targetCompanyId || targetCompanyId === "*") {
    return true;
  }
  if (agent.companyId === "*" || agent.companyId === targetCompanyId) {
    return true;
  }
  if (
    agent.scopes.includes("*") ||
    agent.scopes.includes("all:companies") ||
    agent.scopes.includes(`company:${targetCompanyId}`)
  ) {
    return true;
  }
  return false;
}

export type SparkMcpVariables = {
  agent: AgentAuthContext;
};

/**
 * Hono-Middleware zur Absicherung der Spark-MCP-Endpunkte.
 */
export function createSparkMcpAuthMiddleware(
  database?: Database,
): MiddlewareHandler<{ Variables: SparkMcpVariables }> {
  return async (context, next) => {
    const network = isLocalhostOrTunnel(context.req.raw);
    if (!network.allowed) {
      return context.json(
        { error: "Zugriff verweigert: Nur localhost oder autorisierter Tunnel erlaubt." },
        403,
      );
    }

    // Token aus Header (Authorization / x-connect-agent-token / x-mcp-token) oder Query extrahieren
    let token: string | undefined;
    const authHeader = context.req.header("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7).trim();
    } else {
      token =
        context.req.header("x-connect-agent-token") ||
        context.req.header("x-mcp-token") ||
        context.req.query("token") ||
        undefined;
    }

    const resolution = await resolveAgentTokenDetailed(token, database);
    if (resolution.deniedReason === "read-only-token") {
      return context.json(
        { error: "Zugriff verweigert: Read-only-Token sind für Spark-MCP nicht zugelassen." },
        403,
      );
    }
    const agent = resolution.agent;
    if (!agent) {
      return context.json(
        { error: "Authentifizierung erforderlich: Gültiges Bearer-Token fehlt oder ist ungültig." },
        401,
      );
    }

    agent.isLocal = network.isLocal;
    agent.isTunnel = network.isTunnel;

    context.set("agent", agent);
    await next();
  };
}
