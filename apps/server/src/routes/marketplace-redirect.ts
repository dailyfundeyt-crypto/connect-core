/**
 * BUG-09 Fix: Marktplatz-Redirect & Konsolidierung (/market zu /store)
 *
 * Leitet Aufrufe des alten Marktplatz-Pfades (/market, /market/*, /api/market/*)
 * sauber auf das einheitliche Store-System (/store, /api/store/*) weiter.
 */

import { Hono } from "hono";
import type { Context } from "hono";

/**
 * Erstellt den Hono-Router fuer Marketplace-Redirects auf den Store.
 */
export function createMarketplaceRedirectRouter(): Hono {
  const router = new Hono();

  // Root /market -> /store
  router.get("/", (c: Context) => {
    return c.redirect("/store", 301);
  });

  // Unterpfade /market/* -> /store/*
  router.get("/*", (c: Context) => {
    const rawPath = c.req.path;
    const suffix = rawPath.replace(/^\/(?:api\/)?market\/?/, "");
    const target = suffix ? `/store/${suffix}` : "/store";

    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({
        ok: true,
        redirected: true,
        target,
        message: "Marktplatz wurde in den Store konsolidiert.",
      }, 301);
    }

    return c.redirect(target, 301);
  });

  return router;
}

/**
 * Registriert die Marketplace-Redirects auf der Server-Applikation.
 */
export function registerMarketplaceRedirectRoutes(app: { route: (path: string, sub: Hono) => unknown }): void {
  const router = createMarketplaceRedirectRouter();
  app.route("/market", router);
  app.route("/api/market", router);
}

export default createMarketplaceRedirectRouter;
