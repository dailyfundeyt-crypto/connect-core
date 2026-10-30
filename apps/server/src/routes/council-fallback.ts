/**
 * BUG-08 Fix: Fallback-Route für /api/council (Root-404 Behebung)
 *
 * Verhindert 404 Not Found beim direkten Aufruf von GET /api/council, indem ein
 * sauberer Status-Endpunkt mit Modul- und Endpunkt-Informationen ausgeliefert wird.
 */

import { Hono } from "hono";
import type { Context } from "hono";

/**
 * Antwortstruktur fuer den Council-Root-Endpunkt.
 */
export function handleCouncilRoot(c: Context): Response {
  return c.json({
    status: "ok",
    council: true,
    module: "council",
    lane: "Lane 6 (Roast-Room Council Engine)",
    description: "Multi-Agenten-Debatten- und Abstimmungsplattform",
    endpoints: {
      health: "/api/council/health",
      sessions: "/api/council/sessions",
      chairAnalyze: "/api/council/chair/analyze",
    },
    timestamp: new Date().toISOString(),
  }, 200);
}

/**
 * Erstellt den Hono-Router fuer den Council-Root-Fallback.
 */
export function createCouncilFallbackRouter(): Hono {
  const router = new Hono();

  router.get("/", (c) => handleCouncilRoot(c));

  return router;
}

/**
 * Registriert die Council-Fallback-Route auf der Hauptanwendung.
 */
export function registerCouncilFallbackRoutes(app: { route: (path: string, sub: Hono) => unknown }): void {
  const router = createCouncilFallbackRouter();
  app.route("/api/council", router);
}

export default createCouncilFallbackRouter;
