/**
 * T3-Bridge — Turn-Steuerung: Hono-Routen (Lane A13).
 *
 * Endpunkte:
 *  - POST /api/t3-agents/:agentId/control
 *    Body: { action: "interrupt" | "steer" | "queue", text?: string, reason?: string }
 *  - POST /api/t3-agents/:agentId/interrupt
 *    Body: { reason?: string }
 *  - POST /api/t3-agents/:agentId/steer
 *    Body: { text: string } (nur wenn Provider es kann, sonst Warteschlange)
 *  - GET  /api/t3-agents/:agentId/control/capabilities
 *
 * Hinter dem Feature-Flag `bridge` (A01). Ist das Flag aus -> 503 Service Unavailable.
 */

import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../../auth/guards.js";
import { createT3AuthMiddleware } from "../auth/middleware.js";
import type { T3AuthMiddlewareOptions } from "../auth/types.js";
import {
  getT3Flag,
  type T3ControlAction,
  type T3ControlRequest,
  type T3ControlResponse,
} from "../contracts.js";
import {
  getGlobalControlService,
  T3ControlService,
} from "../control/index.js";

export type CreateT3ControlRoutesOptions = {
  readonly service?: T3ControlService;
  readonly authMiddleware?: MiddlewareHandler<{ Variables: AppVariables }>;
  readonly authOptions?: T3AuthMiddlewareOptions;
  /** Standard true. Für Tests abschaltbar. */
  readonly enforceBridgeFlag?: boolean;
};

/**
 * Erzeugt den Hono-Router für Turn-Steuerung.
 */
export function createT3ControlRoutes(
  options: CreateT3ControlRoutesOptions = {},
): Hono<{ Variables: AppVariables }> {
  const router = new Hono<{ Variables: AppVariables }>();
  const enforceFlag = options.enforceBridgeFlag ?? true;

  // 1. Auth-Middleware (Better-Auth / Dev-Bypass)
  if (options.authMiddleware) {
    router.use("*", options.authMiddleware);
  } else {
    router.use("*", createT3AuthMiddleware(options.authOptions));
  }

  // 2. Feature-Flag-Guard für alle Control-Routen
  router.use("*", async (c, next) => {
    const service = options.service ?? getGlobalControlService();
    if (enforceFlag) {
      if (service && !service.isBridgeEnabled()) {
        return c.json(
          {
            error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert.",
            flag: "bridge",
          },
          503,
        );
      }
      if (!service && !getT3Flag("bridge")) {
        return c.json(
          {
            error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert.",
            flag: "bridge",
          },
          503,
        );
      }
    }
    await next();
  });

  const getService = () => options.service ?? getGlobalControlService();

  /* -------------------------------------------------------------------------------------- *
   * Handler-Definitionen
   * -------------------------------------------------------------------------------------- */

  // POST .../control
  const handleControl = async (c: Context<{ Variables: AppVariables }>) => {
    const agentId = c.req.param("agentId");
    if (!agentId) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Ungültiger oder fehlender JSON-Body" }, 400);
    }

    const action = String(body.action || "").toLowerCase() as T3ControlAction;
    if (!["interrupt", "steer", "queue"].includes(action)) {
      return c.json(
        { error: "action muss 'interrupt', 'steer' oder 'queue' sein" },
        400,
      );
    }

    const text = typeof body.text === "string" ? body.text : undefined;
    const reason = typeof body.reason === "string" ? body.reason : undefined;

    const svc = getService();

    if (action === "interrupt") {
      const res = await svc.interrupt(agentId, reason);
      const statusCode = res.ok ? 200 : res.supported ? 500 : 409;
      return c.json(res, statusCode);
    }

    // steer oder queue
    if (!text || !text.trim()) {
      return c.json({ error: "text ist ein Pflichtfeld für steer/queue" }, 400);
    }

    const res = await svc.steer(agentId, text);
    const statusCode = res.ok ? 200 : 409;
    return c.json(res, statusCode);
  };

  // POST .../interrupt
  const handleInterrupt = async (c: Context<{ Variables: AppVariables }>) => {
    const agentId = c.req.param("agentId");
    if (!agentId) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = typeof body?.reason === "string" ? body.reason : undefined;

    const svc = getService();
    const res = await svc.interrupt(agentId, reason);
    const statusCode = res.ok ? 200 : res.supported ? 500 : 409;
    return c.json(res, statusCode);
  };

  // POST .../steer
  const handleSteer = async (c: Context<{ Variables: AppVariables }>) => {
    const agentId = c.req.param("agentId");
    if (!agentId) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const text =
      typeof body?.text === "string"
        ? body.text
        : typeof body?.steer === "string"
          ? body.steer
          : "";

    if (!text || !text.trim()) {
      return c.json({ error: "text ist ein Pflichtfeld für steer" }, 400);
    }

    const svc = getService();
    const res = await svc.steer(agentId, text);
    const statusCode = res.ok ? 200 : 409;
    return c.json(res, statusCode);
  };

  // GET .../capabilities
  const handleCapabilities = async (c: Context<{ Variables: AppVariables }>) => {
    const agentId = c.req.param("agentId");
    if (!agentId) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    const svc = getService();
    const caps = await svc.getCapabilities(agentId);
    return c.json(caps, 200);
  };

  /* -------------------------------------------------------------------------------------- *
   * Routen registrieren (inkl. kanonische Pfade und Aliase)
   * -------------------------------------------------------------------------------------- */

  // Kanonisch nach A01 T3_ROUTES.control ("/t3-agents/:agentId/control")
  router.post("/t3-agents/:agentId/control", handleControl);
  router.post("/t3-agents/:agentId/interrupt", handleInterrupt);
  router.post("/t3-agents/:agentId/steer", handleSteer);
  router.get("/t3-agents/:agentId/control/capabilities", handleCapabilities);
  router.get("/t3-agents/:agentId/capabilities", handleCapabilities);

  // Aliase mit /t3/agents/...
  router.post("/t3/agents/:agentId/control", handleControl);
  router.post("/t3/agents/:agentId/interrupt", handleInterrupt);
  router.post("/t3/agents/:agentId/steer", handleSteer);
  router.get("/t3/agents/:agentId/control/capabilities", handleCapabilities);
  router.get("/t3/agents/:agentId/capabilities", handleCapabilities);

  // Relative Aliase für Mount unter /api/t3-agents oder /api/t3/agents
  router.post("/:agentId/control", handleControl);
  router.post("/:agentId/interrupt", handleInterrupt);
  router.post("/:agentId/steer", handleSteer);
  router.get("/:agentId/control/capabilities", handleCapabilities);
  router.get("/:agentId/capabilities", handleCapabilities);

  return router;
}
