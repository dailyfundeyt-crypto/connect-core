/**
 * T3-Bridge — Hono-Routen der Handy-Kopplung (Lane A34).
 *
 * Relativ zum Mount-Punkt von A37. Vorschlag: `/api/t3/mobile`.
 *
 *   GET  /status                  Status + gekoppelte Geräte (ohne Token)
 *   POST /pair                    Einmal-Code + QR erzeugen (nur sicher)
 *   POST /pair/redeem             Code vom Handy einlösen (einmalig)
 *   GET  /devices                 Geräteliste (ohne Credentials)
 *   POST /devices/:id/revoke      Gerät abmelden (kein Löschen)
 *   GET  /me                      Geräte-Credential prüfen (Bearer)
 *
 * Auth-Aufteilung:
 *  - PC-Routen (`/status`, `/pair`, `/devices`, `/devices/:id/revoke`) bekommen
 *    die Better-Auth-Middleware aus A10.
 *  - Handy-Routen (`/pair/redeem`, `/me`) authentifizieren sich über den
 *    Einmal-Code bzw. das Geräte-Credential und dürfen **nicht** von einer
 *    Browser-Session-Middleware umschlossen werden.
 *
 * Feature-Flag: `connect.t3.bridge` (A01). Flag aus → 404, altes Verhalten.
 */

import { type Context, Hono, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../../auth/guards.js";
import { getT3Flag } from "../contracts.js";
import { isSameOriginRequest, resolveMobileBaseUrl } from "./secure.js";
import {
  createMobilePairingService,
  type MobilePairingService,
} from "./service.js";

export const T3_MOBILE_ROUTES = {
  status: "/status",
  pair: "/pair",
  redeem: "/pair/redeem",
  devices: "/devices",
  revoke: "/devices/:deviceId/revoke",
  me: "/me",
} as const;

export type CreateT3MobileRoutesOptions = {
  /** Injizierbarer Dienst (Tests); Standard ist die Datei-Ablage. */
  service?: MobilePairingService;
  /** Better-Auth-Middleware aus A10 (nur für PC-Routen). */
  authMiddleware?: MiddlewareHandler<{ Variables: AppVariables }>;
  /** Für Vorschauen/Tests: Flag-Prüfung überspringen. */
  enableFlagBypass?: boolean;
  /** Explizite Adresse aus `CONNECT_MOBILE_BASE_URL` (Standard: Umgebung). */
  configuredBaseUrl?: string | null;
};

type MobileContext = Context<{ Variables: AppVariables }>;

function configuredBaseUrl(
  options: CreateT3MobileRoutesOptions,
): string | null {
  if (options.configuredBaseUrl !== undefined) return options.configuredBaseUrl;
  return process.env.CONNECT_MOBILE_BASE_URL?.trim() || null;
}

function resolveFor(
  context: MobileContext,
  options: CreateT3MobileRoutesOptions,
) {
  return resolveMobileBaseUrl({
    requestUrl: context.req.url,
    host: context.req.header("host") ?? null,
    forwardedProto: context.req.header("x-forwarded-proto") ?? null,
    forwardedHost: context.req.header("x-forwarded-host") ?? null,
    configured: configuredBaseUrl(options),
  });
}

function isSameOrigin(context: MobileContext): boolean {
  return isSameOriginRequest({
    origin: context.req.header("origin") ?? null,
    requestUrl: context.req.url,
    host: context.req.header("host") ?? null,
    forwardedHost: context.req.header("x-forwarded-host") ?? null,
  });
}

function bearerToken(header: string | undefined | null): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? "");
  return match?.[1]?.trim() || null;
}

export function createT3MobileRoutes(
  options: CreateT3MobileRoutesOptions = {},
): Hono<{ Variables: AppVariables }> {
  const router = new Hono<{ Variables: AppVariables }>();
  const service = options.service ?? createMobilePairingService();
  const requireSession = options.authMiddleware;

  // Flag-Gate + Cache-Schutz vor allen Antworten.
  router.use("*", async (context, next) => {
    if (!options.enableFlagBypass && !getT3Flag("bridge")) {
      return context.json(
        { error: "T3 bridge is disabled.", flag: "bridge" },
        404,
      );
    }
    context.header("Cache-Control", "no-store, no-cache, must-revalidate");
    context.header("Pragma", "no-cache");
    return next();
  });

  // PC-Routen: Browser-Session aus A10.
  if (requireSession) {
    router.use(T3_MOBILE_ROUTES.status, requireSession);
    router.use(T3_MOBILE_ROUTES.pair, requireSession);
    router.use(T3_MOBILE_ROUTES.devices, requireSession);
    router.use("/devices/*", requireSession);
  }

  router.get(T3_MOBILE_ROUTES.status, async (context) => {
    const status = await service.status(resolveFor(context, options));
    return context.json(status);
  });

  router.post(T3_MOBILE_ROUTES.pair, async (context) => {
    if (!isSameOrigin(context)) {
      return context.json({ error: "Fremder Origin ist nicht erlaubt." }, 403);
    }

    let label: string | null = null;
    try {
      const body = (await context.req.json()) as { label?: unknown } | null;
      if (body && typeof body.label === "string") label = body.label;
    } catch {
      // Leerer Body ist erlaubt.
    }

    const resolved = resolveFor(context, options);
    const result = service.startPairing({
      baseUrl: resolved.baseUrl,
      secure: resolved.secure,
      label,
    });

    if (!result.ok) {
      const status = result.reason === "rate_limited" ? 429 : 409;
      return context.json(
        { error: result.message, reason: result.reason },
        status,
      );
    }

    return context.json(result.pairing, 201);
  });

  router.post(T3_MOBILE_ROUTES.redeem, async (context) => {
    if (!isSameOrigin(context)) {
      return context.json({ error: "Fremder Origin ist nicht erlaubt." }, 403);
    }

    if (!resolveFor(context, options).secure) {
      return context.json(
        {
          error:
            "Kopplung nur über HTTPS oder diesen PC. Bitte die sichere Adresse des PCs verwenden.",
          reason: "insecure",
        },
        409,
      );
    }

    let body: { token?: unknown; label?: unknown } | null = null;
    try {
      body = (await context.req.json()) as {
        token?: unknown;
        label?: unknown;
      } | null;
    } catch {
      body = null;
    }
    const token = typeof body?.token === "string" ? body.token : "";
    const label = typeof body?.label === "string" ? body.label : null;

    const result = await service.redeem({ token, label });
    if (!result.ok) {
      const status =
        result.reason === "expired"
          ? 410
          : result.reason === "used"
            ? 409
            : result.reason === "insecure"
              ? 403
              : 404;
      return context.json(
        { error: result.message, reason: result.reason },
        status,
      );
    }

    return context.json(result);
  });

  router.get(T3_MOBILE_ROUTES.devices, async (context) => {
    const status = await service.status(resolveFor(context, options));
    return context.json({ devices: status.devices });
  });

  router.post(T3_MOBILE_ROUTES.revoke, async (context) => {
    if (!isSameOrigin(context)) {
      return context.json({ error: "Fremder Origin ist nicht erlaubt." }, 403);
    }
    const revoked = await service.revoke(context.req.param("deviceId"));
    if (!revoked) return context.json({ error: "Gerät nicht gefunden." }, 404);
    return context.json({ ok: true });
  });

  router.get(T3_MOBILE_ROUTES.me, async (context) => {
    const credential = bearerToken(context.req.header("authorization"));
    if (!credential) {
      return context.json({ error: "Geräte-Credential fehlt." }, 401);
    }
    const device = await service.authenticate(credential);
    if (!device) {
      return context.json({ error: "Gerät ist nicht (mehr) gekoppelt." }, 401);
    }
    return context.json({ device });
  });

  return router;
}
