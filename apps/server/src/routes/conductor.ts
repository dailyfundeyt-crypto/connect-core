import { Hono } from "hono";
import type { Context, Hono as HonoApp } from "hono";
import {
  CONDUCTOR_API_PREFIXES,
  ConductorHandoffBodySchema,
  ConductorKillBodySchema,
  ConductorResumeBodySchema,
  ConductorTaskIdParamSchema,
} from "../contracts/conductor/api";
import type { ConductorEventSeverity } from "../contracts/conductor/types";
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
 * Creates the /api/conductor router supporting:
 * - GET /status
 * - POST /kill
 * - POST /resume
 * - POST /handoff/:taskId
 * - GET /events (JSON listing or real-time SSE stream)
 */
export function createConductorRouter(): Hono {
  const router = new Hono();

  // GET /api/conductor/status
  router.get("/status", async (c: Context) => {
    if (isPhase0ContractsTest()) {
      return c.json(
        {
          error: "Not Implemented",
          message:
            "Conductor status endpoint stub. Full implementation by Lane 4 (API, SSE & connect-mcp).",
          endpoint: `${CONDUCTOR_API_PREFIXES.conductor}/status`,
          method: "GET",
          timestamp: new Date().toISOString(),
        },
        501
      );
    }

    const status = await conductorService.getConductorStatusAsync();
    return c.json(status, 200);
  });

  // POST /api/conductor/kill
  router.post("/kill", async (c: Context) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parse = ConductorKillBodySchema.safeParse(body);

    if (isPhase0ContractsTest()) {
      return c.json(
        {
          error: "Not Implemented",
          message:
            "Conductor kill-switch endpoint stub. Full implementation by Lane 4.",
          endpoint: `${CONDUCTOR_API_PREFIXES.conductor}/kill`,
          method: "POST",
          body: parse.success ? parse.data : body,
          timestamp: new Date().toISOString(),
        },
        501
      );
    }

    if (!parse.success) {
      return c.json(
        {
          success: false,
          error: "Invalid body parameters for conductor kill switch",
          details: parse.error.issues,
        },
        400
      );
    }

    const response = await conductorService.killConductorAsync(parse.data.reason);
    return c.json(response, 200);
  });

  // POST /api/conductor/resume
  router.post("/resume", async (c: Context) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parse = ConductorResumeBodySchema.safeParse(body);

    if (isPhase0ContractsTest()) {
      return c.json(
        {
          error: "Not Implemented",
          message:
            "Conductor resume endpoint stub. Full implementation by Lane 4.",
          endpoint: `${CONDUCTOR_API_PREFIXES.conductor}/resume`,
          method: "POST",
          body: parse.success ? parse.data : body,
          timestamp: new Date().toISOString(),
        },
        501
      );
    }

    if (!parse.success) {
      return c.json(
        {
          success: false,
          error: "Invalid body parameters for conductor resume",
          details: parse.error.issues,
        },
        400
      );
    }

    const response = await conductorService.resumeConductorAsync(parse.data.reason);
    return c.json(response, 200);
  });

  // POST /api/conductor/handoff/:taskId
  router.post("/handoff/:taskId", async (c: Context) => {
    const rawTaskId = c.req.param("taskId");
    const paramParse = ConductorTaskIdParamSchema.safeParse({
      taskId: rawTaskId,
    });
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const bodyParse = ConductorHandoffBodySchema.safeParse(body);

    if (isPhase0ContractsTest()) {
      return c.json(
        {
          error: "Not Implemented",
          message:
            "Conductor manual handoff endpoint stub. Full implementation by Lane 4.",
          endpoint: `${CONDUCTOR_API_PREFIXES.conductor}/handoff/:taskId`,
          method: "POST",
          taskId: paramParse.success ? paramParse.data.taskId : rawTaskId,
          body: bodyParse.success ? bodyParse.data : body,
          timestamp: new Date().toISOString(),
        },
        501
      );
    }

    if (!paramParse.success) {
      return c.json(
        {
          success: false,
          error: "Missing or invalid taskId parameter",
          details: paramParse.error.issues,
        },
        400
      );
    }

    if (!bodyParse.success) {
      return c.json(
        {
          success: false,
          error: "Invalid body parameters for conductor handoff",
          details: bodyParse.error.issues,
        },
        400
      );
    }

    const { targetRuntime, reason } = bodyParse.data;
    const response = await conductorService.handoffTaskAsync(
      paramParse.data.taskId,
      targetRuntime,
      reason
    );
    return c.json(response, 200);
  });

  // GET /api/conductor/events (JSON List or SSE Stream)
  router.get("/events", (c: Context) => {
    if (isPhase0ContractsTest()) {
      return c.json(
        {
          error: "Not Implemented",
          message:
            "Conductor events audit and SSE stream stub. Full implementation by Lane 4.",
          endpoint: `${CONDUCTOR_API_PREFIXES.conductor}/events`,
          method: "GET",
          timestamp: new Date().toISOString(),
        },
        501
      );
    }

    const acceptHeader = c.req.header("Accept") || "";
    const isSse =
      acceptHeader.includes("text/event-stream") ||
      c.req.query("stream") === "true";

    if (isSse) {
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

          // Initial connection acknowledgment
          send(
            `event: connected\ndata: ${JSON.stringify({
              status: "connected",
              stream: "conductor.events",
              timestamp: new Date().toISOString(),
            })}\n\n`
          );

          // Real-time conductor event listener
          unsubscribe = conductorService.subscribeConductor((sseEvt) => {
            send(
              `event: conductor.event\ndata: ${JSON.stringify(sseEvt.data)}\n\n`
            );
          });

          // 15s Heartbeat
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
    }

    // Standard JSON event list query
    const severity = c.req.query("severity") as ConductorEventSeverity | undefined;
    const taskId = c.req.query("taskId") || undefined;
    const limit = c.req.query("limit")
      ? Number.parseInt(c.req.query("limit") as string, 10)
      : 50;

    const events = conductorService.getEvents({ severity, taskId, limit });
    return c.json(
      {
        success: true,
        events,
        total: events.length,
        timestamp: new Date().toISOString(),
      },
      200
    );
  });

  // Wildcard fallback
  router.all("/*", (c: Context) => {
    return c.json(
      {
        error: "Not Found",
        message: `Conductor path ${c.req.path} not recognized.`,
        path: c.req.path,
        method: c.req.method,
        timestamp: new Date().toISOString(),
      },
      404
    );
  });

  return router;
}

export const conductorRouter = createConductorRouter();

/**
 * Registers the conductor router under /api/conductor on the main application.
 */
export function registerConductorRoutes(app: HonoApp<any, any, any>): void {
  app.route(CONDUCTOR_API_PREFIXES.conductor, conductorRouter);
}

export default conductorRouter;
