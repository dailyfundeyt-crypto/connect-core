/**
 * T3-Bridge — Verbindungssicherheit der Handy-Kopplung (Lane A34).
 *
 * Regel: Ein Kopplungs-QR-Code darf **nur** über eine sichere Verbindung
 * entstehen — HTTPS oder Loopback. Eine LAN-Adresse wie `http://192.168.…`
 * wird abgelehnt, weil das Einmal-Token sonst im Klartext durchs Netz ginge.
 *
 * Es wird nichts öffentlich ins Internet gestellt. Eine öffentliche Adresse
 * (Tunnel, Tailnet) entsteht ausschließlich dadurch, dass Stefan sie explizit
 * über `CONNECT_MOBILE_BASE_URL` setzt.
 */

const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "::",
]);

/** True für Loopback-Namen (inkl. `127.x.x.x` und IPv6-Schreibweisen). */
export function isLoopbackHostname(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (LOOPBACK_HOSTNAMES.has(bare)) return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare);
}

/**
 * Normalisiert eine Adresse auf ihren Origin und prüft, ob sie sicher ist.
 * `null` bei ungültiger Eingabe (kein Schema, Zugangsdaten, Pfad bleibt erlaubt).
 */
export function normalizeBaseUrl(raw: string | null | undefined): {
  baseUrl: string | null;
  secure: boolean;
} {
  const trimmed = raw?.trim();
  if (!trimmed) return { baseUrl: null, secure: false };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { baseUrl: null, secure: false };
    }
    if (url.username || url.password) return { baseUrl: null, secure: false };
    const secure =
      url.protocol === "https:" || isLoopbackHostname(url.hostname);
    return { baseUrl: url.origin, secure };
  } catch {
    return { baseUrl: null, secure: false };
  }
}

export type MobileOriginInput = {
  /** `request.url` der Hono-Anfrage. */
  requestUrl: string;
  /** `Host`-Header der Anfrage. */
  host?: string | null;
  /** `X-Forwarded-Proto` (nur gesetzt, wenn ein Proxy davor steht). */
  forwardedProto?: string | null;
  /** `X-Forwarded-Host` (nur gesetzt, wenn ein Proxy davor steht). */
  forwardedHost?: string | null;
  /** Explizite Freigabe durch Stefan (`CONNECT_MOBILE_BASE_URL`). */
  configured?: string | null;
};

/**
 * Ermittelt die Adresse, die im QR-Code landet.
 *
 * Reihenfolge:
 *  1. `CONNECT_MOBILE_BASE_URL` (explizite, von Stefan gesetzte Adresse)
 *  2. `https://<X-Forwarded-Host>` (Tunnel/Proxy)
 *  3. Origin der Anfrage (`request.url`)
 *
 * `secure` ist false, sobald die effektive Adresse weder HTTPS noch Loopback ist.
 */
export function resolveMobileBaseUrl(input: MobileOriginInput): {
  baseUrl: string | null;
  secure: boolean;
} {
  const configured = normalizeBaseUrl(input.configured);
  if (configured.baseUrl) return configured;

  const forwardedHost = input.forwardedHost?.split(",")[0]?.trim();
  const forwardedProto = input.forwardedProto
    ?.split(",")[0]
    ?.trim()
    ?.toLowerCase();
  if (forwardedHost) {
    // Steht ein Proxy davor, zählt dessen Schema. Ein http-Proxy darf nicht
    // still auf die Loopback-Adresse zurückfallen: Das Handy käme dort nie an.
    if (forwardedProto !== "https") return { baseUrl: null, secure: false };
    const forwarded = normalizeBaseUrl(`https://${forwardedHost}`);
    if (forwarded.baseUrl) return forwarded;
    return { baseUrl: null, secure: false };
  }

  const own = normalizeBaseUrl(input.requestUrl);
  if (own.baseUrl) return own;

  return { baseUrl: null, secure: false };
}

/**
 * CSRF-Schutz für schreibende Routen.
 *
 * Browser senden bei POST mit JSON einen `Origin`-Header. Fehlt er, handelt es
 * sich um einen Nicht-Browser-Client (Tests, CLI) — der ist ohnehin durch die
 * Auth-Middleware geschützt. Ein fremder Origin wird immer abgelehnt.
 */
export function isSameOriginRequest(input: {
  origin?: string | null;
  requestUrl: string;
  host?: string | null;
  forwardedHost?: string | null;
}): boolean {
  const raw = input.origin?.trim();
  if (!raw) return true;
  try {
    const originHost = new URL(raw).host.toLowerCase();
    const allowed = new Set<string>();
    try {
      allowed.add(new URL(input.requestUrl).host.toLowerCase());
    } catch {
      /* ignore */
    }
    if (input.host) allowed.add(input.host.trim().toLowerCase());
    const forwarded = input.forwardedHost?.split(",")[0]?.trim();
    if (forwarded) allowed.add(forwarded.toLowerCase());
    return allowed.has(originHost);
  } catch {
    return false;
  }
}
