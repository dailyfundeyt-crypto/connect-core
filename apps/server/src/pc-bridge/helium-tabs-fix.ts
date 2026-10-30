/**
 * BUG-01 Fix: Helium Tabs Endpunkt (/api/pc-bridge/helium/tabs)
 *
 * Stellt die REST-Schnittstelle bereit, um die vom Helium-Browser gemeldeten Tabs
 * als JSON-Array (HeliumTab[]) abzurufen.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { heliumSnapshot, extensionLive } from "../helium-sync/hub";
import type { HeliumTab } from "./helium-store";

/**
 * Ruft die aktuell geöffneten Helium-Tabs aus dem Hub-Snapshot ab.
 */
export function getHeliumTabs(): HeliumTab[] {
  try {
    const snapshot = heliumSnapshot();
    if (snapshot && Array.isArray(snapshot.tabs)) {
      return snapshot.tabs as HeliumTab[];
    }
  } catch (err) {
    console.warn("[pc-bridge/helium-tabs-fix] Fehler beim Abrufen der Helium-Tabs:", err);
  }
  return [];
}

/**
 * Erstellt den Hono-Router für /api/pc-bridge/helium/tabs.
 */
export function createHeliumTabsRouter(requireUser?: (c: Context, next: () => Promise<void>) => Promise<Response | void>): Hono {
  const router = new Hono();

  const tabsHandler = (c: Context) => {
    const tabs = getHeliumTabs();
    return c.json(tabs, 200);
  };

  const statusHandler = (c: Context) => {
    const live = extensionLive();
    const tabs = getHeliumTabs();
    return c.json({
      ok: true,
      connected: live,
      tabCount: tabs.length,
      tabs,
    }, 200);
  };

  if (requireUser) {
    router.get("/tabs", requireUser, tabsHandler);
    router.get("/helium/tabs", requireUser, tabsHandler);
    router.get("/status", requireUser, statusHandler);
  } else {
    router.get("/tabs", tabsHandler);
    router.get("/helium/tabs", tabsHandler);
    router.get("/status", statusHandler);
  }

  return router;
}

/**
 * Registriert die Helium-Tabs-Routen auf der Server-Applikation.
 */
export function registerHeliumTabsRoutes(app: { route: (path: string, sub: Hono) => unknown }, requireUser?: (c: Context, next: () => Promise<void>) => Promise<Response | void>): void {
  const router = createHeliumTabsRouter(requireUser);
  app.route("/api/pc-bridge/helium", router);
}

export default createHeliumTabsRouter;
