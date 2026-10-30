/**
 * BUG-02 Fix: Root-Aufruf von /api/usage (Redirect auf /api/usage/summary)
 *
 * Verhindert 404 Not Found beim Aufruf von GET /api/usage, indem sauber auf
 * die Standard-Uebersicht /api/usage/summary weitergeleitet wird.
 */

import { Hono } from "hono";
import type { Context } from "hono";

/**
 * Behandelt den Root-Aufruf /api/usage und leitet auf /api/usage/summary weiter.
 */
export function handleUsageRoot(c: Context): Response {
  return c.redirect("/api/usage/summary", 302);
}

/**
 * Erstellt einen Hono-Router fuer den Usage-Root-Endpunkt.
 */
export function createUsageRootRouter(): Hono {
  const router = new Hono();

  router.get("/", (c) => handleUsageRoot(c));

  return router;
}

export default createUsageRootRouter;
