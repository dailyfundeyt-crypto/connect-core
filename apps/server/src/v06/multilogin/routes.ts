import type { Hono as HonoApp } from "hono";
import { Hono } from "hono";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import { getMultiLoginApps, buildMultiLoginRegistry } from "./registry";

/**
 * Erzeugt einen dedizierten Hono-Router fuer Multi-Login v06 Endpunkte.
 */
export function createMultiLoginRoutes(): Hono {
  const router = new Hono();

  // GET /apps (oder gemountet auf Root)
  router.get("/apps", (c) => {
    const apps = getMultiLoginApps();
    return c.json(apps);
  });

  return router;
}

/**
 * Registriert die v06 Multi-Login-Routen direkt auf der Haupt-Hono-App.
 * Wird vom Integrations-Agenten (A11) eingebunden.
 *
 * Stellt bereit:
 * GET /api/v06/multilogin/apps -> MultiLoginAppDef[]
 */
export function registerMultiLoginRoutes(app: HonoApp<any, any, any>): void {
  // GET /api/v06/multilogin/apps
  app.get(API_PATHS_V06.multiLoginApps, (c) => {
    const showAll = c.req.query("all") === "true";
    if (showAll) {
      // Optionale Diagnoseansicht aller registrierten Apps
      return c.json(buildMultiLoginRegistry());
    }

    const apps = getMultiLoginApps();
    return c.json(apps);
  });
}

export default registerMultiLoginRoutes;
