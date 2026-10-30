import { Hono } from "hono";
import {
  GetCompanyAppsResponseSchema,
  UpdateCompanyAppsRequestSchema,
  UpdateCompanyAppsResponseSchema,
} from "../../contracts/swarm-v3/api";
import { getCompanyApps, updateCompanyApps } from "./service";

/**
 * Überprüft, ob der Aufrufer Admin-Berechtigungen für das Unternehmen hat.
 * Erlaubt Zugriff im Single-User-Modus (Helium Localhost) sowie für echte Admins.
 */
export function checkCompanyAdmin(c: any): boolean {
  // 1. Single-User / Localhost Launcher Modus
  if (
    process.env.CONNECT_SINGLE_USER === "true" ||
    process.env.CONNECT_SINGLE_USER === "1" ||
    process.env.NODE_ENV !== "production"
  ) {
    return true;
  }

  // 2. Expliziter Actor aus Context
  const actor = c.var?.actor;
  if (actor) {
    return actor.role === "admin";
  }

  // 3. Localhost Host-Header
  const host = c.req.header("host") || "";
  if (host.startsWith("localhost:") || host.startsWith("127.0.0.1:") || host === "localhost") {
    return true;
  }

  return false;
}

/**
 * Erstellt den Router für /api/companies/:id/apps
 */
export function createCompanyAppsRouter(): Hono {
  const router = new Hono();

  // GET / oder GET ""
  const getHandler = async (c: any) => {
    const companyId = c.req.param("id") || c.req.query("companyId");
    if (!companyId) {
      return c.json({ error: "Missing company ID parameter." }, 400);
    }

    if (!checkCompanyAdmin(c)) {
      return c.json({ error: "Unauthorized: Company Admin access required." }, 403);
    }

    try {
      const apps = await getCompanyApps(companyId);
      const payload = {
        success: true,
        companyId,
        apps,
      };
      const response = GetCompanyAppsResponseSchema.parse(payload);
      return c.json(response, 200);
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to retrieve company apps" }, 500);
    }
  };

  // PUT / oder PUT ""
  const putHandler = async (c: any) => {
    const companyId = c.req.param("id") || c.req.query("companyId");
    if (!companyId) {
      return c.json({ error: "Missing company ID parameter." }, 400);
    }

    if (!checkCompanyAdmin(c)) {
      return c.json({ error: "Unauthorized: Company Admin access required." }, 403);
    }

    try {
      const body = await c.req.json().catch(() => null);
      const parsed = UpdateCompanyAppsRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            error: "Validation failed for company apps update.",
            issues: parsed.error.issues,
          },
          400
        );
      }

      const updated = await updateCompanyApps(companyId, parsed.data.apps);
      const payload = {
        success: true,
        updatedCount: parsed.data.apps.length,
        apps: updated,
      };
      const response = UpdateCompanyAppsResponseSchema.parse(payload);
      return c.json(response, 200);
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to update company apps" }, 500);
    }
  };

  router.get("/", getHandler);
  router.get("", getHandler);
  router.put("/", putHandler);
  router.put("", putHandler);

  return router;
}

/**
 * Registriert die Routen auf einer beliebigen Hono-Applikation.
 */
export function registerCompanyAppsRoutes(app: any): void {
  const router = createCompanyAppsRouter();
  app.route("/api/companies/:id/apps", router);
}

export default createCompanyAppsRouter;
