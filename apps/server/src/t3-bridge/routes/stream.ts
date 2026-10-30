/**
 * T3-Bridge / Stream — Hono-Routen (Lane A12).
 *
 * EIGENTÜMER: A12.
 *
 * Endpunkte (jeweils relativ zum Mount `/api`, den A37 setzt):
 *
 *   GET /api/t3-agents/:agentId/stream   → Chat-Events (SSE, mit Last-Event-ID)
 *   GET /api/t3/agents/:agentId/stream   → Alias derselben Route
 *   GET /api/t3/status-stream            → Status-Snapshots (SSE, ohne Chat-Inhalt)
 *
 * Hinter dem Feature-Flag `connect.t3.bridge` (A01): Flag aus → 404, altes
 * Verhalten bleibt unberührt. Zusätzlich schützt die A10-Middleware die Routen
 * (Better-Auth-Session, 401 ohne Anmeldung).
 *
 * Die Routen enthalten bewusst KEINE Stream-Logik: Sichtbarkeit, Budget,
 * Coalescing und Wiederaufnahme liegen im Hub (`../stream/hub.ts`).
 */

import { Hono, type Context } from "hono";
import type { AppVariables } from "../../auth/guards.js";
import { createT3AuthMiddleware } from "../auth/middleware.js";
import type { T3AuthMiddlewareOptions } from "../auth/types.js";
import { getT3Flag } from "../contracts.js";
import { SystemStreamClock } from "../stream/clock.js";
import { normalizeLastEventId, T3StreamHub } from "../stream/hub.js";
import { createSseStream, getT3StreamHub, SSE_HEADERS } from "../stream/index.js";
import { isSafeStreamAgentId } from "../stream/types.js";
import type {
  ChatStreamSink,
  StreamClock,
  StreamReady,
} from "../stream/types.js";

/**
 * Pfade dieser Lane.
 *
 * A01s `T3_ROUTES.stream` lautet `/t3-agents/:agentId/stream` (so ist auch die
 * Nachrichten-Route geschnitten). Der Auftrag nennt zusätzlich
 * `/api/t3/agents/:agentId/stream`; beide Varianten werden bedient, damit weder
 * A21 noch A37 raten muss.
 */
export const T3_STREAM_PATHS = {
  chat: "/t3-agents/:agentId/stream",
  chatAlias: "/t3/agents/:agentId/stream",
  status: "/t3/status-stream",
} as const;

export type CreateT3StreamRoutesOptions = {
  /** Standard: der prozessweite Hub aus `getT3StreamHub()`. */
  readonly hub?: T3StreamHub;
  readonly clock?: StreamClock;
  readonly authOptions?: T3AuthMiddlewareOptions;
  /** Standard true. Nur für isolierte Routentests abschaltbar. */
  readonly enforceBridgeFlag?: boolean;
};

export function createT3StreamRoutes(
  options: CreateT3StreamRoutesOptions = {},
): Hono<{ Variables: AppVariables }> {
  const hub = options.hub ?? getT3StreamHub();
  const clock = options.clock ?? new SystemStreamClock();
  const enforceBridgeFlag = options.enforceBridgeFlag ?? true;
  const authMiddleware = createT3AuthMiddleware(options.authOptions);

  const router = new Hono<{ Variables: AppVariables }>();
  router.use("*", authMiddleware);

  const chatHandler = (context: Context<{ Variables: AppVariables }>) => {
    if (enforceBridgeFlag && !getT3Flag("bridge")) {
      return context.json({ error: "T3 bridge is disabled.", flag: "bridge" }, 404);
    }

    const agentId = (context.req.param("agentId") ?? "").trim();
    if (!agentId) {
      return context.json({ error: "agentId is required." }, 400);
    }
    if (!isSafeStreamAgentId(agentId)) {
      return context.json({ error: "Invalid agentId." }, 400);
    }

    const lastEventId = parseLastEventId(context);

    const stream = createSseStream({
      clock,
      heartbeatMs: hub.config.heartbeatMs,
      signal: context.req.raw.signal,
      onOpen: (send) => {
        const ready: StreamReady = {
          type: "ready",
          stream: "chat",
          agentId,
          lastEventId,
          resumed: lastEventId > 0,
          retryMs: hub.config.retryMs,
          at: new Date(clock.now()).toISOString(),
        };
        send({ event: "ready", retry: hub.config.retryMs, data: ready });

        const sink: ChatStreamSink = {
          onEnvelope: (envelope) =>
            send({ event: "chat", id: envelope.id, data: envelope }),
          onResync: (resync) => send({ event: "resync", data: resync }),
        };

        const subscription = hub.subscribeChat(agentId, { lastEventId, sink });

        if (subscription.resync) {
          send({ event: "resync", data: subscription.resync });
        } else {
          for (const envelope of subscription.replay) {
            send({ event: "chat", id: envelope.id, data: envelope });
          }
        }

        // Erst jetzt Live-Betrieb: was während des Aufbaus eintraf, ist gepuffert.
        subscription.activate();

        return () => subscription.close();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  };

  router.get(T3_STREAM_PATHS.chat, chatHandler);
  router.get(T3_STREAM_PATHS.chatAlias, chatHandler);

  router.get(T3_STREAM_PATHS.status, (context) => {
    if (enforceBridgeFlag && !getT3Flag("bridge")) {
      return context.json({ error: "T3 bridge is disabled.", flag: "bridge" }, 404);
    }

    const stream = createSseStream({
      clock,
      heartbeatMs: hub.config.heartbeatMs,
      signal: context.req.raw.signal,
      onOpen: (send) => {
        const ready: StreamReady = {
          type: "ready",
          stream: "status",
          agentId: null,
          lastEventId: 0,
          resumed: false,
          retryMs: hub.config.retryMs,
          at: new Date(clock.now()).toISOString(),
        };
        send({ event: "ready", retry: hub.config.retryMs, data: ready });

        const subscription = hub.subscribeStatus({
          // Snapshot ist reiner Status; A12 garantiert keinen Chat-Inhalt.
          onSnapshot: (snapshot) => send({ event: "status", data: snapshot }),
        });

        return () => subscription.close();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  });

  return router;
}

/**
 * Hängt die Stream-Routen unter `/api` ein. A37 ruft diese Funktion aus
 * `apps/server/src/t3-bridge/index.ts` bzw. `app.ts` auf (Lane-Grenze: A37).
 */
export function registerT3StreamRoutes(app: Hono<{ Variables: AppVariables }>): void {
  app.route("/api", createT3StreamRoutes());
}

/** `Last-Event-ID` (Header) oder `?lastEventId=` (Query). */
export function parseLastEventId(context: Context): number {
  const header =
    context.req.header("last-event-id") ?? context.req.header("x-last-event-id");
  const query =
    context.req.query("lastEventId") ?? context.req.query("last-event-id");
  return normalizeLastEventId(header ?? query);
}
