import type { Hono as HonoApp, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import { getFlag } from "../../contracts/v06/flags";
import { checkCompanyOwnerOrAdmin } from "../company-tools/routes";
import { removeBotFromCompany, hardDeleteBot, LifecycleHttpError } from "./service";

export interface BotLifecycleRouteOptions {
  requireUser?: MiddlewareHandler<any>;
  exportDirOverride?: string;
  dbOverride?: any;
}

/**
 * Erstellt einen Hono-Router fuer Bot-Lifecycle v06 Endpunkte.
 */
export function createBotLifecycleRouter(options: BotLifecycleRouteOptions = {}): Hono {
  const router = new Hono();

  if (options.requireUser) {
    router.use("*", options.requireUser);
  }

  // POST /:id/remove-from-company
  router.post("/:id/remove-from-company", async (c) => {
    if (!getFlag("botLifecycle")) {
      return c.json({ error: "Feature 'botLifecycle' is currently disabled." }, 404);
    }

    const botId = c.req.param("id");
    if (!botId) {
      return c.json({ error: "Missing bot ID parameter." }, 400);
    }

    if (!checkCompanyOwnerOrAdmin(c)) {
      return c.json({ error: "Unauthorized: Company Admin access required." }, 403);
    }

    try {
      const body = await c.req.json().catch(() => ({}));
      const companyId = body?.companyId || c.req.query("companyId");
      if (!companyId) {
        return c.json({ error: "Field 'companyId' is required in request body or query." }, 400);
      }

      const result = await removeBotFromCompany(botId, companyId, options.dbOverride);
      return c.json(result, 200);
    } catch (err: any) {
      if (err instanceof LifecycleHttpError) {
        return c.json({ error: err.message }, err.statusCode as any);
      }
      return c.json({ error: err?.message || "Failed to remove bot from company" }, 500);
    }
  });

  // POST /:id/hard-delete
  router.post("/:id/hard-delete", async (c) => {
    if (!getFlag("botLifecycle")) {
      return c.json({ error: "Feature 'botLifecycle' is currently disabled." }, 404);
    }

    const botId = c.req.param("id");
    if (!botId) {
      return c.json({ error: "Missing bot ID parameter." }, 400);
    }

    if (!checkCompanyOwnerOrAdmin(c)) {
      return c.json({ error: "Unauthorized: Administrator access required." }, 403);
    }

    try {
      const body = await c.req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid JSON body. Expected { confirmName }." }, 400);
      }

      const confirmName = body.confirmName;
      if (!confirmName || typeof confirmName !== "string") {
        return c.json(
          { error: "Field 'confirmName' matching the bot's name is required to confirm hard deletion." },
          400,
        );
      }

      const result = await hardDeleteBot(botId, confirmName, {
        exportDirOverride: options.exportDirOverride,
        dbOverride: options.dbOverride,
      });

      return c.json(result, 200);
    } catch (err: any) {
      if (err instanceof LifecycleHttpError) {
        return c.json({ error: err.message }, err.statusCode as any);
      }
      return c.json({ error: err?.message || "Failed to hard-delete bot" }, 500);
    }
  });

  return router;
}

/**
 * Registriert die Bot-Lifecycle-Routen direkt auf der Haupt-Hono-App.
 * Exporte fuer A11 (Integrator): registerBotLifecycleRoutes(app)
 */
export function registerBotLifecycleRoutes(
  app: HonoApp<any, any, any>,
  options: BotLifecycleRouteOptions = {},
): void {
  const handlerRemove = async (c: any) => {
    if (!getFlag("botLifecycle")) {
      return c.json({ error: "Feature 'botLifecycle' is currently disabled." }, 404);
    }

    const botId = c.req.param("id");
    if (!botId) {
      return c.json({ error: "Missing bot ID parameter." }, 400);
    }

    if (!checkCompanyOwnerOrAdmin(c)) {
      return c.json({ error: "Unauthorized: Company Admin access required." }, 403);
    }

    try {
      const body = await c.req.json().catch(() => ({}));
      const companyId = body?.companyId || c.req.query("companyId");
      if (!companyId) {
        return c.json({ error: "Field 'companyId' is required in request body or query." }, 400);
      }

      const result = await removeBotFromCompany(botId, companyId, options.dbOverride);
      return c.json(result, 200);
    } catch (err: any) {
      if (err instanceof LifecycleHttpError) {
        return c.json({ error: err.message }, err.statusCode as any);
      }
      return c.json({ error: err?.message || "Failed to remove bot from company" }, 500);
    }
  };

  const handlerHardDelete = async (c: any) => {
    if (!getFlag("botLifecycle")) {
      return c.json({ error: "Feature 'botLifecycle' is currently disabled." }, 404);
    }

    const botId = c.req.param("id");
    if (!botId) {
      return c.json({ error: "Missing bot ID parameter." }, 400);
    }

    if (!checkCompanyOwnerOrAdmin(c)) {
      return c.json({ error: "Unauthorized: Administrator access required." }, 403);
    }

    try {
      const body = await c.req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid JSON body. Expected { confirmName }." }, 400);
      }

      const confirmName = body.confirmName;
      if (!confirmName || typeof confirmName !== "string") {
        return c.json(
          { error: "Field 'confirmName' matching the bot's name is required to confirm hard deletion." },
          400,
        );
      }

      const result = await hardDeleteBot(botId, confirmName, {
        exportDirOverride: options.exportDirOverride,
        dbOverride: options.dbOverride,
      });

      return c.json(result, 200);
    } catch (err: any) {
      if (err instanceof LifecycleHttpError) {
        return c.json({ error: err.message }, err.statusCode as any);
      }
      return c.json({ error: err?.message || "Failed to hard-delete bot" }, 500);
    }
  };

  const removePattern = API_PATHS_V06.botRemoveFromCompanyPattern;
  const deletePattern = API_PATHS_V06.botHardDeletePattern;

  if (options.requireUser) {
    app.post(removePattern, options.requireUser, handlerRemove);
    app.post(deletePattern, options.requireUser, handlerHardDelete);
  } else {
    app.post(removePattern, handlerRemove);
    app.post(deletePattern, handlerHardDelete);
  }
}

export default registerBotLifecycleRoutes;
