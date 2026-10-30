/**
 * REST API-Routen fuer Onboarding v06 (A25 / Wave 3).
 *
 * Endpunkte:
 * - GET  /api/v06/onboarding/state -> OnboardingStateV06
 * - POST /api/v06/onboarding/state -> OnboardingStateV06
 *
 * Feature-Flag: FLAGS_V06.onboardingV2 (Default: false)
 */

import { Hono, type MiddlewareHandler } from "hono";
import type { Database } from "../../db/client";
import { getFlag } from "../../contracts/v06/flags";
import {
  getOnboardingState,
  updateOnboardingState,
  type OnboardingStateV06,
  type OnboardingUpdatePatch,
} from "./state";

export interface OnboardingRoutesOptions {
  requireUser?: MiddlewareHandler;
  database?: Database;
}

/**
 * Ermittelt die ID des aktuell handelnden Nutzers.
 * Unterstützt Auth-Context (Actor), Custom Header oder Default für Localhost/Single-User.
 */
export function resolveUserId(c: any): string {
  const actor = c.get ? c.get("actor") : c.var?.actor;
  if (actor?.id) return actor.id;
  const headerId = c.req.header("x-connect-user-id");
  if (headerId) return headerId;
  return "default-user";
}

/**
 * Erstellt den Hono-Router fuer /api/v06/onboarding
 */
export function createOnboardingRouter(options: OnboardingRoutesOptions = {}): Hono {
  const router = new Hono();

  // 1. Feature-Flag Guard: Alles Neue nur aktiv wenn Flag an ist
  router.use("*", async (c, next) => {
    if (!getFlag("onboardingV2")) {
      return c.json(
        { error: "Feature flag 'onboardingV2' ist deaktiviert." },
        404,
      );
    }
    await next();
  });

  // 2. Optionale Authentifizierungs-Middleware
  if (options.requireUser) {
    router.use("*", options.requireUser);
  }

  /**
   * GET /api/v06/onboarding/state
   * Ruft den aktuellen Onboarding-Zustand des angemeldeten Benutzers ab.
   */
  router.get("/state", async (c) => {
    try {
      const userId = resolveUserId(c);
      const state = await getOnboardingState(options.database, userId);
      return c.json(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Fehler beim Laden des Onboarding-Zustands", details: message }, 500);
    }
  });

  /**
   * POST /api/v06/onboarding/state
   * Aktualisiert den Onboarding-Zustand (Einzelschritt, Completion oder Reset).
   */
  router.post("/state", async (c) => {
    try {
      const userId = resolveUserId(c);
      const body = (await c.req.json().catch(() => ({}))) as OnboardingUpdatePatch;
      const updated = await updateOnboardingState(options.database, userId, body);
      return c.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Fehler beim Aktualisieren des Onboarding-Zustands", details: message }, 500);
    }
  });

  return router;
}

/**
 * Registriert die Onboarding v06 Routen auf einer bestehenden Hono-App.
 */
export function registerOnboardingRoutes(
  app: Hono<any>,
  options: OnboardingRoutesOptions = {},
): void {
  const router = createOnboardingRouter(options);
  app.route("/api/v06/onboarding", router);
}
