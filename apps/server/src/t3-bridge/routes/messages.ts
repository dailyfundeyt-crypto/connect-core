/**
 * T3-Bridge — Nachrichten & Threads: Hono-Routen (A11)
 *
 * Endpunkte:
 *  - POST /api/t3/agents/:agentId/messages
 *    (Text, Anhänge-IDs von A18, clientMessageId)
 *    -> Thread anlegen/fortsetzen (t3_thread_map), Turn starten über Scheduler (A08)
 *  - GET  /api/t3/agents/:agentId/messages?cursor=
 *    -> Verlauf aus T3-Snapshot (Quelle T3) über alle Kontext-Generationen hinweg
 *  - GET  /api/t3/agents/:agentId/thread
 *    -> Vollständiger Thread-Snapshot nach A01-Vertrag
 */

import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../../auth/guards.js";
import { getT3Flag, type T3ProviderId } from "../contracts.js";
import {
  getGlobalThreadService,
  T3ThreadService,
  type T3MessageRequest,
} from "../threads/index.js";

export type CreateT3MessagesRoutesOptions = {
  service?: T3ThreadService;
  authMiddleware?: MiddlewareHandler<{ Variables: AppVariables }>;
};

/**
 * Erstellt den Hono-Router für T3-Nachrichten und -Verlauf.
 */
export function createT3MessagesRoutes(
  options: CreateT3MessagesRoutesOptions = {},
): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  // Optional: Authentifizierungs-Guard
  if (options.authMiddleware) {
    app.use("*", options.authMiddleware);
  }

  // Feature-Flag-Guard für alle Routen
  app.use("*", async (c, next) => {
    // Falls das Service-Bypass-Flag aktiv ist (Tests), Flag nicht prüfen
    const service = options.service ?? getGlobalThreadService();
    if (service && !service.isBridgeEnabled()) {
      return c.json(
        { error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert." },
        503,
      );
    }
    if (!service && !getT3Flag("bridge")) {
      return c.json(
        { error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert." },
        503,
      );
    }
    await next();
  });

  const getService = () => {
    const svc = options.service ?? getGlobalThreadService();
    if (!svc) {
      throw new Error("T3ThreadService ist nicht initialisiert.");
    }
    return svc;
  };

  /* -------------------------------------------------------------------------------------- *
   * POST /api/t3/agents/:agentId/messages (und /:agentId/messages)
   * -------------------------------------------------------------------------------------- */
  const handleSendMessage = async (c: any) => {
    const agentId = c.req.param("agentId");
    if (!agentId) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return c.json({ error: "Ungültiger oder fehlender JSON-Body" }, 400);
    }

    const text = typeof body.text === "string" ? body.text : "";
    const clientMessageId =
      typeof body.clientMessageId === "string" ? body.clientMessageId : "";
    const attachmentIds = Array.isArray(body.attachmentIds)
      ? (body.attachmentIds as string[]).filter((id) => typeof id === "string")
      : undefined;
    const model = typeof body.model === "string" ? body.model : undefined;
    const provider = typeof body.provider === "string" ? (body.provider as T3ProviderId) : undefined;

    if (!clientMessageId) {
      return c.json({ error: "clientMessageId ist ein Pflichtfeld" }, 400);
    }

    if (!text && (!attachmentIds || attachmentIds.length === 0)) {
      return c.json({ error: "Text oder Anhänge müssen angegeben werden" }, 400);
    }

    try {
      const service = getService();
      const messageReq: T3MessageRequest = {
        agentId,
        text,
        clientMessageId,
        attachmentIds,
        model,
        provider,
      };

      const result = await service.sendMessage(messageReq);
      // Status 202 Accepted (wie Cloud-Agents), Nachricht wurde angenommen und Turn gestartet
      return c.json(result, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  };

  /* -------------------------------------------------------------------------------------- *
   * GET /api/t3/agents/:agentId/messages (und /:agentId/messages)
   * -------------------------------------------------------------------------------------- */
  const handleGetMessages = async (c: any) => {
    const agentId = c.req.param("agentId");
    if (!agentId) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    const cursor = c.req.query("cursor") || undefined;
    const limitStr = c.req.query("limit");
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;

    try {
      const service = getService();
      const history = await service.getMessageHistory(agentId, { cursor, limit });
      return c.json(history, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  };

  /* -------------------------------------------------------------------------------------- *
   * GET /api/t3/agents/:agentId/thread (und /:agentId/thread)
   * -------------------------------------------------------------------------------------- */
  const handleGetThread = async (c: any) => {
    const agentId = c.req.param("agentId");
    if (!agentId) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    try {
      const service = getService();
      const snapshot = await service.getThreadSnapshot(agentId);
      return c.json(snapshot, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: message }, 500);
    }
  };

  // Mount-Variante 1: wenn Router auf /api/t3 gemountet wird
  app.post("/agents/:agentId/messages", handleSendMessage);
  app.get("/agents/:agentId/messages", handleGetMessages);
  app.get("/agents/:agentId/thread", handleGetThread);

  // Mount-Variante 2: wenn Router auf /api/t3/agents oder /t3-agents gemountet wird
  app.post("/:agentId/messages", handleSendMessage);
  app.get("/:agentId/messages", handleGetMessages);
  app.get("/:agentId/thread", handleGetThread);

  return app;
}
