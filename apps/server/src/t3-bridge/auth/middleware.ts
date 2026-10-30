/**
 * T3-Bridge-Auth â€” Better-Auth-Middleware fÃ¼r /api/t3/* (Lane A10).
 *
 * Aufgabe 2:
 * Alle `/api/t3/*`-Routen nur fÃ¼r eingeloggte Connect-Nutzer (Better Auth-Session prÃ¼fen).
 *
 * Akzeptanzkriterien:
 * - Test: ohne Session â†’ 401.
 * - Hinter dem passenden Feature-Flag (A01: `bridge`); Flag aus = altes Verhalten.
 */

import type { MiddlewareHandler } from "hono";
import { DEV_ACTOR } from "../../auth/dev-actor";
import type { AppVariables, AuthenticatedActor } from "../../auth/guards";
import { getT3Flag } from "../contracts";
import { RedactedLogger } from "./redact";
import type { T3AuthMiddlewareOptions } from "./types";

const logger = new RedactedLogger("T3AuthMiddleware");

/**
 * Erzeugt eine Hono-Middleware, die alle T3-Routen schÃ¼tzt.
 *
 * 1. PrÃ¼ft das Feature-Flag `bridge` (A01).
 *    Ist das Flag aus, wird 404 zurÃ¼ckgegeben (BrÃ¼cke inaktiv).
 * 2. PrÃ¼ft die Better-Auth-Session.
 *    Ohne gÃ¼ltige Session â†’ HTTP 401 ("Authentication required.").
 * 3. PrÃ¼ft die Benutzerrolle (admin/user) â†’ HTTP 403 bei fehlender Rolle.
 * 4. Setzt den authentifizierten `actor` im Hono-Kontext.
 */
export function createT3AuthMiddleware(
  options: T3AuthMiddlewareOptions = {},
): MiddlewareHandler<{ Variables: AppVariables }> {
  return async (context, next) => {
    // 1. Feature-Flag prÃ¼fen (A01: bridge)
    if (!getT3Flag("bridge")) {
      logger.debug("T3-BrÃ¼cke aufgerufen, aber Feature-Flag 'bridge' ist deaktiviert.");
      return context.json(
        {
          error: "T3 bridge is disabled.",
          flag: "bridge",
        },
        404,
      );
    }

    // Sicherheits-Header: Kein Caching fÃ¼r T3-API-Antworten
    context.header("Cache-Control", "no-store, no-cache, must-revalidate");
    context.header("Pragma", "no-cache");

    // 2. PrÃ¼fen, ob bereits ein authentifizierter Actor vorliegt (z. B. durch requireUser)
    const existingActor = context.get("actor") as AuthenticatedActor | undefined;
    if (existingActor) {
      return next();
    }

    // 3. Single-User / Dev-Modus prÃ¼fen
    const isSingleUser =
      options.singleUser ??
      (process.env.CONNECT_SINGLE_USER?.trim() === "true" ||
        process.env.CONNECT_DEV_NO_AUTH?.trim() === "true");

    if (isSingleUser && !options.auth) {
      context.set("actor", DEV_ACTOR);
      return next();
    }

    // 4. Better-Auth-Session prÃ¼fen
    const authService = options.auth;
    if (!authService) {
      // Wenn kein AuthService Ã¼bergeben wurde und kein Actor existiert: 401
      logger.warn("Keine AuthentifizierungsmÃ¶glichkeit konfiguriert â€” Zugriff verweigert.");
      return context.json({ error: "Authentication required." }, 401);
    }

    try {
      const session = await authService.api.getSession({
        headers: context.req.raw.headers,
        query: { disableCookieCache: true },
      });

      if (!session || !session.user) {
        logger.debug("Anfrage ohne gÃ¼ltige Better-Auth-Session â†’ 401");
        return context.json({ error: "Authentication required." }, 401);
      }

      // Rollenermittlung
      const roleRepo = options.roleRepository;
      const roles = session.user.role
        ? [session.user.role]
        : roleRepo
          ? await roleRepo.rolesForUser(session.user.id)
          : [];

      const role = roles.includes("admin")
        ? "admin"
        : roles.includes("user")
          ? "user"
          : undefined;

      if (!role) {
        logger.warn(`Benutzer ${session.user.id} besitzt keine Berechtigung â†’ 403`);
        return context.json({ error: "Authorization required." }, 403);
      }

      context.set("actor", {
        id: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified ?? false,
        name: session.user.name,
        image: session.user.image,
        role,
      });

      return next();
    } catch (err) {
      logger.error("Fehler bei der PrÃ¼fung der Better-Auth-Session", err);
      return context.json({ error: "Authentication failed." }, 401);
    }
  };
}
