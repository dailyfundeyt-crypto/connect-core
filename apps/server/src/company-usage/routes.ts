/**
 * T3-Bridge — Company Usage & Leaderboard Hono Routes (A20)
 *
 * Lane: A20 (Welle W2)
 *
 * Endpunkte:
 *  - GET /api/companies/:id/public-usage
 *    Öffentliche Token-Summen (Allowlist, stündlich gecacht).
 *    Wenn public=false -> 404 Not Found.
 *    Kosten nur, wenn showCost=true.
 *  - PUT /api/companies/:id/usage-visibility
 *    { public?: boolean, showCost?: boolean }
 *    Nur für Firmen-Admins -> sonst 403 Forbidden.
 *  - GET /api/companies/:id/usage-visibility
 *    Aktuelle Sichtbarkeits-Einstellungen (für Firmen-Admins).
 *  - GET /api/leaderboard/tokens?range=7d|30d|all&limit=100&offset=0
 *    Globale Sieger-Tabelle mit Wettkampf-Rangfolge (1, 1, 3).
 *    Nur Firmen mit public=true und Tokens > 0.
 *    Eigener Rang des Aufrufers in viewerCompanyRank.
 *    Allowlist: rank, companyId, companyName, logoUrl, tokens.
 *
 * Schutz:
 *  - Rate-Limiter auf öffentlichen GET-Routen.
 *  - Feature-Flag: Hinter `companyPublicUsage` bzw. `bridge` (Flag aus -> 404).
 */

import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";
import { getT3Flag } from "../t3-bridge/contracts";
import { MemoryRateLimiter, type RateLimiterOptions } from "./rate-limiter";
import {
  CompanyUsageService,
  createCompanyUsageService,
  type CompanyUsageServiceOptions,
} from "./service";
import type { UsageRange } from "./types";

export type CreateCompanyUsageRoutesOptions = CompanyUsageServiceOptions & {
  service?: CompanyUsageService;
  authMiddleware?: MiddlewareHandler<{ Variables: AppVariables }>;
  rateLimiter?: MemoryRateLimiter;
  rateLimiterOptions?: RateLimiterOptions;
  enableFlagBypass?: boolean;
  /** Benutzerdefinierter Admin-Check (z. B. für Tests). */
  checkAdmin?: (c: Context) => boolean | Promise<boolean>;
};

/**
 * Standard-Admin-Prüfung für Firmen-Admins.
 * Kompatibel mit Single-User-Modus, Tests und Better-Auth Rollen.
 */
export async function defaultCheckCompanyAdmin(
  c: Context,
  customCheck?: (c: Context) => boolean | Promise<boolean>,
): Promise<boolean> {
  if (customCheck) {
    return Boolean(await customCheck(c));
  }

  // 1. Single-User / Localhost Launcher Modus
  if (
    process.env.CONNECT_SINGLE_USER === "true" ||
    process.env.CONNECT_SINGLE_USER === "1" ||
    process.env.NODE_ENV !== "production"
  ) {
    // Falls ein expliziter non-admin Actor simuliert wird:
    const actor = (c as any).var?.actor;
    if (actor && actor.role && actor.role !== "admin") {
      return false;
    }
    // Falls ein Header x-test-role=user übergeben wird (für isolierte HTTP-Tests):
    const testRole = c.req.header("x-test-role");
    if (testRole && testRole !== "admin") {
      return false;
    }
    return true;
  }

  // 2. Expliziter Actor aus Context (Better Auth / guards.ts)
  const actor = (c as any).var?.actor;
  if (actor) {
    return actor.role === "admin";
  }

  // 3. Localhost Host-Header
  const host = c.req.header("host") || "";
  if (
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host === "localhost"
  ) {
    return true;
  }

  return false;
}

/**
 * Erstellt den Hono-Router für Company-Usage und Leaderboard.
 */
export function createCompanyUsageRoutes(
  options: CreateCompanyUsageRoutesOptions = {},
): Hono<{ Variables: AppVariables }> {
  const router = new Hono<{ Variables: AppVariables }>();
  const service = options.service ?? createCompanyUsageService(options);
  const rateLimiter =
    options.rateLimiter ?? new MemoryRateLimiter(options.rateLimiterOptions);

  // Optional: Auth-Middleware voranstellen
  if (options.authMiddleware) {
    router.use("*", options.authMiddleware);
  }

  /**
   * Feature-Flag Guard:
   * Prüft `companyPublicUsage` oder `bridge`.
   * Bei inaktivem Flag: HTTP 404 (Route existiert im Alt-Zustand nicht).
   */
  const flagGuard: MiddlewareHandler = async (c, next) => {
    const active =
      options.enableFlagBypass ||
      getT3Flag("companyPublicUsage") ||
      getT3Flag("bridge");

    if (!active) {
      return c.json({ error: "Feature not found" }, 404);
    }
    return next();
  };

  // Flag-Guard global auf alle Endpunkte anwenden
  router.use("*", flagGuard);

  // ---------------------------------------------------------------------------
  // 1. GET /api/companies/:id/public-usage
  //    (Auch gemountet auf /companies/:id/public-usage)
  // ---------------------------------------------------------------------------
  const handlePublicUsage = async (c: Context) => {
    const companyId = c.req.param("id") || c.req.param("companyId");
    if (!companyId || companyId.trim() === "") {
      return c.json({ error: "Missing company ID parameter." }, 400);
    }

    const rawDays = parseInt(c.req.query("windowDays") ?? "30", 10);
    const windowDays = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 30;

    const usage = await service.getPublicUsage(companyId, { windowDays });

    // Wenn die Firma public=false gewählt hat: 404 Not Found!
    if (!usage) {
      return c.json(
        { error: "Company usage is private or not found." },
        404,
      );
    }

    return c.json(usage, 200);
  };

  router.get(
    "/companies/:id/public-usage",
    rateLimiter.middleware(),
    handlePublicUsage,
  );
  router.get(
    "/api/companies/:id/public-usage",
    rateLimiter.middleware(),
    handlePublicUsage,
  );

  // ---------------------------------------------------------------------------
  // 2. PUT /api/companies/:id/usage-visibility
  //    (Nur für Firmen-Admins)
  // ---------------------------------------------------------------------------
  const handleUpdateVisibility = async (c: Context) => {
    const companyId = c.req.param("id") || c.req.param("companyId");
    if (!companyId || companyId.trim() === "") {
      return c.json({ error: "Missing company ID parameter." }, 400);
    }

    const isAdmin = await defaultCheckCompanyAdmin(c, options.checkAdmin);
    if (!isAdmin) {
      return c.json(
        { error: "Unauthorized: Company Admin access required." },
        403,
      );
    }

    let body: any = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON payload." }, 400);
    }

    const patch: { public?: boolean; showCost?: boolean } = {};
    if (typeof body.public === "boolean") patch.public = body.public;
    if (typeof body.showCost === "boolean") patch.showCost = body.showCost;

    const updated = await service.updateVisibility(companyId, patch);

    return c.json(
      {
        success: true,
        settings: updated,
      },
      200,
    );
  };

  router.put("/companies/:id/usage-visibility", handleUpdateVisibility);
  router.put("/api/companies/:id/usage-visibility", handleUpdateVisibility);

  // ---------------------------------------------------------------------------
  // 3. GET /api/companies/:id/usage-visibility
  //    (Einstellungen für Firmen-Admins abrufen)
  // ---------------------------------------------------------------------------
  const handleGetVisibility = async (c: Context) => {
    const companyId = c.req.param("id") || c.req.param("companyId");
    if (!companyId || companyId.trim() === "") {
      return c.json({ error: "Missing company ID parameter." }, 400);
    }

    const isAdmin = await defaultCheckCompanyAdmin(c, options.checkAdmin);
    if (!isAdmin) {
      return c.json(
        { error: "Unauthorized: Company Admin access required." },
        403,
      );
    }

    const settings = await service.getSettings(companyId);
    return c.json(settings, 200);
  };

  router.get("/companies/:id/usage-visibility", handleGetVisibility);
  router.get("/api/companies/:id/usage-visibility", handleGetVisibility);

  // ---------------------------------------------------------------------------
  // 4. GET /api/leaderboard/tokens
  //    (Auch gemountet auf /leaderboard/tokens)
  // ---------------------------------------------------------------------------
  const handleLeaderboard = async (c: Context) => {
    const query = c.req.query();

    // 1. Zeitraum validieren ("7d" | "30d" | "all", Standard: "30d")
    let range: UsageRange = "30d";
    if (query.range === "7d" || query.range === "30d" || query.range === "all") {
      range = query.range;
    }

    // 2. Limit & Offset
    const rawLimit = parseInt(query.limit ?? "100", 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 100;

    const rawOffset = parseInt(query.offset ?? "0", 10);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    // 3. Aufrufer-Firma ermitteln (aus Query, Header oder Actor)
    const viewerCompanyId =
      query.viewerCompanyId?.trim() ||
      query.companyId?.trim() ||
      c.req.header("x-company-id")?.trim() ||
      (c as any).var?.actor?.companyId ||
      undefined;

    const response = await service.getLeaderboard({
      range,
      limit,
      offset,
      viewerCompanyId,
    });

    // Optionale Header für Clients
    c.header("X-Total-Count", String(response.total));
    if (response.viewerCompanyRank) {
      c.header(
        "X-Viewer-Company-Rank",
        String(response.viewerCompanyRank.rank),
      );
    }

    // Falls ein Client explizit ein flaches Array anfordert:
    if (
      query.format === "array" ||
      c.req.header("accept") === "application/vnd.connect.array+json"
    ) {
      return c.json(response.entries, 200);
    }

    return c.json(response, 200);
  };

  router.get(
    "/leaderboard/tokens",
    rateLimiter.middleware(),
    handleLeaderboard,
  );
  router.get(
    "/api/leaderboard/tokens",
    rateLimiter.middleware(),
    handleLeaderboard,
  );

  return router;
}
