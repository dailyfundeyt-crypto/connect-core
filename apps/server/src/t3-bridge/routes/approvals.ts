/**
 * T3-Bridge — Freigaben (Approvals): Hono-Routen (Lane A13).
 *
 * Endpunkte:
 *  - POST /api/t3-agents/:agentId/approvals/:requestId
 *    Body: { decision: "allow" | "deny" | "allow_always", feedback?: string, answers?: Record<string, string> }
 *    -> Übersetzt auf Wire: accept / decline / acceptAlways
 *    -> Ruft T3 respondToRuntimeRequest auf
 *  - GET  /api/t3-agents/:agentId/approvals
 *    -> Liefert alle noch offenen Freigaben (ConnectChatApprovalItem[])
 *  - POST /api/t3-agents/:agentId/approvals
 *    Body: { requestId: string, decision: ... }
 *
 * Hinter dem Feature-Flag `bridge` (A01). Ist das Flag aus -> 503 Service Unavailable.
 */

import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../../auth/guards.js";
import { createT3AuthMiddleware } from "../auth/middleware.js";
import type { T3AuthMiddlewareOptions } from "../auth/types.js";
import {
  getT3Flag,
  type T3ApprovalDecision,
  type T3ApprovalResponse,
} from "../contracts.js";
import {
  getGlobalControlService,
  T3ControlService,
} from "../control/index.js";

export type CreateT3ApprovalsRoutesOptions = {
  readonly service?: T3ControlService;
  readonly authMiddleware?: MiddlewareHandler<{ Variables: AppVariables }>;
  readonly authOptions?: T3AuthMiddlewareOptions;
  /** Standard true. Für Tests abschaltbar. */
  readonly enforceBridgeFlag?: boolean;
};

/**
 * Erzeugt den Hono-Router für Freigaben (Approvals).
 */
export function createT3ApprovalsRoutes(
  options: CreateT3ApprovalsRoutesOptions = {},
): Hono<{ Variables: AppVariables }> {
  const router = new Hono<{ Variables: AppVariables }>();
  const enforceFlag = options.enforceBridgeFlag ?? true;

  // 1. Auth-Middleware (Better-Auth / Dev-Bypass)
  if (options.authMiddleware) {
    router.use("*", options.authMiddleware);
  } else {
    router.use("*", createT3AuthMiddleware(options.authOptions));
  }

  // 2. Feature-Flag-Guard für alle Approvals-Routen
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

  // POST .../approvals/:requestId
  const handleRespondToApproval = async (
    c: Context<{ Variables: AppVariables }>,
  ) => {
    const agentId = c.req.param("agentId");
    let requestId = c.req.param("requestId");

    if (!agentId) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Ungültiger oder fehlender JSON-Body" }, 400);
    }

    if (!requestId && typeof body.requestId === "string") {
      requestId = body.requestId;
    }

    if (!requestId) {
      return c.json({ error: "requestId fehlt" }, 400);
    }

    const rawDecision = String(body.decision || "").toLowerCase();
    if (!["allow", "deny", "allow_always"].includes(rawDecision)) {
      return c.json(
        {
          error:
            "decision muss 'allow', 'deny' oder 'allow_always' sein",
        },
        400,
      );
    }

    const decision = rawDecision as T3ApprovalDecision;
    const feedback =
      typeof body.feedback === "string" ? body.feedback : undefined;
    const answers =
      body.answers && typeof body.answers === "object"
        ? (body.answers as Record<string, string>)
        : undefined;

    const svc = getService();
    const result: T3ApprovalResponse = await svc.respondToApproval({
      agentId,
      requestId,
      decision,
      feedback,
      answers,
    });

    if (!result.ok) {
      return c.json(result, 400);
    }

    return c.json(result, 200);
  };

  // GET .../approvals (ausstehende Freigaben abrufen)
  const handleGetPendingApprovals = async (
    c: Context<{ Variables: AppVariables }>,
  ) => {
    const agentId = c.req.param("agentId");
    if (!agentId) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    const svc = getService();
    const items = await svc.getPendingApprovals(agentId);
    return c.json({ ok: true, items }, 200);
  };

  /* -------------------------------------------------------------------------------------- *
   * Routen registrieren (Kanonisch nach A01 T3_ROUTES.approvals + Aliase)
   * -------------------------------------------------------------------------------------- */

  // Kanonisch nach A01 T3_ROUTES.approvals ("/t3-agents/:agentId/approvals")
  router.get("/t3-agents/:agentId/approvals", handleGetPendingApprovals);
  router.post("/t3-agents/:agentId/approvals/:requestId", handleRespondToApproval);
  router.post("/t3-agents/:agentId/approvals", handleRespondToApproval);

  // Aliase mit /t3/agents/...
  router.get("/t3/agents/:agentId/approvals", handleGetPendingApprovals);
  router.post("/t3/agents/:agentId/approvals/:requestId", handleRespondToApproval);
  router.post("/t3/agents/:agentId/approvals", handleRespondToApproval);

  // Relative Aliase für Mount unter /api/t3-agents oder /api/t3/agents
  router.get("/:agentId/approvals", handleGetPendingApprovals);
  router.post("/:agentId/approvals/:requestId", handleRespondToApproval);
  router.post("/:agentId/approvals", handleRespondToApproval);

  return router;
}
