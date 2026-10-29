import type { Context, MiddlewareHandler, Next } from "hono";

/**
 * Tunnel Allowlist Middleware & Guard:
 * Beschränkt externen Zugriff über Cloudflare-Tunnel / Ingress-Proxies
 * strikt auf notwendige Webhook- und Callback-Routen.
 * Verhindert die Exposition interner Steuerungs- und Desktop-Endpunkte.
 */

export interface TunnelAllowlistOptions {
  /**
   * Erlaubte Pfad-Präfixe für eingehenden Tunnel-Traffic.
   */
  allowedPrefixes?: string[];
  /**
   * Erlaubte exakte Pfade für eingehenden Tunnel-Traffic.
   */
  allowedExactPaths?: string[];
  /**
   * Eigene Erkennungsfunktion für Tunnel-Requests.
   */
  isTunnelRequest?: (c: Context) => boolean;
}

export const DEFAULT_TUNNEL_ALLOWED_PREFIXES = [
  "/api/webhooks/",
  "/api/auth/callback/",
  "/api/v06/social/posts",
  // Connect-MCP schützt sich selbst: Bearer-Pflicht (auch lokal) für /mcp und
  // /jsonrpc, /tokens nur Loopback, /health und /manifest über Tunnel minimal,
  // Swarm-Leseendpunkte nur mit Token. Deshalb ist der Präfix über den Tunnel
  // erreichbar, ohne interne Desktop-/CLI-Routen zu öffnen.
  "/api/connect-mcp/",
];

export const DEFAULT_TUNNEL_ALLOWED_EXACT_PATHS = [
  "/health",
  "/api/health",
  "/api/v06/flags",
];

/**
 * Erkennung, ob ein Request über einen Cloudflare-Tunnel oder Reverse-Proxy hereinkommt.
 *
 * Fail-closed: jeder der Cloudflare-Header (cf-connecting-ip, cf-ray, cf-ipcountry,
 * cdn-loop: cloudflare) belegt einen Tunnel-Kontext — unabhängig davon, ob die
 * TCP-Verbindung von Loopback oder von außen kommt. Ebenso zählen die
 * Proxy-Header Forwarded und X-Real-IP.
 */
export function isTunnelRequest(c: Context): boolean {
  const cfRay = c.req.header("cf-ray");
  const cfConnectingIp = c.req.header("cf-connecting-ip");
  const cfIpCountry = c.req.header("cf-ipcountry");
  const cdnLoop = c.req.header("cdn-loop");
  const tunnelHeader = c.req.header("x-connect-tunnel");
  const forwarded = c.req.header("forwarded");
  const realIp = c.req.header("x-real-ip");
  const host = c.req.header("host") || "";
  const forwardedHost = c.req.header("x-forwarded-host") || "";

  // Cloudflare-Header oder Tunnel-/Proxy-Header aktiv
  if (
    cfRay ||
    cfConnectingIp ||
    cfIpCountry ||
    (cdnLoop && /cloudflare/i.test(cdnLoop)) ||
    forwarded ||
    realIp ||
    tunnelHeader === "1" ||
    tunnelHeader === "true"
  ) {
    return true;
  }

  // Erkennung über Cloudflare trycloudflare.com oder custom tunnel host
  if (host.includes("trycloudflare.com") || forwardedHost.includes("trycloudflare.com")) {
    return true;
  }

  return false;
}

/**
 * Erstellt eine Middleware zum Schutz vor Tunnel-Exposition.
 */
export function createTunnelAllowlistGuard(
  options: TunnelAllowlistOptions = {},
): MiddlewareHandler {
  const allowedPrefixes = options.allowedPrefixes ?? DEFAULT_TUNNEL_ALLOWED_PREFIXES;
  const allowedExact = new Set(options.allowedExactPaths ?? DEFAULT_TUNNEL_ALLOWED_EXACT_PATHS);
  const checkTunnel = options.isTunnelRequest ?? isTunnelRequest;

  return async function tunnelAllowlistMiddleware(c: Context, next: Next) {
    if (!checkTunnel(c)) {
      // Lokaler Loopback-Aufruf -> Erlauben
      return next();
    }

    const path = c.req.path;

    // Prüfe exakte Übereinstimmung
    if (allowedExact.has(path)) {
      return next();
    }

    // Prüfe Präfix-Übereinstimmung
    const isAllowedPrefix = allowedPrefixes.some((prefix) => path.startsWith(prefix));
    if (isAllowedPrefix) {
      return next();
    }

    // Blockiere Zugriff von außen auf interne Endpunkte
    return c.json(
      {
        error: "Forbidden: Route not exposed via external tunnel",
        code: "TUNNEL_ROUTE_PROHIBITED",
        path,
      },
      403,
    );
  };
}
