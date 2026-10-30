/**
 * Hono-Routen für Connect-MCP & Swarm-Grants (v06 / Wave 2 / A18).
 *
 * Endpunkte:
 * - POST /api/v06/mcp/connect:       JSON-RPC 2.0 MCP-Handler für Grok Bot und Partner-Agenten
 * - GET  /api/v06/mcp/connect:       MCP-Manifest und SSE Stream-Endpoint
 * - GET  /api/v06/swarm-grants:      Liste aktiver Berechtigungs-Grants
 * - POST /api/v06/swarm-grants:      Erstellt neuen SwarmGrant
 * - DELETE /api/v06/swarm-grants/:id: Widerruft SwarmGrant (revoked_at, Soft-Delete)
 * - GET  /api/v06/mcp/tokens:        Liste aktiver Tokens (nur Hashes)
 * - POST /api/v06/mcp/tokens:        Erstellt neuen Token (Plaintext nur 1x)
 * - DELETE /api/v06/mcp/tokens/:id:  Widerruft Token sofort
 * - POST /api/v06/mcp/tokens/:id/rotate: Rotiert Token
 */

import { Hono } from "hono";
import type { Database } from "../../db/client";
import { getFlag } from "../../contracts/v06/flags";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import {
  createSwarmGrant,
  listSwarmGrants,
  revokeSwarmGrant,
} from "./grants";
import {
  createMcpToken,
  listMcpTokens,
  resolveMcpToken,
  revokeMcpToken,
  rotateMcpToken,
} from "./tokens";
import { getConnectMcpServer, ConnectMcpServer } from "./server";
import type { ConnectMcpAuthContext } from "./types";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Validiert, ob der Request von localhost oder einem autorisierten Cloudflare-Tunnel stammt.
 */
export function isLocalhostOrTunnel(request: Request): {
  isLocal: boolean;
  isTunnel: boolean;
  allowed: boolean;
} {
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

export type ConnectMcpHonoVariables = {
  auth: ConnectMcpAuthContext;
};

export function createConnectMcpRouter(
  database?: Database,
  customServer?: ConnectMcpServer,
): Hono<{ Variables: ConnectMcpHonoVariables }> {
  const router = new Hono<{ Variables: ConnectMcpHonoVariables }>();
  const server = customServer || getConnectMcpServer(database);

  // 1. Feature Flag Guard: Nur aktiv, wenn FLAGS_V06.connectMcp aktiv ist
  router.use("*", async (c, next) => {
    if (!getFlag("connectMcp")) {
      return c.json(
        {
          error: "Connect-MCP ist deaktiviert.",
          flag: "connectMcp",
          status: "disabled",
        },
        503,
      );
    }
    await next();
  });

  // 2. Netzwerk-Prüfung: Nur Localhost oder Cloudflare Tunnel
  router.use("*", async (c, next) => {
    const net = isLocalhostOrTunnel(c.req.raw);
    if (!net.allowed) {
      return c.json(
        { error: "Zugriff verweigert: Nur localhost oder autorisierter Tunnel erlaubt." },
        403,
      );
    }
    await next();
  });

  // 3. Auth-Middleware für MCP-Endpunkte
  const requireMcpAuth = async (c: any, next: any) => {
    let token: string | undefined;
    const authHeader = c.req.header("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.slice(7).trim();
    } else {
      token =
        c.req.header("x-connect-agent-token") ||
        c.req.header("x-mcp-token") ||
        c.req.header("x-connect-token") ||
        c.req.query("token") ||
        undefined;
    }

    if (!token) {
      return c.json(
        { error: "Authentifizierung erforderlich: Bearer-Token fehlt." },
        401,
      );
    }

    const tokenRecord = await resolveMcpToken(token, database);
    if (!tokenRecord) {
      return c.json(
        { error: "Ungültiges oder widerrufenes Bearer-Token." },
        401,
      );
    }

    // Lade die Grants für diesen Principal
    const grants = await listSwarmGrants({ principal: tokenRecord.principal }, database);

    const net = isLocalhostOrTunnel(c.req.raw);
    const authContext: ConnectMcpAuthContext = {
      principal: tokenRecord.principal,
      tokenId: tokenRecord.id,
      tokenHash: tokenRecord.tokenHash,
      grants,
      isLocal: net.isLocal,
      isTunnel: net.isTunnel,
    };

    c.set("auth", authContext);
    await next();
  };

  // ==========================================================================
  // MCP Endpunkte
  // ==========================================================================

  // GET /api/v06/mcp/connect (Manifest & SSE Support)
  router.get("/connect", requireMcpAuth, async (c) => {
    const acceptHeader = c.req.header("accept") || "";

    if (acceptHeader.includes("text/event-stream")) {
      return c.text(
        `: Connect-MCP SSE ready\nevent: endpoint\ndata: ${API_PATHS_V06.connectMcp}\n\n`,
        200,
        {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      );
    }

    const manifest = server.getManifest();
    return c.json({
      status: "ok",
      manifest,
      principal: c.var.auth.principal,
      grantsCount: c.var.auth.grants.length,
    });
  });

  // POST /api/v06/mcp/connect (MCP JSON-RPC 2.0 Aufrufe)
  router.post("/connect", requireMcpAuth, async (c) => {
    try {
      const body = await c.req.json();
      const auth = c.var.auth;
      const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "127.0.0.1";
      const response = await server.handleJsonRpc(body, auth, ip);
      return c.json(response);
    } catch (err: any) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: `Ungültiger JSON-Payload: ${err?.message || String(err)}`,
          },
        },
        400,
      );
    }
  });

  // ==========================================================================
  // REST API: Swarm-Grants CRUD (/api/v06/swarm-grants)
  // ==========================================================================

  // GET /api/v06/swarm-grants
  router.get("/grants", async (c) => {
    const companyId = c.req.query("companyId");
    const principal = c.req.query("principal");
    const includeRevoked = c.req.query("includeRevoked") === "true";

    const grants = await listSwarmGrants({ companyId, principal, includeRevoked }, database);
    return c.json(grants);
  });

  // POST /api/v06/swarm-grants
  router.post("/grants", async (c) => {
    try {
      const body = await c.req.json();
      if (!body.principal || !body.companyId || !Array.isArray(body.scopes)) {
        return c.json(
          { error: "Felder 'principal', 'companyId' und 'scopes' (Array) sind erforderlich." },
          400,
        );
      }

      const grant = await createSwarmGrant(
        {
          principal: body.principal,
          companyId: body.companyId,
          swarmId: body.swarmId,
          scopes: body.scopes,
        },
        database,
      );

      return c.json(grant, 201);
    } catch (err: any) {
      return c.json({ error: err?.message || String(err) }, 400);
    }
  });

  // DELETE /api/v06/swarm-grants/:id (Löschen = Widerrufen via revoked_at)
  router.delete("/grants/:id", async (c) => {
    const id = c.req.param("id");
    const success = await revokeSwarmGrant(id, database);
    if (!success) {
      return c.json({ error: "Grant nicht gefunden." }, 404);
    }
    return c.json({ ok: true, id, status: "revoked" });
  });

  // ==========================================================================
  // REST API: MCP Tokens (für UI, Ausgabe nur lokal, Hashes in DB)
  // ==========================================================================

  // GET /api/v06/mcp/tokens
  router.get("/tokens", async (c) => {
    const principal = c.req.query("principal");
    const tokens = await listMcpTokens(principal, database);
    return c.json(tokens);
  });

  // POST /api/v06/mcp/tokens
  router.post("/tokens", async (c) => {
    try {
      const body = await c.req.json();
      if (!body.principal || !body.label) {
        return c.json({ error: "Felder 'principal' und 'label' sind erforderlich." }, 400);
      }

      const created = await createMcpToken(
        {
          principal: body.principal,
          label: body.label,
          lifetime: body.lifetime,
          expiresAt: body.expiresAt,
        },
        database,
      );

      return c.json(created, 201);
    } catch (err: any) {
      return c.json({ error: err?.message || String(err) }, 400);
    }
  });

  // DELETE /api/v06/mcp/tokens/:id (Widerrufen)
  router.delete("/tokens/:id", async (c) => {
    const id = c.req.param("id");
    const success = await revokeMcpToken(id, database);
    if (!success) {
      return c.json({ error: "Token nicht gefunden." }, 404);
    }
    return c.json({ ok: true, id, status: "revoked" });
  });

  // POST /api/v06/mcp/tokens/:id/rotate
  router.post("/tokens/:id/rotate", async (c) => {
    const id = c.req.param("id");
    const rotated = await rotateMcpToken(id, database);
    if (!rotated) {
      return c.json({ error: "Token nicht gefunden." }, 404);
    }
    return c.json(rotated);
  });

  return router;
}

/**
 * Registriert die Connect-MCP und Swarm-Grants Routen auf der Server-Applikation.
 *
 * Exponiert:
 * - /api/v06/mcp/connect (MCP JSON-RPC 2.0 & Manifest)
 * - /api/v06/swarm-grants (REST API für Grants)
 */
export function registerConnectMcpRoutes(app: Hono<any>, database?: Database): void {
  const router = createConnectMcpRouter(database);

  // Mounten gemäß API_PATHS_V06
  // API_PATHS_V06.connectMcp = "/api/v06/mcp/connect"
  // API_PATHS_V06.swarmGrants = "/api/v06/swarm-grants"
  app.route("/api/v06/mcp", router);
  app.route(API_PATHS_V06.swarmGrants, router);
}

export default registerConnectMcpRoutes;
