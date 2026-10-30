/**
 * REST API-Routen fuer Browser-Profile v06 (A09).
 *
 * Endpunkte:
 * - GET    /api/v06/browser-profiles             -> BrowserProfile[]
 * - POST   /api/v06/browser-profiles             -> BrowserProfile (409 bei >10 Profilen)
 * - GET    /api/v06/browser-profiles/:id         -> BrowserProfile
 * - GET    /api/v06/browser-profiles/:id/tabs    -> ProfileTab[]
 * - POST   /api/v06/browser-profiles/:id/tabs    -> ProfileTab
 * - DELETE /api/v06/browser-profiles/:id/tabs/:tabId -> { ok: boolean; id: string }
 * - GET    /api/v06/browser-profiles/:id/groups  -> ProfileTabGroup[]
 * - POST   /api/v06/browser-profiles/:id/groups  -> ProfileTabGroup
 * - DELETE /api/v06/browser-profiles/:id/groups/:groupId -> { ok: boolean; id: string }
 * - POST   /api/v06/browser-profiles/:id/end     -> { ok: boolean; id: string; status: "ended" }
 * - GET    /api/v06/browser-profiles/:id/preview -> Live-Preview (JPEG oder JSON)
 *
 * Bereitgestellt fuer A16 (Browser-Frontend).
 */

import { Hono, type MiddlewareHandler } from "hono";
import type { Database } from "../../db/client";
import { getFlag } from "../../contracts/v06/flags";
import {
  ProfileLimitExceededError,
  ProfileManager,
} from "./profileManager";

export interface BrowserProfilesRoutesOptions {
  profileManager?: ProfileManager;
  requireUser?: MiddlewareHandler;
  database?: Database;
}

export function createBrowserProfilesRouter(
  options: BrowserProfilesRoutesOptions = {},
): Hono {
  const router = new Hono();
  const manager = options.profileManager ?? new ProfileManager(options.database);

  // 1. Feature-Flag Guard: Alles Neue nur aktiv wenn Flag an ist
  router.use("*", async (c, next) => {
    if (!getFlag("browserProfiles")) {
      return c.json(
        { error: "Feature flag 'browserProfiles' ist deaktiviert." },
        404,
      );
    }
    await next();
  });

  // 2. Optionale Authentifizierungs-Middleware
  if (options.requireUser) {
    router.use("*", options.requireUser);
  }

  // -------------------------------------------------------------------------
  // Profile Endpunkte
  // -------------------------------------------------------------------------

  /**
   * GET /api/v06/browser-profiles
   * Liefert alle Profile des aufrufenden Nutzers/Agenten (max. 10).
   */
  router.get("/", async (c) => {
    const agentId = c.req.query("agentId");
    const profiles = await manager.listProfiles(agentId);
    return c.json(profiles);
  });

  /**
   * POST /api/v06/browser-profiles
   * Erstellt ein neues isoliertes Browser-Profil.
   */
  router.post("/", async (c) => {
    try {
      const body = await c.req.json<{
        agentId: string;
        name: string;
        color?: string;
        customDir?: string;
        launchBrowser?: boolean;
      }>();

      if (!body.agentId || !body.name) {
        return c.json(
          { error: "Felder 'agentId' und 'name' sind erforderlich." },
          400,
        );
      }

      const profile = await manager.startProfile(body.agentId, body.name, {
        color: body.color,
        customDir: body.customDir,
        launchBrowser: body.launchBrowser,
      });

      return c.json(profile, 201);
    } catch (err) {
      if (err instanceof ProfileLimitExceededError) {
        return c.json({ error: err.message }, 409);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  /**
   * GET /api/v06/browser-profiles/:id
   */
  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const profile = await manager.getProfile(id);
    if (!profile) {
      return c.json({ error: `Profil '${id}' nicht gefunden.` }, 404);
    }
    return c.json({
      id: profile.id,
      agentId: profile.agentId,
      name: profile.name,
      color: profile.color,
      status: profile.status,
      createdAt: profile.createdAt,
    });
  });

  /**
   * POST /api/v06/browser-profiles/:id/end
   * Beendet die Browser-Sitzung, speichert alle Tabs und schliesst den Prozess.
   */
  router.post("/:id/end", async (c) => {
    const id = c.req.param("id");
    try {
      const result = await manager.endProfile(id);
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 400);
    }
  });

  /**
   * GET /api/v06/browser-profiles/:id/preview
   * Live-Preview Screenshot via CDP Screencast.
   */
  router.get("/:id/preview", async (c) => {
    const id = c.req.param("id");
    const targetId = c.req.query("targetId");

    const shot = await manager.getProfilePreview(id, targetId);
    if (!shot.ok || !shot.bytes) {
      return c.json(
        { ok: false, error: shot.error ?? "Vorschau nicht verfuegbar." },
        502,
      );
    }

    return new Response(shot.bytes as unknown as BodyInit, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "no-store, no-cache, must-revalidate",
      },
    });
  });

  // -------------------------------------------------------------------------
  // Tabs Endpunkte
  // -------------------------------------------------------------------------

  /**
   * GET /api/v06/browser-profiles/:id/tabs
   * Liefert alle Tabs eines Browser-Profils.
   */
  router.get("/:id/tabs", async (c) => {
    const id = c.req.param("id");
    const tabs = await manager.tabStore.listTabs(id);
    return c.json(tabs);
  });

  /**
   * POST /api/v06/browser-profiles/:id/tabs
   * Oeffnet einen neuen Tab im Profil via CDP.
   */
  router.post("/:id/tabs", async (c) => {
    const id = c.req.param("id");
    try {
      const body = await c.req.json<{
        url: string;
        title?: string;
        groupId?: string;
        order?: number;
      }>();

      if (!body.url) {
        return c.json({ error: "Feld 'url' ist erforderlich." }, 400);
      }

      const profile = await manager.getProfile(id);
      let cdpTargetId: string | undefined;

      // Wenn Browser aktiv ist, URL via CDP oeffnen
      if (profile && profile.status === "active") {
        try {
          const { openUrlInProfileTab } = await import(
            "../../agent-hub/browser-launch-guard"
          );
          const navResult = await openUrlInProfileTab(
            profile.cdpPort,
            body.url,
            profile.userDataDir,
          );
          if (navResult.ok) {
            cdpTargetId = navResult.targetId;
          }
        } catch (err) {
          console.warn("[routes] CDP-Navigation fehlgeschlagen:", err);
        }
      }

      const tab = await manager.tabStore.addTab(id, {
        url: body.url,
        title: body.title,
        groupId: body.groupId,
        order: body.order,
        cdpTargetId,
      });

      return c.json(tab, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  /**
   * DELETE /api/v06/browser-profiles/:id/tabs/:tabId
   * Soft-Delete: Archiviert den Tab (nie physisch loeschen).
   */
  router.delete("/:id/tabs/:tabId", async (c) => {
    const tabId = c.req.param("tabId");
    const ok = await manager.tabStore.archiveTab(tabId);
    return c.json({ ok, id: tabId });
  });

  // -------------------------------------------------------------------------
  // Gruppen Endpunkte
  // -------------------------------------------------------------------------

  /**
   * GET /api/v06/browser-profiles/:id/groups
   * Liefert Tab-Gruppen (Ordner) eines Profils.
   */
  router.get("/:id/groups", async (c) => {
    const id = c.req.param("id");
    const groups = await manager.groupStore.listGroups(id);
    return c.json(groups);
  });

  /**
   * POST /api/v06/browser-profiles/:id/groups
   * Erstellt eine neue Tab-Gruppe.
   */
  router.post("/:id/groups", async (c) => {
    const id = c.req.param("id");
    try {
      const body = await c.req.json<{
        name: string;
        parentId?: string;
        order?: number;
      }>();

      if (!body.name) {
        return c.json({ error: "Feld 'name' ist erforderlich." }, 400);
      }

      const group = await manager.groupStore.createGroup(id, {
        name: body.name,
        parentId: body.parentId,
        order: body.order,
      });

      return c.json(group, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  /**
   * DELETE /api/v06/browser-profiles/:id/groups/:groupId
   * Soft-Delete: Archiviert die Gruppe.
   */
  router.delete("/:id/groups/:groupId", async (c) => {
    const groupId = c.req.param("groupId");
    const ok = await manager.groupStore.archiveGroup(groupId);
    return c.json({ ok, id: groupId });
  });

  return router;
}

/**
 * Registriert die Browser-Profiles Routen auf einer bestehenden Hono-App.
 */
export function registerBrowserProfilesRoutes(
  app: Hono<any>,
  options: BrowserProfilesRoutesOptions = {},
): void {
  const router = createBrowserProfilesRouter(options);
  app.route("/api/v06/browser-profiles", router);
}
