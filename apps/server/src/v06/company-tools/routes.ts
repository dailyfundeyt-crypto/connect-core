import type { Hono as HonoApp, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import { getFlag } from "../../contracts/v06/flags";
import { listCompanyToolsWithToggles, setCompanyToolToggleState } from "./service";

/**
 * Prueft Authentifizierung und Berechtigung fuer Firmen-Operationen.
 * Unterstuetzt:
 * 1. Single-User / Localhost Launcher Modus
 * 2. Gesetzten context actor (aus requireUser)
 * 3. Localhost Host-Header
 */
export function checkCompanyOwnerOrAdmin(c: any): boolean {
  if (
    process.env.CONNECT_SINGLE_USER === "true" ||
    process.env.CONNECT_SINGLE_USER === "1" ||
    process.env.NODE_ENV !== "production"
  ) {
    return true;
  }

  const actor = c.var?.actor;
  if (actor) {
    // Eingeloggter Benutzer / Admin / Besitzer
    return true;
  }

  const host = c.req.header("host") || "";
  if (host.startsWith("localhost:") || host.startsWith("127.0.0.1:") || host === "localhost") {
    return true;
  }

  return false;
}

export interface CompanyToolsRouteOptions {
  requireUser?: MiddlewareHandler<any>;
  dbOverride?: any;
}

/**
 * Erstellt einen Hono-Router fuer /api/v06/companies/:id/tools
 */
export function createCompanyToolsRouter(options: CompanyToolsRouteOptions = {}): Hono {
  const router = new Hono();

  if (options.requireUser) {
    router.use("*", options.requireUser);
  }

  // GET /api/v06/companies/:id/tools
  router.get("/:id/tools", async (c) => {
    if (!getFlag("companyTools")) {
      return c.json({ error: "Feature 'companyTools' is currently disabled." }, 404);
    }

    const companyId = c.req.param("id");
    if (!companyId) {
      return c.json({ error: "Missing company ID parameter." }, 400);
    }

    if (!checkCompanyOwnerOrAdmin(c)) {
      return c.json({ error: "Unauthorized: Company access required." }, 403);
    }

    try {
      const tools = await listCompanyToolsWithToggles(companyId, options.dbOverride);
      return c.json(tools, 200);
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to list company tools" }, 500);
    }
  });

  // Handler fuer PUT & POST Toggle-Update
  const updateToggleHandler = async (c: any) => {
    if (!getFlag("companyTools")) {
      return c.json({ error: "Feature 'companyTools' is currently disabled." }, 404);
    }

    const companyId = c.req.param("id");
    if (!companyId) {
      return c.json({ error: "Missing company ID parameter." }, 400);
    }

    if (!checkCompanyOwnerOrAdmin(c)) {
      return c.json({ error: "Unauthorized: Company access required." }, 403);
    }

    try {
      const body = await c.req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid JSON body." }, 400);
      }

      const toolId = body.toolId || body.id;
      if (!toolId || typeof toolId !== "string") {
        return c.json({ error: "Field 'toolId' is required." }, 400);
      }

      if (typeof body.enabled !== "boolean") {
        return c.json({ error: "Field 'enabled' (boolean) is required." }, 400);
      }

      const toggle = await setCompanyToolToggleState(
        companyId,
        toolId,
        body.enabled,
        options.dbOverride,
      );

      return c.json({ ok: true, toggle }, 200);
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to update company tool toggle" }, 500);
    }
  };

  router.put("/:id/tools", updateToggleHandler);
  router.post("/:id/tools", updateToggleHandler);

  return router;
}

/**
 * Registriert die Company-Tools-Routen direkt auf der Haupt-App.
 * Exporte fuer A11 (Integrator): registerCompanyToolsRoutes(app)
 */
export function registerCompanyToolsRoutes(
  app: HonoApp<any, any, any>,
  options: CompanyToolsRouteOptions = {},
): void {
  const handlerGet = async (c: any) => {
    if (!getFlag("companyTools")) {
      return c.json({ error: "Feature 'companyTools' is currently disabled." }, 404);
    }

    const companyId = c.req.param("id");
    if (!companyId) {
      return c.json({ error: "Missing company ID parameter." }, 400);
    }

    if (!checkCompanyOwnerOrAdmin(c)) {
      return c.json({ error: "Unauthorized: Company access required." }, 403);
    }

    try {
      const tools = await listCompanyToolsWithToggles(companyId, options.dbOverride);
      return c.json(tools, 200);
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to list company tools" }, 500);
    }
  };

  const handlerPut = async (c: any) => {
    if (!getFlag("companyTools")) {
      return c.json({ error: "Feature 'companyTools' is currently disabled." }, 404);
    }

    const companyId = c.req.param("id");
    if (!companyId) {
      return c.json({ error: "Missing company ID parameter." }, 400);
    }

    if (!checkCompanyOwnerOrAdmin(c)) {
      return c.json({ error: "Unauthorized: Company access required." }, 403);
    }

    try {
      const body = await c.req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid JSON body." }, 400);
      }

      const toolId = body.toolId || body.id;
      if (!toolId || typeof toolId !== "string") {
        return c.json({ error: "Field 'toolId' is required." }, 400);
      }

      if (typeof body.enabled !== "boolean") {
        return c.json({ error: "Field 'enabled' (boolean) is required." }, 400);
      }

      const toggle = await setCompanyToolToggleState(
        companyId,
        toolId,
        body.enabled,
        options.dbOverride,
      );

      return c.json({ ok: true, toggle }, 200);
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to update company tool toggle" }, 500);
    }
  };

  const pattern = API_PATHS_V06.companyToolsPattern;
  if (options.requireUser) {
    app.get(pattern, options.requireUser, handlerGet);
    app.put(pattern, options.requireUser, handlerPut);
    app.post(pattern, options.requireUser, handlerPut);
  } else {
    app.get(pattern, handlerGet);
    app.put(pattern, handlerPut);
    app.post(pattern, handlerPut);
  }
}

export default registerCompanyToolsRoutes;
