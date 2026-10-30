import type { Context, Next } from "hono";

export interface CorsOptions {
  allowedOrigins?: string[];
}

const DEFAULT_ALLOWED = [
  "http://localhost:3101",
  "http://127.0.0.1:3101",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5231",
  "http://127.0.0.1:5231",
  "https://connect-kunc-preview.vercel.app",
];

const TRUSTED_VERCEL_REGEX = /^https:\/\/connect-kunc(-[a-z0-9-]+)?\.vercel\.app$/;

export function isAllowedOrigin(origin: string, allowedSet: Set<string>): boolean {
  if (allowedSet.has(origin)) {
    return true;
  }
  return TRUSTED_VERCEL_REGEX.test(origin);
}

export function createCorsAndCsrfCheck(options: CorsOptions = {}) {
  const allowed = new Set(options.allowedOrigins ?? DEFAULT_ALLOWED);

  return async function corsMiddleware(c: Context, next: Next) {
    const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method);
    const origin = c.req.header("Origin");
    const secFetchSite = c.req.header("Sec-Fetch-Site");
    const referer = c.req.header("Referer");

    // 1. SEC-04: Prüfe Sec-Fetch-Site Header (Schutz vor Browser Cross-Site Requests)
    if (secFetchSite === "cross-site" && isStateChanging) {
      return c.json(
        { error: "Forbidden: Cross-site request rejected by Sec-Fetch-Site guard." },
        403,
      );
    }

    // 2. Origin-Prüfung
    if (origin) {
      if (isAllowedOrigin(origin, allowed)) {
        c.header("Access-Control-Allow-Origin", origin);
        c.header("Access-Control-Allow-Credentials", "true");
        c.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        );
        c.header(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-Requested-With, X-Desktop-Token, X-Connect-Token",
        );
      } else {
        // Nicht autorisierter Origin bei mutierenden Requests blockieren
        if (isStateChanging) {
          return c.json(
            { error: "Forbidden: Cross-site request rejected (unauthorized origin)." },
            403,
          );
        }
      }
    } else if (referer && isStateChanging) {
      // Wenn kein Origin da ist, Referer prüfen
      try {
        const refUrl = new URL(referer);
        const refOrigin = refUrl.origin;
        if (!isAllowedOrigin(refOrigin, allowed)) {
          return c.json(
            { error: "Forbidden: Cross-site request rejected (unauthorized referer)." },
            403,
          );
        }
      } catch {
        return c.json({ error: "Forbidden: Malformed referer header." }, 403);
      }
    }

    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    return next();
  };
}
