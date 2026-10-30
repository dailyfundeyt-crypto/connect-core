import { Hono } from "hono";
import type { Database } from "../../db/client";
import { getFlag } from "../../contracts/v06/flags";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import { createSparkMcpAuthMiddleware, type SparkMcpVariables } from "./auth";
import { getSparkMcpServer, SparkMcpServer } from "./server";

export function createSparkMcpRouter(
  database?: Database,
  customServer?: SparkMcpServer,
): Hono<{ Variables: SparkMcpVariables }> {
  const router = new Hono<{ Variables: SparkMcpVariables }>();
  const server = customServer || getSparkMcpServer(database);

  // 1. Feature Flag Guard: Nur aktiv, wenn FLAGS_V06.sparkMcp aktiv ist
  router.use("*", async (c, next) => {
    if (!getFlag("sparkMcp")) {
      return c.json(
        {
          error: "Spark-MCP ist deaktiviert.",
          flag: "sparkMcp",
          status: "disabled",
        },
        503,
      );
    }
    await next();
  });

  // 2. Auth Guard: Prüft Localhost/Tunnel und Bearer-Token
  router.use("*", createSparkMcpAuthMiddleware(database));

  // 3. GET /api/v06/spark-mcp - Manifest & Tool-Definitionen
  router.get("/", async (c) => {
    const acceptHeader = c.req.header("accept") || "";

    // Streamable HTTP / Server-Sent Events Support
    if (acceptHeader.includes("text/event-stream")) {
      return c.text(
        `: Spark-MCP SSE stream ready\nevent: endpoint\ndata: ${API_PATHS_V06.sparkMcp}\n\n`,
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
      agent: {
        id: c.var.agent.agentId,
        name: c.var.agent.agentName,
        companyId: c.var.agent.companyId,
      },
    });
  });

  // 4. POST /api/v06/spark-mcp - JSON-RPC 2.0 MCP Handler
  router.post("/", async (c) => {
    try {
      const body = await c.req.json();
      const agent = c.var.agent;
      const response = await server.handleJsonRpc(body, agent);
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

  return router;
}

/**
 * Registriert den Spark-MCP Router auf einer bestehenden Hono-Applikation.
 * Endpunkt: /api/v06/spark-mcp (API_PATHS_V06.sparkMcp).
 */
export function registerSparkMcpRoutes(app: Hono<any>, database?: Database): void {
  const router = createSparkMcpRouter(database);
  app.route(API_PATHS_V06.sparkMcp, router);
}

export default registerSparkMcpRoutes;
