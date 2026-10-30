import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler, Next } from "hono";

/**
 * Standardisierte defensive Authentifizierungs-Middleware für Hono-Routen.
 * Schützt vor Auth-Bypässen (SEC-02, SEC-03, SEC-08) und Timing-Angriffen.
 */

/**
 * Zeitkonstanter String-Vergleich zum Schutz vor Timing-Angriffen auf Secrets und Token.
 */
export function safeTimingCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export interface TokenAuthOptions {
  /**
   * Header-Namen, die nach dem Token durchsucht werden.
   * Standard: ["X-Desktop-Token", "X-Connect-Token", "Authorization"]
   */
  tokenHeaders?: string[];
  /**
   * Fehlermeldung bei fehlendem oder ungültigem Token.
   */
  errorMessage?: string;
  /**
   * Erlaubt Loopback-Zugriff ohne Token NUR wenn explizit true gesetzt ist.
   * Standard ist strikt FALSE (defensiv).
   */
  allowUnauthenticatedLoopback?: boolean;
}

/**
 * Erstellt eine Hono-Middleware, die strikt das Vorhandensein eines gültigen Tokens erzwingt.
 * Behebt die SEC-02-Lücke: Kein Token übergeben -> IMMER 401 Unauthorized.
 */
export function createTokenAuth(
  expectedToken: string,
  options: TokenAuthOptions = {},
): MiddlewareHandler {
  const tokenHeaders = options.tokenHeaders ?? [
    "x-desktop-token",
    "x-connect-token",
    "authorization",
  ];
  const errorMessage = options.errorMessage ?? "Unauthorized: valid authentication token required";

  return async function tokenAuthMiddleware(c: Context, next: Next) {
    // Wenn kein Expected Token konfiguriert wurde, defensiv sperren
    if (!expectedToken || typeof expectedToken !== "string" || expectedToken.trim().length === 0) {
      return c.json({ error: "Server authentication token not configured" }, 500);
    }

    let providedToken: string | undefined;

    for (const headerName of tokenHeaders) {
      const val = c.req.header(headerName);
      if (val) {
        if (headerName.toLowerCase() === "authorization" && val.toLowerCase().startsWith("bearer ")) {
          providedToken = val.slice(7).trim();
        } else {
          providedToken = val.trim();
        }
        if (providedToken) break;
      }
    }

    if (!providedToken) {
      return c.json({ error: errorMessage }, 401);
    }

    if (!safeTimingCompare(providedToken, expectedToken)) {
      return c.json({ error: "Invalid authentication token" }, 401);
    }

    return next();
  };
}

export interface SessionOrTokenAuthOptions {
  expectedTokens?: string[];
  verifySession?: (c: Context) => Promise<boolean | { userId: string; role?: string }>;
}

/**
 * Universelle Auth-Middleware: Akzeptiert entweder eine gültige Benutzersitzung (Cookie)
 * oder ein autorisiertes Token (Bearer / Header).
 */
export function createRequireAuth(options: SessionOrTokenAuthOptions = {}): MiddlewareHandler {
  return async function requireAuthMiddleware(c: Context, next: Next) {
    // 1. Token-Prüfung
    const authHeader = c.req.header("authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
    const desktopHeader = c.req.header("x-desktop-token") || c.req.header("x-connect-token");

    const candidateToken = bearer || desktopHeader;
    if (candidateToken && options.expectedTokens && options.expectedTokens.length > 0) {
      const match = options.expectedTokens.some((exp) => safeTimingCompare(candidateToken, exp));
      if (match) {
        return next();
      }
    }

    // 2. Sitzungs-Prüfung falls Resolver konfiguriert
    if (options.verifySession) {
      try {
        const session = await options.verifySession(c);
        if (session) {
          return next();
        }
      } catch {
        // Fallthrough to 401
      }
    }

    return c.json({ error: "Unauthorized: valid session or token required" }, 401);
  };
}
