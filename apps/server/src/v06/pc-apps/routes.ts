/**
 * REST API-Routen für PC-Apps in Gruppen v06 (A28).
 *
 * Endpunkte:
 * - GET    /api/v06/pc-apps             -> PcAppEntry[]
 * - POST   /api/v06/pc-apps             -> PcAppEntry (Registriert neue App)
 * - GET    /api/v06/pc-apps/presets     -> Bekannte Apps & Host-Erkennung
 * - GET    /api/v06/pc-apps/:id         -> PcAppEntry
 * - DELETE /api/v06/pc-apps/:id         -> { ok: boolean; id: string }
 * - GET    /api/v06/pc-apps/:id/status  -> Fenster- & Prozessstatus
 * - POST   /api/v06/pc-apps/:id/launch  -> Startet die .exe
 * - GET    /api/v06/pc-apps/:id/capture -> Live-Screenshot (JSON oder JPEG)
 * - POST   /api/v06/pc-apps/:id/input   -> Direkte Eingabe-Injektion (nur bei driving=true)
 *
 * Bereitgestellt für A16 / A33 (Einhängen in Gruppenansicht).
 */

import { Hono, type MiddlewareHandler } from "hono";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import { getFlag } from "../../contracts/v06/flags";
import type { PcAppEntry } from "../../contracts/v06/pc-apps";
import { defaultCaptureManager, PcAppCaptureManager } from "./capture";
import { defaultInputInjector, PcAppInputInjector } from "./input";
import { defaultPcAppRegistry, PcAppRegistry } from "./registry";
import type { PcAppInputEvent } from "./types";
import { defaultWindowFinder, WindowFinder } from "./windowFinder";

function parseDimension(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export interface PcAppsRoutesOptions {
  registry?: PcAppRegistry;
  windowFinder?: WindowFinder;
  captureManager?: PcAppCaptureManager;
  inputInjector?: PcAppInputInjector;
  requireUser?: MiddlewareHandler;
}

export function createPcAppsRouter(options: PcAppsRoutesOptions = {}): Hono {
  const router = new Hono();
  const registry = options.registry ?? defaultPcAppRegistry;
  const finder = options.windowFinder ?? defaultWindowFinder;
  const capture = options.captureManager ?? defaultCaptureManager;
  const input = options.inputInjector ?? defaultInputInjector;

  // 1. Feature-Flag Guard: Alles Neue nur aktiv wenn Flag an ist
  router.use("*", async (c, next) => {
    if (!getFlag("pcAppsInGroups")) {
      return c.json(
        { error: "Feature flag 'pcAppsInGroups' ist deaktiviert." },
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
  // Preset-Erkennung
  // -------------------------------------------------------------------------
  router.get("/presets", (c) => {
    const detected = registry.detectInstalledPresets();
    return c.json(detected);
  });

  // -------------------------------------------------------------------------
  // CRUD Endpunkte
  // -------------------------------------------------------------------------

  // GET /api/v06/pc-apps
  router.get("/", async (c) => {
    const groupId = c.req.query("groupId");
    const apps = await registry.listApps(groupId || undefined);
    return c.json(apps);
  });

  // POST /api/v06/pc-apps
  router.post("/", async (c) => {
    try {
      const body = (await c.req.json()) as Omit<PcAppEntry, "id">;
      if (!body.name || !body.exePath || !body.groupId) {
        return c.json(
          { error: "Fehlende Pflichtfelder: name, exePath und groupId sind erforderlich." },
          400,
        );
      }
      const created = await registry.registerApp(body);
      return c.json(created, 201);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Registrieren der PC-App." }, 500);
    }
  });

  // GET /api/v06/pc-apps/:id
  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const app = await registry.getAppById(id);
    if (!app) {
      return c.json({ error: "PC-App nicht gefunden." }, 404);
    }
    return c.json(app);
  });

  // DELETE /api/v06/pc-apps/:id
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const removed = await registry.removeApp(id);
    if (!removed) {
      return c.json({ error: "PC-App nicht gefunden." }, 404);
    }
    return c.json({ ok: true, id });
  });

  // -------------------------------------------------------------------------
  // Status, Launch & Interaktion
  // -------------------------------------------------------------------------

  // GET /api/v06/pc-apps/:id/status
  router.get("/:id/status", async (c) => {
    const id = c.req.param("id");
    const app = await registry.getAppById(id);
    if (!app) {
      return c.json({ error: "PC-App nicht gefunden." }, 404);
    }

    const isRunning = app.windowMatch?.processName
      ? finder.isProcessRunning(app.windowMatch.processName)
      : false;

    const windowInfo = await finder.findWindow({
      processName: app.windowMatch?.processName,
      titleRegex: app.windowMatch?.titleRegex,
    });

    return c.json({
      appId: app.id,
      name: app.name,
      exePath: app.exePath,
      running: isRunning,
      windowFound: Boolean(windowInfo),
      window: windowInfo
        ? {
            hwnd: windowInfo.hwnd,
            title: windowInfo.title,
            pid: windowInfo.pid,
            bounds: windowInfo.bounds,
          }
        : null,
    });
  });

  // POST /api/v06/pc-apps/:id/launch
  router.post("/:id/launch", async (c) => {
    const id = c.req.param("id");
    const app = await registry.getAppById(id);
    if (!app) {
      return c.json({ error: "PC-App nicht gefunden." }, 404);
    }

    const launchResult = finder.launchApp(app.exePath);
    if (!launchResult.ok) {
      return c.json({ error: launchResult.error || "Start fehlgeschlagen" }, 500);
    }

    return c.json({ ok: true, pid: launchResult.pid });
  });

  // GET /api/v06/pc-apps/:id/capture
  router.get("/:id/capture", async (c) => {
    const id = c.req.param("id");
    const app = await registry.getAppById(id);
    if (!app) {
      return c.json({ error: "PC-App nicht gefunden." }, 404);
    }

    const windowInfo = await finder.findWindow({
      processName: app.windowMatch?.processName,
      titleRegex: app.windowMatch?.titleRegex,
    });

    if (!windowInfo) {
      return c.json({ error: "Fenster nicht gefunden." }, 404);
    }

    // 1080p-Standard, 720p-Eco über Query-Parameter (PcAppPreview sendet beide)
    const maxWidth = parseDimension(c.req.query("maxWidth"), 1920, 320, 3840);
    const maxHeight = parseDimension(c.req.query("maxHeight"), 1080, 240, 2160);

    const shot = await capture.captureWindow(windowInfo.hwnd, maxWidth, maxHeight);
    if (!shot.ok || !shot.data) {
      return c.json({ error: shot.error || "Bildaufnahme fehlgeschlagen" }, 500);
    }

    const format = c.req.query("format");
    if (format === "binary") {
      const buffer = Buffer.from(shot.data, "base64");
      return new Response(buffer, {
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "no-store",
        },
      });
    }

    return c.json({
      ok: true,
      data: shot.data,
      width: shot.width,
      height: shot.height,
      durationMs: shot.durationMs,
      method: shot.method,
    });
  });

  // POST /api/v06/pc-apps/:id/input
  router.post("/:id/input", async (c) => {
    const id = c.req.param("id");
    const app = await registry.getAppById(id);
    if (!app) {
      return c.json({ error: "PC-App nicht gefunden." }, 404);
    }

    const body = (await c.req.json()) as {
      driving: boolean;
      event: PcAppInputEvent;
    };

    if (!body.driving) {
      return c.json(
        { error: "Eingaben abgelehnt: Steuern-Modus nicht aktiv." },
        403,
      );
    }

    const windowInfo = await finder.findWindow({
      processName: app.windowMatch?.processName,
      titleRegex: app.windowMatch?.titleRegex,
    });

    if (!windowInfo) {
      return c.json({ error: "Fenster nicht gefunden." }, 404);
    }

    const ok = input.inject(
      { hwnd: windowInfo.hwnd, bounds: windowInfo.bounds },
      body.event,
      true,
    );

    return c.json({ ok });
  });

  return router;
}

/**
 * Registriert die v06 PC-Apps-Routen auf einer Hono-App.
 * Wird vom Integrations-Agenten (A33) eingebunden.
 */
export function registerPcAppsRoutes(
  app: Hono<any, any, any>,
  options: PcAppsRoutesOptions = {},
): void {
  const router = createPcAppsRouter(options);
  app.route(API_PATHS_V06.pcApps, router);
}

export default registerPcAppsRoutes;
