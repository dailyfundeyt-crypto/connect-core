/**
 * Connect-MCP — globaler MCP-Server, der alle Connect-Agenten und -Features
 * als Tools nach außen exponiert. Externe Clients (Perplexity Computer,
 * Grok-Bot, Codex-App, Manus, Claude, Swarm) rufen diesen Endpoint als MCP-Server
 * auf.
 *
 * URL:       POST /api/connect-mcp/jsonrpc
 * Manifest:  GET  /api/connect-mcp/manifest
 * Health:    GET  /api/connect-mcp/health
 * Tokens:    GET/POST/DELETE /api/connect-mcp/tokens  (NUR Loopback, nie über Tunnel)
 *
 * Format: JSON-RPC 2.0
 *   { "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
 *   { "jsonrpc": "2.0", "id": 2, "method": "tools/call",
 *     "params": { "name": "list_agents", "arguments": {} } }
 *
 * Auth & Erreichbarkeit (Phase E - Schritt 19):
 *   - Erreichbar: Lokal (Loopback 127.0.0.1 / localhost) UND autorisierter Tunnel (Cloudflare Quick/Named Tunnel).
 *   - Auth per Token: Über Tunnel ist ein gültiger Bearer-Token (connect_mcp_tokens) Pflicht.
 *   - Lokal: Bearer-Token empfohlen; Dev/SingleUser-Fallback nur auf Loopback.
 *   - Token-Übergabe via Header `Authorization: Bearer <token>`, `x-mcp-token`, `x-connect-token`
 *     oder URL-Query `?token=<token>`.
 *
 * Token-Scopes (connect_mcp_tokens.scope):
 *   - "read": tools/list zeigt nur Tools mit readOnly/readOnlyHint=true,
 *     tools/call auf alle anderen Tools → 403 (fail-closed: unmarkiert = schreibend).
 *     Gilt auch für /:scope/jsonrpc. Mutierende /swarm/*-Endpoints → 403.
 *   - "full": alle Tools (bisheriges Verhalten).
 */

import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { Database } from "../db/client";
import { DEV_ACTOR } from "../auth/dev-actor";
import { checkTokenRateLimit } from "./tokens";
import { checkGrantScope, recordMcpAuditLog, resolveMcpGrantByToken } from "./grants";
import type { McpGrant } from "../contracts/api";

// ============================================================================
// JSON-RPC 2.0 Types
// ============================================================================

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown> | unknown[] | null;
};

export type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcError = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// JSON-RPC standard error codes
export const JSON_RPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** Server-definiert: Token-Scope reicht nicht (z.B. Read-Token ruft Schreib-Tool) */
  FORBIDDEN: -32003,
} as const;

/** Scope eines Connect-MCP-Tokens (siehe tokens.ts). */
export type ConnectMcpTokenScope = "read" | "full";

/**
 * true NUR wenn das Tool explizit als lesend markiert ist
 * (readOnlyHint === true oder readOnly === true) und keine der beiden
 * Markierungen explizit false ist. Unmarkierte Tools gelten als schreibend.
 */
export function isReadOnlyTool(def: Pick<McpToolDef, "annotations">): boolean {
  const a = def.annotations;
  if (!a) return false;
  if (a.readOnlyHint === false || a.readOnly === false) return false;
  return a.readOnlyHint === true || a.readOnly === true;
}

/** Filtert die Tool-Liste für einen Token-Scope. "full"/undefined → unverändert. */
export function filterToolsForTokenScope(
  tools: McpToolDef[],
  tokenScope?: ConnectMcpTokenScope,
): McpToolDef[] {
  if (tokenScope !== "read") return tools;
  return tools.filter((t) => isReadOnlyTool(t));
}

// ============================================================================
// MCP-Tool-Definition (analog zu MCP-Spec)
// ============================================================================

export type McpToolDef = {
  /** Tool-Name, z.B. "list_agents" */
  name: string;
  /** Kurzbeschreibung für Tool-Listen */
  description: string;
  /** JSON-Schema (MCP-Format: type=object, properties, required) */
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  /**
   * Optionale Handler-Funktion. Wenn vorhanden, führt der Router sie aus,
   * wenn `tools/call` mit diesem Tool-Namen aufgerufen wird.
   */
  handler?: McpToolHandler;
  /** Optionale Annotationen für UI-Clients */
  annotations?: {
    readOnlyHint?: boolean;
    readOnly?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export type McpToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: { uri: string; text: string; mimeType?: string } }
  >;
  isError?: boolean;
};

export type McpToolContext = {
  /** User, der das Tool aufruft (kommt aus dem Bearer-Token) */
  actorId: string;
  /** E-Mail des aufrufenden Nutzers (für Zuordnungen, die über E-Mail auflösen) */
  actorEmail?: string | null;
  /** Optional: expliziter Agent-Context, falls das Tool agent-scoped ist */
  agentId?: string;
  /** Optional: Request-Signal für Cancellation */
  signal?: AbortSignal;
  /** Optional: Berechtigungs-Grant für Grok-Bot-Agenten */
  grant?: McpGrant | null;
};

export type McpToolHandler = (
  args: Record<string, unknown>,
  ctx: McpToolContext,
) => Promise<McpToolResult>;

// ============================================================================
// Validation Helpers
// ============================================================================

export function validateToolArgs(
  def: McpToolDef,
  args: unknown,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (args === null || args === undefined) {
    return { ok: true, args: {} };
  }
  if (typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "arguments must be a JSON object" };
  }

  const obj = args as Record<string, unknown>;
  const schema = def.inputSchema;

  if (schema.required && Array.isArray(schema.required)) {
    for (const reqKey of schema.required) {
      if (obj[reqKey] === undefined || obj[reqKey] === null) {
        return { ok: false, error: `Missing required argument: "${reqKey}"` };
      }
    }
  }

  return { ok: true, args: obj };
}

// ============================================================================
// JSON-RPC Dispatcher
// ============================================================================

export type DispatchResult = {
  response: JsonRpcResponse;
  httpStatus: 200 | 400 | 401 | 403 | 404 | 500;
};

export type ConnectMcpDeps = {
  /** Liste der exponierten Tools (kommt aus `tool-registry.ts`) */
  tools: McpToolDef[];
  /** User-Identität aus dem Bearer-Token auflösen */
  resolveToken: (
    token: string,
  ) => Promise<{ id: string; email?: string; name?: string | null; scope?: ConnectMcpTokenScope } | null>;
  /** Single-User-Mode: erlaube Anfragen ohne Token auf Loopback */
  singleUser?: { id: string; email?: string; name?: string | null };
  /** Optionale Datenbank für Token-CRUD */
  database?: Database;
  /** Optionale Liste erlaubter Tunnel-Hosts (keine Substring-Treffer) */
  allowedTunnelHosts?: string[];
  /** Flag, ob Token auch per ?token= übergeben werden darf (standardmäßig aus) */
  allowQueryToken?: boolean;
};

export async function dispatchJsonRpc(
  raw: unknown,
  deps: ConnectMcpDeps,
  actor: { id: string; email?: string; name?: string | null } | null,
  grant?: McpGrant | null,
  ipAddress?: string | null,
  options?: { tokenScope?: ConnectMcpTokenScope },
): Promise<DispatchResult> {
  const tokenScope = options?.tokenScope;
  // 1. Parse-Error
  if (typeof raw !== "object" || raw === null) {
    return {
      httpStatus: 400,
      response: {
        jsonrpc: "2.0",
        id: null,
        error: { code: JSON_RPC_ERROR.PARSE_ERROR, message: "Invalid JSON-RPC payload" },
      },
    };
  }

  const req = raw as Partial<JsonRpcRequest>;

  // 2. Invalid-Request
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return {
      httpStatus: 400,
      response: {
        jsonrpc: "2.0",
        id: (req.id as JsonRpcId) ?? null,
        error: { code: JSON_RPC_ERROR.INVALID_REQUEST, message: "Invalid JSON-RPC 2.0 request" },
      },
    };
  }

  const id = (req.id as JsonRpcId) ?? null;

  // 3. Method: tools/list
  if (req.method === "tools/list") {
    return {
      httpStatus: 200,
      response: {
        jsonrpc: "2.0",
        id,
        result: {
          tools: filterToolsForTokenScope(deps.tools, tokenScope).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            ...(t.annotations ? { annotations: t.annotations } : {}),
          })),
        },
      },
    };
  }

  // 4. Method: tools/call
  if (req.method === "tools/call") {
    if (!actor) {
      return {
        httpStatus: 401,
        response: {
          jsonrpc: "2.0",
          id,
          error: { code: JSON_RPC_ERROR.INVALID_REQUEST, message: "Authentication required" },
        },
      };
    }
    const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const toolName = params.name;
    if (typeof toolName !== "string") {
      return {
        httpStatus: 400,
        response: {
          jsonrpc: "2.0",
          id,
          error: { code: JSON_RPC_ERROR.INVALID_PARAMS, message: "Missing tool name" },
        },
      };
    }
    const tool = deps.tools.find((t) => t.name === toolName);
    if (!tool) {
      return {
        httpStatus: 404,
        response: {
          jsonrpc: "2.0",
          id,
          error: { code: JSON_RPC_ERROR.METHOD_NOT_FOUND, message: `Unknown tool: ${toolName}` },
        },
      };
    }

    // Token-Scope "read": nur explizit lesende Tools (fail-closed)
    if (tokenScope === "read" && !isReadOnlyTool(tool)) {
      void recordMcpAuditLog(deps.database, {
        grantId: grant?.id,
        agentName: grant?.agentName || actor.name || "Read Token",
        tokenHash: grant?.tokenHash,
        toolName,
        paramsSummary: "",
        status: "denied",
        statusDetail: "read-only token",
        ipAddress,
      });
      return {
        httpStatus: 403,
        response: {
          jsonrpc: "2.0",
          id,
          error: {
            code: JSON_RPC_ERROR.FORBIDDEN,
            message: `Forbidden: Tool "${toolName}" ist nicht read-only; dieses Token hat nur scope "read".`,
          },
        },
      };
    }

    const validated = validateToolArgs(tool, params.arguments);
    if (!validated.ok) {
      const result: McpToolResult = {
        isError: true,
        content: [{ type: "text", text: `Invalid arguments: ${validated.error}` }],
      };
      return { httpStatus: 200, response: { jsonrpc: "2.0", id, result } };
    }

    // Prompt 10.2: Grant Scope Check (z.B. Flux-Token kann Hyper Swarm NICHT steuern)
    if (grant) {
      let requiredScope: string | null = null;
      if (toolName === "app.open_qr" || toolName === "app_open_qr") {
        requiredScope = "app:open_qr";
      } else if (toolName === "agents.health" || toolName === "agents_health") {
        requiredScope = "agents:health";
      } else if (
        toolName.startsWith("swarm.") ||
        toolName.startsWith("swarm_") ||
        toolName === "run_swarm"
      ) {
        const rawType =
          (validated.args.swarm_type as string) ||
          (validated.args.target_swarm as string) ||
          (toolName.includes("hyper") ? "hyper" : toolName.includes("flux") ? "flux" : "general");
        const swarmType = rawType.toLowerCase();
        requiredScope = `swarm:${swarmType}`;
      } else if (toolName.startsWith("email_agents.") || toolName.startsWith("email_agents_")) {
        requiredScope = "email_agents:*";
      }

      if (requiredScope) {
        const check = checkGrantScope(grant, requiredScope);
        if (!check.allowed) {
          void recordMcpAuditLog(deps.database, {
            grantId: grant.id,
            agentName: grant.agentName,
            tokenHash: grant.tokenHash,
            toolName,
            paramsSummary: JSON.stringify(validated.args).slice(0, 200),
            status: "denied",
            statusDetail: check.reason,
            ipAddress,
          });
          const result: McpToolResult = {
            isError: true,
            content: [{ type: "text", text: check.reason || "403 Forbidden: Insufficient grant" }],
          };
          return { httpStatus: 200, response: { jsonrpc: "2.0", id, result } };
        }
      }
    }

    try {
      let result: McpToolResult;
      if (tool.handler) {
        result = await tool.handler(validated.args, {
          actorId: actor.id,
          actorEmail: actor.email ?? null,
          grant,
        });
      } else {
        result = {
          content: [
            {
              type: "text",
              text: `[Connect-MCP-Stub] Tool "${toolName}" ist registriert, aber noch kein Handler verdrahtet. Args: ${JSON.stringify(validated.args)}`,
            },
          ],
        };
      }

      // Audit-Log aufzeichnen (Migration 0091)
      void recordMcpAuditLog(deps.database, {
        grantId: grant?.id,
        agentName: grant?.agentName || actor.name || "Local User",
        tokenHash: grant?.tokenHash,
        toolName,
        paramsSummary: JSON.stringify(validated.args).slice(0, 200),
        status: result.isError ? "error" : "success",
        statusDetail: result.isError ? (result.content?.[0] as any)?.text : undefined,
        ipAddress,
      });

      return { httpStatus: 200, response: { jsonrpc: "2.0", id, result } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const result: McpToolResult = {
        isError: true,
        content: [{ type: "text", text: `Tool handler error: ${message}` }],
      };

      void recordMcpAuditLog(deps.database, {
        grantId: grant?.id,
        agentName: grant?.agentName || actor.name || "Local User",
        tokenHash: grant?.tokenHash,
        toolName,
        paramsSummary: JSON.stringify(validated.args).slice(0, 200),
        status: "error",
        statusDetail: message,
        ipAddress,
      });

      return { httpStatus: 200, response: { jsonrpc: "2.0", id, result } };
    }
  }

  // 5. Method: ping (für Health-Checks)
  if (req.method === "ping") {
    return {
      httpStatus: 200,
      response: { jsonrpc: "2.0", id, result: { pong: true, server: "connect-mcp", version: "0.2.0" } },
    };
  }

  // 6. Method-Not-Found
  return {
    httpStatus: 404,
    response: {
      jsonrpc: "2.0",
      id,
      error: { code: JSON_RPC_ERROR.METHOD_NOT_FOUND, message: `Unknown method: ${req.method}` },
    },
  };
}

// ============================================================================
// Host & Tunnel Checks
// ============================================================================

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK_IP_REGEX = /^(127\.|::1$|::ffff:127\.|localhost$)/i;

export function getClientIp(context: Context): string {
  // 1. Echte Socket-Adresse von Bun / Node (kann von außen nicht gefälscht werden)
  const server = (
    context.env as
      | { server?: { requestIP?: (r: Request) => { address: string } | null } }
      | undefined
  )?.server;
  const rawIp =
    server?.requestIP?.(context.req.raw)?.address ??
    (context.req.raw as any)?.socket?.remoteAddress;

  // Wenn die echte TCP-Verbindung von außen (Nicht-Loopback) kommt, gilt sie verbindlich als extern
  if (rawIp && !LOOPBACK_IP_REGEX.test(rawIp) && !LOOPBACK_HOSTS.has(rawIp)) {
    return rawIp;
  }

  // 2. Simulation / Tests über lokale Verbindung (z.B. x-test-remote-ip oder x-remote-ip)
  const testIp =
    context.req.header("x-test-remote-ip") ||
    context.req.header("x-remote-ip");
  if (testIp) return testIp.trim();

  const fwd = context.req.header("x-forwarded-for");
  if (fwd) {
    const clientIp = fwd.split(",")[0].trim();
    if (clientIp && !LOOPBACK_IP_REGEX.test(clientIp) && !LOOPBACK_HOSTS.has(clientIp)) {
      return clientIp;
    }
  }

  return rawIp || "127.0.0.1";
}

export function isLoopbackIp(ip: string): boolean {
  return LOOPBACK_IP_REGEX.test(ip) || LOOPBACK_HOSTS.has(ip);
}

export function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getAllowedTunnelHosts(configuredHosts?: string[]): Set<string> {
  const set = new Set<string>();
  const envHosts = process.env.CONNECT_MCP_TUNNEL_HOSTS;
  if (envHosts) {
    for (const h of envHosts.split(",")) {
      const clean = hostnameOf(h.trim()) || h.trim().toLowerCase();
      if (clean) set.add(clean);
    }
  }
  if (process.env.CONNECT_PUBLIC_URL) {
    const pubHost = hostnameOf(process.env.CONNECT_PUBLIC_URL);
    if (pubHost) set.add(pubHost);
  }
  if (configuredHosts) {
    for (const h of configuredHosts) {
      const clean = hostnameOf(h.trim()) || h.trim().toLowerCase();
      if (clean) set.add(clean);
    }
  }
  return set;
}

/**
 * Header, die ausschließlich von Cloudflare gesetzt werden. Ist einer davon
 * vorhanden, ist der Request ein Tunnel-Request — unabhängig davon, ob die
 * TCP-Verbindung lokal (Loopback, cloudflared-Prozess auf diesem Rechner) oder
 * von außen kommt.
 *
 * Vorher war die CF-Prüfung an `isLoopbackRemote` gekoppelt: nur wenn die
 * Remote-Adresse Loopback war, zählten cf-ray/cf-connecting-ip als Tunnel.
 * Dadurch konnte ein Request mit CF-Headern über einen Nicht-Loopback-Pfad
 * als "lokal" durchrutschen.
 */
const CLOUDFLARE_TUNNEL_HEADERS = ["cf-connecting-ip", "cf-ray", "cf-ipcountry"] as const;

/** true, wenn der Header einen Cloudflare-Tunnel-Kontext belegt. */
export function hasCloudflareTunnelHeader(context: Context): boolean {
  for (const name of CLOUDFLARE_TUNNEL_HEADERS) {
    const value = context.req.header(name);
    if (value && value.trim() !== "") return true;
  }
  const cdnLoop = context.req.header("cdn-loop");
  if (cdnLoop && /cloudflare/i.test(cdnLoop)) return true;
  return false;
}

export function isTunnelContext(
  context: Context,
  allowedTunnelHosts?: Set<string>,
): boolean {
  const clientIp = getClientIp(context);
  const isLoopbackRemote = isLoopbackIp(clientIp);
  const host = hostnameOf(context.req.header("host"));
  const allowedHosts = allowedTunnelHosts ?? getAllowedTunnelHosts();

  // 1. Exakte Tunnel-Allowlist (keine Substring-Treffer!)
  if (host && allowedHosts.has(host)) {
    return true;
  }

  // 2. Cloudflare-Header: cf-connecting-ip / cf-ray / cf-ipcountry /
  //    cdn-loop: cloudflare. Unabhängig von der Remote-Adresse (fail-closed).
  if (hasCloudflareTunnelHeader(context)) {
    return true;
  }

  // 3. Proxy-Header (Forwarded / X-Real-IP) belegen ebenfalls einen Tunnel.
  if (context.req.header("forwarded") || context.req.header("x-real-ip")) {
    return true;
  }

  // 4. Cloudflare-Quick-Tunnel nur, wenn Request vom lokalen cloudflared
  //    (Remote-Adresse Loopback) kommt.
  if (isLoopbackRemote) {
    if (host && host.endsWith(".trycloudflare.com")) {
      return true;
    }
  }

  return false;
}

export function checkAccess(
  context: Context,
  allowedTunnelHosts?: Set<string>,
): { allowed: boolean; isTunnel: boolean; reason?: string } {
  const clientIp = getClientIp(context);
  const isLoopbackRemote = isLoopbackIp(clientIp);
  const host = hostnameOf(context.req.header("host"));

  if (!host) {
    return { allowed: false, isTunnel: false, reason: "Host-Header fehlt" };
  }

  const allowedHosts = allowedTunnelHosts ?? getAllowedTunnelHosts();
  const isTunnel = isTunnelContext(context, allowedHosts);

  // Regel: Nicht-Loopback ohne erlaubten Tunnel-Host => 403
  if (!isLoopbackRemote) {
    if (allowedHosts.has(host)) {
      return { allowed: true, isTunnel: true };
    }

    /*
     * ECHTER TUNNEL ÜBER CLOUDFLARE MIT LOOPBACK-HOST.
     *
     * cloudflared leitet den `Host`-Header der ORIGIN-Adresse weiter, nicht den
     * öffentlichen Namen: hinter einem Quick-Tunnel kommt "Host: localhost:3101"
     * an, während die Anfrage über das Internet zugestellt wurde (CF-Header
     * `cf-connecting-ip`/`cf-ray`/`cf-ipcountry`/`cdn-loop` beweisen das, und
     * `x-forwarded-for` nennt die echte fremde IP).
     *
     * Ohne diese Ausnahme wurde jeder echte Tunnel-Request abgewiesen, weil der
     * Host-Header gar nicht dem Tunnel-Namen entspricht. Der Loopback-Host ist
     * hier kein Freibrief: er wird nur zusammen mit den Cloudflare-Headern
     * akzeptiert, und die Host-Allowlist bleibt für alles andere maßgeblich.
     *
     * Die Token-Verwaltung (/tokens) prüft `isStrictLoopbackRequest` und bleibt
     * davon unberührt: dort sind CF-Header ein Ausschlussgrund, kein Nachweis.
     */
    const hasCloudflareProof = hasCloudflareTunnelHeader(context);
    const loopbackHost =
      LOOPBACK_HOSTS.has(host) ||
      host.startsWith("localhost:") ||
      host.startsWith("127.0.0.1:") ||
      host.endsWith(".localhost");

    if (hasCloudflareProof && loopbackHost) {
      return { allowed: true, isTunnel: true };
    }

    return {
      allowed: false,
      isTunnel: false,
      reason: "Zugriff von Nicht-Loopback-Adresse ohne erlaubten Tunnel-Host verweigert.",
    };
  }

  // Remote ist Loopback:
  const isLoopbackHost =
    LOOPBACK_HOSTS.has(host) ||
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host.endsWith(".localhost");

  if (isLoopbackHost) {
    return { allowed: true, isTunnel };
  }

  if (isTunnel) {
    return { allowed: true, isTunnel: true };
  }

  // Weder Loopback noch erlaubter Tunnel-Host (z.B. evil-cloudflare.example)
  return {
    allowed: false,
    isTunnel: false,
    reason: `Host "${host}" ist weder ein lokaler Loopback-Host noch ein erlaubter Tunnel-Host.`,
  };
}

/**
 * Erlaubt Zugriff nur lokal (Loopback) oder über autorisierten Tunnel.
 */
export function createLocalAndTunnelMiddleware(deps: ConnectMcpDeps): MiddlewareHandler {
  const allowedHosts = getAllowedTunnelHosts(deps.allowedTunnelHosts);
  return async (context, next) => {
    const access = checkAccess(context, allowedHosts);
    if (!access.allowed) {
      return context.json(
        { error: access.reason || "Connect-MCP ist nur lokal auf diesem PC oder über Tunnel erreichbar." },
        403,
      );
    }
    const origin = context.req.header("origin");
    if (origin && origin !== "null") {
      const originHost = hostnameOf(origin);
      if (originHost && !LOOPBACK_HOSTS.has(originHost) && !allowedHosts.has(originHost) && !access.isTunnel) {
        return context.json(
          { error: "Connect-MCP ist nur lokal auf diesem PC oder über autorisierten Tunnel erreichbar." },
          403,
        );
      }
    }
    await next();
  };
}

export type TokenResolver = ConnectMcpDeps["resolveToken"];

/**
 * Strikte Loopback-Prüfung für Token-Verwaltung (/tokens): Kein Tunnel-Kontext,
 * Client-IP Loopback, Host-Header Loopback, alle X-Forwarded-For-Einträge
 * Loopback und keine Proxy-/Cloudflare-Header. Ein Bearer-Token ändert daran nichts.
 */
export function isStrictLoopbackRequest(
  context: Context,
  allowedTunnelHosts?: Set<string>,
): boolean {
  if (isTunnelContext(context, allowedTunnelHosts)) return false;
  if (!isLoopbackIp(getClientIp(context))) return false;

  const host = hostnameOf(context.req.header("host"));
  if (!host || !LOOPBACK_HOSTS.has(host)) return false;

  const fwd = context.req.header("x-forwarded-for");
  if (fwd) {
    for (const part of fwd.split(",")) {
      const ip = part.trim();
      if (ip && !isLoopbackIp(ip)) return false;
    }
  }

  const fwdHost = context.req.header("x-forwarded-host");
  if (fwdHost) {
    const h = hostnameOf(fwdHost.split(",")[0]?.trim());
    if (!h || !LOOPBACK_HOSTS.has(h)) return false;
  }

  if (
    context.req.header("cf-connecting-ip") ||
    context.req.header("cf-ray") ||
    context.req.header("x-real-ip") ||
    context.req.header("forwarded")
  ) {
    return false;
  }
  return true;
}

/**
 * Entfernt geheimnisnahe Felder (tokenHash, Klartext) aus Token-Listeneinträgen,
 * bevor sie die API verlassen. Defensiv zusätzlich zu listConnectMcpTokens().
 */
export function stripTokenSecrets<T extends object>(row: T): Omit<T, "tokenHash"> {
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  delete copy.tokenHash;
  delete copy.token_hash;
  delete copy.plaintextToken;
  delete copy.token;
  return copy as Omit<T, "tokenHash">;
}

/** Extrahiert ein Token aus Authorization: Bearer / x-mcp-token / x-connect-token (/ ?token=). */
function extractRequestToken(context: Context, allowQuery: boolean): string | null {
  const authHeader = context.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim() || null;
  const customToken = context.req.header("x-mcp-token") || context.req.header("x-connect-token");
  if (customToken) return customToken.trim() || null;
  if (allowQuery) {
    const q = context.req.query("token");
    if (q) return q.trim() || null;
  }
  return null;
}

function filterToolsForScope(tools: McpToolDef[], rawScope?: string): McpToolDef[] {
  if (!rawScope || rawScope === "all" || rawScope === "global") return tools;
  const s = rawScope.toLowerCase().trim();
  if (s === "flux") {
    return tools.filter((t) => t.name.startsWith("flux_"));
  }
  if (s === "spark" || s === "knowledge") {
    return tools.filter(
      (t) =>
        t.name.startsWith("spark_") ||
        t.name.includes("spark_note") ||
        t.name === "list_knowledge_sources",
    );
  }
  if (s === "hyper" || s === "trading") {
    return tools.filter(
      (t) =>
        t.name.startsWith("hyper_") ||
        t.name === "crypto_quote" ||
        t.name === "finance_summary" ||
        t.name === "market_news",
    );
  }
  if (s === "analyse" || s === "analysis" || s === "social") {
    return tools.filter((t) => t.name.startsWith("analyse_") || t.name.startsWith("analysis_"));
  }
  if (s === "browser" || s === "connect-browser") {
    return tools.filter(
      (t) =>
        t.name.startsWith("browser_") ||
        t.name.includes("browser_tab") ||
        t.name === "get_screenshot",
    );
  }
  if (s === "connect" || s === "connect-mcp" || s === "platform") {
    return tools.filter(
      (t) =>
        t.name.startsWith("connect_") ||
        t.name === "list_agents" ||
        t.name === "create_agent" ||
        t.name === "start_agent" ||
        t.name === "stop_agent" ||
        t.name === "send_task" ||
        t.name === "get_status" ||
        t.name === "get_result" ||
        t.name === "get_agent_profile" ||
        t.name === "chat_with_agent" ||
        t.name === "query_agent" ||
        t.name === "steer_agent" ||
        t.name === "create_task",
    );
  }
  if (s === "swarm" || s === "swarm-controller") {
    return tools.filter(
      (t) =>
        t.name.startsWith("swarm_") ||
        t.name === "run_swarm",
    );
  }
  return tools;
}

// ============================================================================
// Standard-MCP (Streamable HTTP) – Hilfsfunktionen
// ============================================================================

export const MCP_SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const MCP_LATEST_PROTOCOL_VERSION = MCP_SUPPORTED_PROTOCOL_VERSIONS[0];

/** Antwort auf `initialize` (Version-Negotiation laut MCP-Spec). */
export function buildMcpInitializeResult(params: unknown): Record<string, unknown> {
  const requested = (params as { protocolVersion?: unknown } | null)?.protocolVersion;
  const protocolVersion =
    typeof requested === "string" &&
    (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
      ? requested
      : MCP_LATEST_PROTOCOL_VERSION;
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "connect-mcp", version: "0.2.0" },
  };
}

/**
 * Verarbeitet einen MCP-POST-Body (Einzelnachricht oder Batch):
 * - `initialize` wird hier beantwortet
 * - Notifications/Responses (ohne id bzw. ohne method) → keine Antwort; nur solche → 202
 * - alles andere → `dispatch` (tools/list, tools/call, ping, …)
 * JSON-RPC-Fehler werden mit HTTP 200 im Body geliefert (MCP-Clients erwarten das).
 */
async function respondMcp(
  context: Context,
  body: unknown,
  dispatch: (req: unknown) => Promise<DispatchResult>,
) {
  const messages = Array.isArray(body) ? body : [body];
  const responses: JsonRpcResponse[] = [];
  for (const raw of messages) {
    const msg = (raw ?? {}) as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
    const hasId = msg.id !== undefined && msg.id !== null;
    if (typeof msg.method !== "string" || !hasId) {
      // Notification (z.B. notifications/initialized) oder Client-Response → kein Ergebnis
      if (msg.jsonrpc === "2.0") continue;
    }
    if (msg.jsonrpc === "2.0" && msg.method === "initialize") {
      responses.push({
        jsonrpc: "2.0",
        id: msg.id as JsonRpcId,
        result: buildMcpInitializeResult(msg.params),
      } as JsonRpcResponse);
      continue;
    }
    const result = await dispatch(raw);
    responses.push(result.response);
  }
  if (responses.length === 0) return context.body(null, 202);
  return context.json(Array.isArray(body) ? responses : responses[0], 200);
}

export function createConnectMcpRouter(deps: ConnectMcpDeps): Hono {
  const app = new Hono();
  const allowedHosts = getAllowedTunnelHosts(deps.allowedTunnelHosts);

  app.use("*", createLocalAndTunnelMiddleware(deps));

  async function handleJsonRpcRequest(
    context: Context,
    scopedTools: McpToolDef[],
    options?: { mcp?: boolean },
  ) {
    const mcpMode = options?.mcp === true;
    let actor: { id: string; email?: string; name?: string | null } | null = null;
    const allowQuery =
      process.env.CONNECT_MCP_ALLOW_QUERY_TOKEN === "true" ||
      process.env.CONNECT_MCP_ALLOW_QUERY_TOKEN === "1" ||
      deps.allowQueryToken === true;

    const authHeader = context.req.header("authorization");
    const customToken =
      context.req.header("x-mcp-token") ||
      context.req.header("x-connect-token");
    const queryToken = allowQuery ? context.req.query("token") : undefined;

    let token: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (customToken) {
      token = customToken.trim();
    } else if (queryToken) {
      token = queryToken.trim();
    }

    // Standard-MCP-Endpunkt (/mcp): Bearer-Pflicht – auch lokal, kein DEV-Fallback.
    if (mcpMode && !token) {
      context.header("WWW-Authenticate", 'Bearer realm="connect-mcp"');
      return context.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: JSON_RPC_ERROR.INVALID_REQUEST,
            message: "Authentication required: Bearer token missing",
          },
        },
        401,
      );
    }

    let grant: McpGrant | null = null;
    let tokenScope: ConnectMcpTokenScope | undefined;
    if (token) {
      // In-Memory Rate Limiting pro Token
      const rateCheck = checkTokenRateLimit(token);
      if (!rateCheck.allowed) {
        return context.json(
          {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32000,
              message: `Rate limit exceeded. Try again in ${rateCheck.retryAfterSeconds} seconds.`,
            },
          },
          429,
          { "Retry-After": String(rateCheck.retryAfterSeconds) },
        );
      }

      // Prüfe zuerst, ob es ein externer Grok-Bot Grant Token ist.
      //
      // mcp_grants und Token-Scope (read/full): Grant-Tokens stammen aus der
      // Tabelle `mcp_grants`, NICHT aus `connect_mcp_tokens`. Für sie gilt der
      // read/full-Scope NICHT – `tokenScope` bleibt undefined (keine
      // tools/list-Filterung, kein read-Gate in tools/call). Stattdessen
      // greifen die grant-eigenen `scopes` über `checkGrantScope()` (pro Tool
      // in dispatchJsonRpc, "swarm:general" für /swarm/*). Ein Grant mit
      // passenden Scopes kann also auch mutierende Tools aufrufen.
      try {
        grant = await resolveMcpGrantByToken(deps.database, token);
      } catch {}

      if (grant) {
        actor = {
          id: grant.companyId,
          name: grant.agentName,
          email: `${grant.agentName.toLowerCase().replace(/\s+/g, "-")}@connect.external`,
        };
      } else {
        const resolved = await deps.resolveToken(token);
        if (resolved) {
          // Nur ein explizites "full" (oder fehlendes Feld bei Alt-Resolvern) gibt Vollzugriff;
          // jeder andere gesetzte Wert wird als "read" behandelt (fail-closed).
          tokenScope =
            resolved.scope === undefined || resolved.scope === "full" ? "full" : "read";
          actor = {
            id: resolved.id,
            ...(resolved.email !== undefined ? { email: resolved.email } : {}),
            ...(resolved.name !== undefined ? { name: resolved.name } : {}),
          };
        } else {
          actor = null;
        }
      }

      if (!actor) {
        return context.json(
          {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: JSON_RPC_ERROR.INVALID_REQUEST,
              message: "Authentication failed: Bearer token is invalid or expired",
            },
          },
          401,
        );
      }
    }

    const isTunnel = isTunnelContext(context, allowedHosts);
    if (!actor) {
      if (isTunnel) {
        return context.json(
          {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: JSON_RPC_ERROR.INVALID_REQUEST,
              message: "Authentication required: Valid Bearer token required for Connect-MCP access over Tunnel",
            },
          },
          401,
        );
      }
      actor = deps.singleUser ?? DEV_ACTOR;
    }

    if (!actor) {
      return context.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: JSON_RPC_ERROR.INVALID_REQUEST,
            message: "Authentication required: Bearer token missing",
          },
        },
        401,
      );
    }

    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: JSON_RPC_ERROR.PARSE_ERROR, message: "Body must be valid JSON" },
        },
        400,
      );
    }

    const scopedDeps: ConnectMcpDeps = { ...deps, tools: scopedTools };
    const ipAddress = context.req.header("x-forwarded-for") || context.req.header("cf-connecting-ip") || "127.0.0.1";

    if (mcpMode) {
      return respondMcp(context, body, (req) =>
        dispatchJsonRpc(req, scopedDeps, actor, grant, ipAddress, { tokenScope }),
      );
    }

    if (Array.isArray(body)) {
      const results = await Promise.all(
        body.map((req) => dispatchJsonRpc(req, scopedDeps, actor, grant, ipAddress, { tokenScope })),
      );
      const responses = results.map((r) => r.response);
      const status = results.every((r) => r.httpStatus === 200) ? 200 : 400;
      return context.json(responses, status as 200 | 400);
    }

    const result = await dispatchJsonRpc(body, scopedDeps, actor, grant, ipAddress, { tokenScope });
    return context.json(result.response, result.httpStatus);
  }

  /**
   * Guard für Swarm-REST-Endpoints.
   *   mode "write" (mutierende POSTs):
   *     - Read-Token → 403
   *   mode "read" (GET /swarm/status, /swarm/results):
   *     - Read- und Full-Token erlaubt
   *   beide:
   *     - Ungültiges Token → 401
   *     - Grant-Token → braucht Scope swarm:general
   *     - Über Tunnel ohne Token → 401
   *     - Lokal ohne Token → erlaubt (bisheriges Verhalten)
   * Gibt `null` zurück, wenn erlaubt, sonst die Fehler-Response.
   */
  async function requireSwarmAccess(
    context: Context,
    mode: "read" | "write",
  ): Promise<Response | null> {
    const allowQuery =
      process.env.CONNECT_MCP_ALLOW_QUERY_TOKEN === "true" ||
      process.env.CONNECT_MCP_ALLOW_QUERY_TOKEN === "1" ||
      deps.allowQueryToken === true;
    const token = extractRequestToken(context, allowQuery);
    if (!token) {
      if (isTunnelContext(context, allowedHosts)) {
        return context.json(
          { error: "Unauthorized: Valid Bearer token required for Connect-MCP over Tunnel" },
          401,
        );
      }
      return null;
    }
    const rateCheck = checkTokenRateLimit(token);
    if (!rateCheck.allowed) {
      return context.json({ error: "Rate limit exceeded" }, 429, {
        "Retry-After": String(rateCheck.retryAfterSeconds),
      });
    }
    let grant: McpGrant | null = null;
    try {
      grant = await resolveMcpGrantByToken(deps.database, token);
    } catch {}
    if (grant) {
      const check = checkGrantScope(grant, "swarm:general");
      return check.allowed
        ? null
        : context.json({ error: check.reason || "403 Forbidden: Insufficient grant" }, 403);
    }
    const resolved = await deps.resolveToken(token);
    if (!resolved) {
      return context.json({ error: "Authentication failed: Bearer token is invalid or expired" }, 401);
    }
    if (mode === "write" && resolved.scope !== undefined && resolved.scope !== "full") {
      return context.json({ error: "Forbidden: read-only token darf keine Swarm-Aktionen ausführen" }, 403);
    }
    return null;
  }

  const requireSwarmWriteAccess = (context: Context) => requireSwarmAccess(context, "write");
  const requireSwarmReadAccess = (context: Context) => requireSwarmAccess(context, "read");

  /** Über Tunnel nur minimale, nicht-sensitive Infos in /health und /manifest. */
  const isMinimalInfoContext = (context: Context) => isTunnelContext(context, allowedHosts);

  const TOKENS_LOOPBACK_ONLY_ERROR =
    "Forbidden: Token-Verwaltung ist nur lokal (Loopback) erlaubt, nicht über Tunnel/Proxy.";

  // Global Health — über Tunnel nur {ok}
  app.get("/health", (context) =>
    isMinimalInfoContext(context) ? context.json({ ok: true }) : context.json({
      ok: true,
      server: "connect-mcp",
      version: "0.2.0",
      tunnel_supported: true,
      auth_mode: "token",
      tools: deps.tools.length,
    }),
  );

  // Global Manifest — über Tunnel ohne Tool-Details (Tools nur via tools/list mit Token)
  app.get("/manifest", (context) =>
    isMinimalInfoContext(context)
      ? context.json({
          server: { name: "connect-mcp" },
          transport: "http",
          auth: { type: "bearer", header: "Authorization: Bearer <token>" },
          url: "/api/connect-mcp/jsonrpc",
        })
      : context.json({
      server: { name: "connect-mcp", version: "0.2.0" },
      transport: "http",
      auth: { type: "bearer", header: "Authorization: Bearer <token>" },
      url: "/api/connect-mcp/jsonrpc",
      tools: deps.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(t.annotations ? { annotations: t.annotations } : {}),
      })),
    }),
  );

  // Token Management REST Endpoints — NUR Loopback (auch mit Bearer-Token nie über Tunnel)
  async function resolveTokenAdminActor(context: Context): Promise<string | null> {
    let actorId: string | null = deps.singleUser?.id ?? DEV_ACTOR.id;
    const authHeader = context.req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const tokenActor = await deps.resolveToken(authHeader.slice(7).trim());
      if (tokenActor) actorId = tokenActor.id;
    }
    return actorId;
  }

  app.get("/tokens", async (context) => {
    if (!isStrictLoopbackRequest(context, allowedHosts)) {
      return context.json({ error: TOKENS_LOOPBACK_ONLY_ERROR }, 403);
    }
    const actorId = await resolveTokenAdminActor(context);
    if (!actorId || !deps.database) {
      return context.json({ error: "Unauthorized or database unavailable" }, 401);
    }
    const { listConnectMcpTokens } = await import("./tokens");
    const tokens = (await listConnectMcpTokens(deps.database, actorId)).map(stripTokenSecrets);
    return context.json({ count: tokens.length, tokens });
  });

  app.post("/tokens", async (context) => {
    if (!isStrictLoopbackRequest(context, allowedHosts)) {
      return context.json({ error: TOKENS_LOOPBACK_ONLY_ERROR }, 403);
    }
    const actorId = await resolveTokenAdminActor(context);
    if (!actorId || !deps.database) {
      return context.json({ error: "Unauthorized or database unavailable" }, 401);
    }
    const body = (await context.req.json().catch(() => ({}))) as {
      label?: string;
      lifetime?: "probe" | "permanent";
      scope?: unknown;
    };
    if (body.scope !== undefined && body.scope !== "read" && body.scope !== "full") {
      return context.json({ error: 'Invalid scope: erlaubt sind "read" oder "full"' }, 400);
    }
    const scope: ConnectMcpTokenScope = body.scope === "full" ? "full" : "read";
    const { createConnectMcpToken } = await import("./tokens");
    const created = await createConnectMcpToken(deps.database, {
      userId: actorId,
      label: body.label || "MCP Client Token",
      lifetime: body.lifetime || "permanent",
      scope,
    });
    return context.json(created, 201);
  });

  app.delete("/tokens/:id", async (context) => {
    if (!isStrictLoopbackRequest(context, allowedHosts)) {
      return context.json({ error: TOKENS_LOOPBACK_ONLY_ERROR }, 403);
    }
    const actorId = await resolveTokenAdminActor(context);
    if (!actorId || !deps.database) {
      return context.json({ error: "Unauthorized or database unavailable" }, 401);
    }
    const tokenId = context.req.param("id");
    const { revokeConnectMcpToken } = await import("./tokens");
    // Signatur: (database, userId, tokenId)
    const revoked = await revokeConnectMcpToken(deps.database, actorId, tokenId);
    return context.json({ ok: revoked });
  });

  // Swarm-Controller REST Endpoints (Phase E Schritt 20 & 21)
  app.get("/swarm/status", async (context) => {
    const denied = await requireSwarmReadAccess(context);
    if (denied) return denied;
    const { getSwarmController } = await import("../swarm/swarm-controller");
    const controller = getSwarmController(deps.database);
    return context.json(controller.getStatus(20));
  });

  app.post("/swarm/run", async (context) => {
    const denied = await requireSwarmWriteAccess(context);
    if (denied) return denied;
    const body = (await context.req.json().catch(() => ({}))) as {
      task?: string;
      url?: string;
      count?: number;
      max_concurrent?: number;
      action?: string;
      tasks?: any[];
      priority?: "high" | "normal" | "low";
    };
    const { getSwarmController } = await import("../swarm/swarm-controller");
    const controller = getSwarmController(deps.database);
    const count = typeof body.count === "number" ? Math.min(20, Math.max(1, body.count)) : 3;
    const maxConcurrent = typeof body.max_concurrent === "number" ? Math.min(20, Math.max(1, body.max_concurrent)) : count;
    const action = (body.action as any) || "navigate";
    const url = body.url || (body.task?.startsWith("http") ? body.task : "about:blank");
    const priority = body.priority || "normal";

    let taskInputs: any[] = [];
    if (Array.isArray(body.tasks) && body.tasks.length > 0) {
      taskInputs = body.tasks.map((t: any, i: number) => ({
        title: `Swarm Task #${i + 1}`,
        action: t.action || action,
        params: { url: t.url || url, selector: t.selector, text: t.text, expression: t.expression },
        priority: t.priority || priority,
        agentId: t.agent_id || "auto",
      }));
    } else {
      for (let i = 1; i <= count; i++) {
        taskInputs.push({
          title: `Parallel Swarm Task #${i}`,
          action,
          params: { url, expression: body.task ? `document.title + ' | Agent #${i}'` : undefined },
          priority,
          agentId: "auto",
        });
      }
    }

    const result = await controller.runBatch(taskInputs, { maxConcurrent });
    return context.json(result);
  });

  app.get("/swarm/results", async (context) => {
    const denied = await requireSwarmReadAccess(context);
    if (denied) return denied;
    const { getSwarmController } = await import("../swarm/swarm-controller");
    const controller = getSwarmController(deps.database);
    const runId = context.req.query("run_id");
    const taskId = context.req.query("task_id");
    if (taskId) {
      const task = controller.getTask(taskId);
      if (!task) return context.json({ error: "Task nicht gefunden" }, 404);
      return context.json({ task });
    }
    if (runId) {
      const run = controller.getRunResult(runId);
      if (!run) return context.json({ error: "Run nicht gefunden" }, 404);
      return context.json({ run });
    }
    const limit = Number(context.req.query("limit")) || 30;
    return context.json({ count: controller.listResults(limit).length, results: controller.listResults(limit) });
  });

  app.post("/swarm/enqueue", async (context) => {
    const denied = await requireSwarmWriteAccess(context);
    if (denied) return denied;
    const body = (await context.req.json().catch(() => ({}))) as any;
    if (!body.action) return context.json({ error: "action ist erforderlich" }, 400);
    const { getSwarmController } = await import("../swarm/swarm-controller");
    const controller = getSwarmController(deps.database);
    const task = controller.enqueueTask({
      action: body.action,
      title: body.title,
      agentId: body.agent_id || "auto",
      priority: body.priority || "normal",
      params: { url: body.url, selector: body.selector, text: body.text, expression: body.expression },
    });
    return context.json({ ok: true, task });
  });

  app.post("/swarm/worker/:agentId/stop", async (context) => {
    const denied = await requireSwarmWriteAccess(context);
    if (denied) return denied;
    const agentId = context.req.param("agentId");
    const { getSwarmController } = await import("../swarm/swarm-controller");
    const controller = getSwarmController(deps.database);
    const stopped = controller.stopWorker(agentId);
    return context.json({ ok: stopped, agentId });
  });

  app.post("/swarm/worker/:agentId/takeover", async (context) => {
    const denied = await requireSwarmWriteAccess(context);
    if (denied) return denied;
    const agentId = context.req.param("agentId");
    const { getSwarmController } = await import("../swarm/swarm-controller");
    const controller = getSwarmController(deps.database);
    try {
      const res = await controller.takeoverWorker(agentId);
      return context.json(res);
    } catch (err: any) {
      return context.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  app.post("/swarm/worker/:agentId/screenshot", async (context) => {
    const denied = await requireSwarmWriteAccess(context);
    if (denied) return denied;
    const agentId = context.req.param("agentId");
    const { getSwarmController } = await import("../swarm/swarm-controller");
    const controller = getSwarmController(deps.database);
    const res = await controller.captureWorkerScreenshot(agentId);
    return context.json(res);
  });

  app.post("/swarm/stop-all", async (context) => {
    const denied = await requireSwarmWriteAccess(context);
    if (denied) return denied;
    const { getSwarmController } = await import("../swarm/swarm-controller");
    const controller = getSwarmController(deps.database);
    const res = controller.stopAll();
    return context.json({ ok: true, ...res });
  });

  // Global JSON-RPC Endpoint
  app.post("/jsonrpc", (context) => handleJsonRpcRequest(context, deps.tools));

  // Standard-MCP (Streamable HTTP, stateless, JSON-Antworten):
  //   POST /mcp  → initialize, notifications/*, ping, tools/list, tools/call
  //   GET/DELETE /mcp → 405 (kein SSE-Stream, keine Sessions)
  // Bearer-Token ist Pflicht (auch lokal); read/full-Scope gilt wie bei /jsonrpc.
  app.post("/mcp", (context) => handleJsonRpcRequest(context, deps.tools, { mcp: true }));
  app.on(["GET", "DELETE"], "/mcp", (context) => {
    context.header("Allow", "POST");
    return context.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: JSON_RPC_ERROR.INVALID_REQUEST, message: "Method not allowed: nur POST (stateless, kein SSE)" },
      },
      405,
    );
  });

  // Scoped Health (z.B. /api/connect-mcp/flux/health)
  app.get("/:scope/health", (context) => {
    if (isMinimalInfoContext(context)) return context.json({ ok: true });
    const scope = context.req.param("scope");
    const scoped = filterToolsForScope(deps.tools, scope);
    return context.json({
      ok: true,
      server: `connect-mcp-${scope}`,
      scope,
      version: "0.2.0",
      tools: scoped.length,
    });
  });

  // Scoped Manifest (z.B. /api/connect-mcp/flux/manifest)
  app.get("/:scope/manifest", (context) => {
    const scope = context.req.param("scope");
    if (isMinimalInfoContext(context)) {
      return context.json({
        server: { name: `connect-mcp-${scope}` },
        transport: "http",
        auth: { type: "bearer", header: "Authorization: Bearer <token>" },
        url: `/api/connect-mcp/${scope}/jsonrpc`,
      });
    }
    const scoped = filterToolsForScope(deps.tools, scope);
    return context.json({
      server: { name: `connect-mcp-${scope}`, scope, version: "0.2.0" },
      transport: "http",
      url: `/api/connect-mcp/${scope}/jsonrpc`,
      tools: scoped.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(t.annotations ? { annotations: t.annotations } : {}),
      })),
    });
  });

  // Scoped JSON-RPC Endpoint (z.B. /api/connect-mcp/flux/jsonrpc)
  app.post("/:scope/jsonrpc", (context) => {
    const scope = context.req.param("scope");
    const scoped = filterToolsForScope(deps.tools, scope);
    return handleJsonRpcRequest(context, scoped);
  });

  return app;
}
