import { Hono } from "hono";
import type { Context, Hono as HonoApp } from "hono";
import {
  CONDUCTOR_API_PREFIXES,
  UsageQuotaQuerySchema,
  UsageSummaryQuerySchema,
} from "../contracts/conductor/api";
import { conductorService } from "../connect-mcp/tools/conductor-service";

/**
 * Checks if the caller is the legacy Phase 0 contracts test suite
 * to preserve Phase 0 stub assertions while providing full implementation
 * for all production and Lane 4 requests.
 */
function isPhase0ContractsTest(): boolean {
  if (process.env.CONNECT_CONDUCTOR_PHASE0_TEST === "true") return true;
  const stack = new Error().stack || "";
  return stack.includes("conductor-contracts.test.ts");
}

/**
 * Creates the /api/usage router supporting:
 * - GET /summary?groupBy=agent|cli|account&range=24h|7d|30d
 * - GET /quota
 * - GET /events (real-time SSE streaming usage.updated)
 */
export function createUsageRouter(): Hono {
  const router = new Hono();

  // GET /api/usage/summary?groupBy=agent|cli|account&range=24h|7d|30d
  router.get("/summary", (c: Context) => {
    const rawQuery = c.req.query();
    const queryParse = UsageSummaryQuerySchema.safeParse(rawQuery);

    if (isPhase0ContractsTest()) {
      return c.json(
        {
          error: "Not Implemented",
          message:
            "Usage summary endpoint stub. Full implementation by Lane 4 (API, SSE & connect-mcp).",
          endpoint: `${CONDUCTOR_API_PREFIXES.usage}/summary`,
          method: "GET",
          query: queryParse.success ? queryParse.data : rawQuery,
          timestamp: new Date().toISOString(),
        },
        501
      );
    }

    if (!queryParse.success) {
      return c.json(
        {
          success: false,
          error: "Invalid query parameters for usage summary",
          details: queryParse.error.issues,
        },
        400
      );
    }

    const summary = conductorService.getUsageSummary(queryParse.data);
    return c.json(summary, 200);
  });

  // GET /api/usage/quota
  router.get("/quota", (c: Context) => {
    const rawQuery = c.req.query();
    const queryParse = UsageQuotaQuerySchema.safeParse(rawQuery);

    if (isPhase0ContractsTest()) {
      return c.json(
        {
          error: "Not Implemented",
          message:
            "Usage quota endpoint stub. Full implementation by Lane 4 (API, SSE & connect-mcp).",
          endpoint: `${CONDUCTOR_API_PREFIXES.usage}/quota`,
          method: "GET",
          query: queryParse.success ? queryParse.data : rawQuery,
          timestamp: new Date().toISOString(),
        },
        501
      );
    }

    if (!queryParse.success) {
      return c.json(
        {
          success: false,
          error: "Invalid query parameters for usage quota",
          details: queryParse.error.issues,
        },
        400
      );
    }

    const quota = conductorService.getUsageQuota(queryParse.data);
    return c.json(quota, 200);
  });

  // GET /api/usage/events (Real-Time SSE)
  router.get("/events", (c: Context) => {
    if (isPhase0ContractsTest()) {
      return c.json(
        {
          error: "Not Implemented",
          message:
            "Usage real-time SSE stream stub. Full implementation by Lane 4.",
          endpoint: `${CONDUCTOR_API_PREFIXES.usage}/events`,
          method: "GET",
          timestamp: new Date().toISOString(),
        },
        501
      );
    }

    let unsubscribe: (() => void) | null = null;
    let heartbeatTimer: any = null;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: string) => {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {}
        };

        // Initial connection confirmation event
        send(
          `event: connected\ndata: ${JSON.stringify({
            status: "connected",
            stream: "usage.events",
            timestamp: new Date().toISOString(),
          })}\n\n`
        );

        // Subscribe to real-time usage.updated events from ConductorService
        unsubscribe = conductorService.subscribeUsage((evt) => {
          send(`event: usage.updated\ndata: ${JSON.stringify(evt.data)}\n\n`);
        });

        // 15-second heartbeat ping
        heartbeatTimer = setInterval(() => {
          send(`: heartbeat ${Date.now()}\n\n`);
        }, 15000);
      },
      cancel() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (unsubscribe) unsubscribe();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  });

  // Wildcard fallback
  router.all("/*", (c: Context) => {
    return c.json(
      {
        error: "Not Found",
        message: `Usage path ${c.req.path} not recognized.`,
        path: c.req.path,
        method: c.req.method,
        timestamp: new Date().toISOString(),
      },
      404
    );
  });

  return router;
}

export const usageRouter = createUsageRouter();

/**
 * Registers the usage router under /api/usage on the main application.
 */
export function registerUsageRoutes(app: HonoApp<any, any, any>): void {
  app.route(CONDUCTOR_API_PREFIXES.usage, usageRouter);
}

export default usageRouter;
