/**
 * Handy-Tunnel (helium-tunnel, 17.10.2026): Das Handy oeffnet per QR-Code direkt die lokale Connect App
 * (127.0.0.1:<port>) ueber einen Cloudflare-Tunnel. Gleiche Agenten, gleiche Datenbank, kein Sync.
 *
 * SICHERHEIT. Der Bun-Server lauscht nur auf 127.0.0.1; cloudflared verbindet sich ebenfalls von
 * 127.0.0.1. Darum erkennt dieses Modul Tunnel-Anfragen an den Cloudflare-Headern (cf-ray,
 * cf-connecting-ip, cdn-loop) und am Host (Tunnel-Domain), NICHT an der IP. Fuer jede Tunnel-Anfrage gilt:
 *   - ohne gueltiges Geraete-Cookie (__Host-connect_device, HttpOnly, Secure) nur die Kopplungsseite,
 *     API/WebSocket -> 401; App-Code/Assets werden nicht ausgeliefert;
 *   - Kopplung nur ueber ein Einmal-Token (10 min) aus dem QR-Code am PC, Bestaetigung per POST
 *     (Link-Vorschauen verbrauchen es nicht);
 *   - mit Cookie: CSRF-Pruefung (Origin muss die Tunnel-Domain sein), dann laeuft die Anfrage als die
 *     Person, die gekoppelt hat (eigene Better-Auth-Sitzung pro Geraet, beim Entfernen geloescht);
 *     Host/Origin werden auf den lokalen Ursprung umgeschrieben, damit die bestehenden "nur lokal"-
 *     Pruefungen (Brain, Agent-Hub, Helium-Sync, Voice) fuer das gekoppelte Geraet funktionieren;
 *   - /api/tunnel/* (QR erzeugen, Geraete verwalten) ist nur lokal am PC erreichbar.
 * Lokale Anfragen (127.0.0.1/localhost ohne Cloudflare-Header) bleiben unveraendert.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTunnelConfig, type TunnelConfig } from "./config";
import { lockedPage, pairExpiredPage, pairFailedPage, pairPage } from "./pages";
import { createPcLogin } from "./pc-login";
import { createTunnelProcess } from "./process";
import qrcode from "./qrcode-vendor.js";
import { createTunnelStore, type PairedDevice } from "./store";

const DEVICE_COOKIE = "__Host-connect_device";
const PAIR_TTL_MS = 10 * 60_000;
const DEVICE_MAX_AGE_S = 400 * 24 * 3600;
/** helium-gateway: Vercel-Gateway, auf das die PC-App bei Tunnel-Wechsel/-Ausfall zurueckspringt. */
const GATEWAY_URL = (() => {
  const value = (process.env.CONNECT_GATEWAY_URL ?? "").trim() || "https://connect-kunc-preview.vercel.app/gateway";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : "https://connect-kunc-preview.vercel.app/gateway";
  } catch {
    return "https://connect-kunc-preview.vercel.app/gateway";
  }
})();

/** Laeuft in der PC-App (nur unter *.trycloudflare.com): prueft den Tunnel; bei 2 Fehlern zurueck zum Gateway, das die neue Adresse kennt. */
function watchScript(): Response {
  const body = `(() => {
  if (!/\\.trycloudflare\\.com$/i.test(location.hostname)) return;
  // helium-pairfix: nie auf einer Einmal-Link-Adresse stehen bleiben (Reload wuerde den Token erneut senden).
  try { if (/^\\/(pair|__connect\\/(pc-)?pair)\\/?$/.test(location.pathname)) history.replaceState(history.state, "", "/"); } catch (e) {}
  const GATEWAY = ${JSON.stringify(GATEWAY_URL)};
  let fails = 0, busy = false, retry = null;
  async function ping() {
    if (busy || navigator.onLine === false) return;
    busy = true;
    let ok = false;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch("/__connect/ping?t=" + Date.now(), { cache: "no-store", credentials: "same-origin", signal: ctl.signal });
      clearTimeout(t);
      ok = r.ok && (await r.text()).indexOf("connect-tunnel-ok") >= 0;
    } catch (e) { ok = false; }
    busy = false;
    if (ok) { fails = 0; return; }
    fails++;
    if (fails >= 2) { location.replace(GATEWAY + (GATEWAY.indexOf("?") >= 0 ? "&" : "?") + "from=tunnel"); return; }
    clearTimeout(retry);
    retry = setTimeout(ping, 3000);
  }
  setInterval(ping, 15000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") ping(); });
  window.addEventListener("online", () => setTimeout(ping, 1000));
})();
`;
  return new Response(body, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
}
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const PUBLIC_STATIC = /^\/(manifest\.webmanifest|favicon\.(ico|svg|png)|apple-touch-icon[\w-]*\.png|icon[\w-]*\.(png|svg)|icons\/[\w.-]+\.(png|svg|webp))$/;

type Actor = { id: string; name: string; role: string };
type AuthLike = { $context?: Promise<any> } | undefined;

export type TunnelGateOptions = {
  port: number;
  auth: unknown;
  resolveActor: (request: Request) => Promise<Actor>;
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });

const html = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      ...extra,
    },
  });

function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function parseCookies(header: string | null): Array<[string, string]> {
  if (!header) return [];
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf("=");
      return i < 0 ? [part, ""] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    });
}

async function signCookieValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`);
}

function deviceLabel(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const kind = ua.includes("iphone") ? "iPhone" : ua.includes("ipad") ? "iPad" : ua.includes("android") ? "Android-Handy" : "Handy";
  const date = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date());
  return `${kind} (${date})`;
}

/** PC-Login (Laptop per QR + Handy-Freigabe): "Laptop (Windows) 23.10.2026". */
function laptopLabel(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const os = ua.includes("windows") ? "Windows" : ua.includes("mac os") ? "macOS" : ua.includes("cros") ? "ChromeOS" : ua.includes("linux") ? "Linux" : "Browser";
  const date = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date());
  return `Laptop (${os}) ${date}`;
}

/** Gateway-Geraet: "Handy (Android) 23.10.2026" bzw. "Browser (Windows) 23.10.2026". */
function gatewayLabel(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const mobile = /android|iphone|ipad|mobile/.test(ua);
  const os = ua.includes("android") ? "Android" : /iphone|ipad/.test(ua) ? "iOS" : ua.includes("windows") ? "Windows" : ua.includes("mac os") ? "macOS" : ua.includes("cros") ? "ChromeOS" : ua.includes("linux") ? "Linux" : "Browser";
  const date = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date());
  return `${mobile ? "Handy" : "Browser"} (${os}) ${date}`;
}

export function createTunnelGate(options: TunnelGateOptions) {
  const config: TunnelConfig = loadTunnelConfig(options.port);
  const store = createTunnelStore(config.dataDir);
  const tunnel = createTunnelProcess(config, store);
  // PC-Login: Tunnel-URL in Supabase melden + Einmal-Tokens vom Laptop pruefen (siehe pc-login.ts).
  const pcLogin = createPcLogin({ dataDir: config.dataDir, state: () => tunnel.state(), onChange: (listener) => tunnel.onChange(listener) });
  const auth = options.auth as AuthLike;
  const pairTokens = new Map<string, { userId: string; expiresAt: number }>();
  let failedPairs: number[] = [];
  const sessionCache = new Map<string, { cookie: string; checkedAt: number }>();
  const localHost = new URL(config.localOrigin).host;
  /*
   * Kopplung per Kommandozeile (headless VM, Tests): scripts/tunnel/pair.ps1|.sh liest diesen
   * Schluessel aus dem Datenordner (nur fuer den Benutzer lesbar) und schickt ihn lokal mit.
   * Gilt nur fuer lokale Anfragen und nur fuer den Besitzer CONNECT_TUNNEL_OWNER_USER_ID bzw.
   * CONNECT_SINGLE_USER_ID. Ueber den Tunnel ist /api/tunnel/* immer gesperrt.
   */
  const keyPath = join(config.dataDir, "admin.key");
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32).toString("base64url"), { encoding: "utf8", mode: 0o600 });
  const adminKey = readFileSync(keyPath, "utf8").trim();
  const ownerId = process.env.CONNECT_TUNNEL_OWNER_USER_ID?.trim() || process.env.CONNECT_SINGLE_USER_ID?.trim() || null;
  const keyActor = (request: Request): Actor | null => {
    const given = request.headers.get("x-connect-tunnel-key");
    if (!given || !ownerId || !adminKey) return null;
    const a = Buffer.from(given);
    const b = Buffer.from(adminKey);
    return a.length === b.length && timingSafeEqual(a, b) ? { id: ownerId, name: "cli", role: "admin" } : null;
  };

  const tunnelHosts = () => {
    const hosts = new Set<string>();
    for (const url of [tunnel.state().url, config.publicUrl]) {
      const host = hostnameOf(url);
      if (host) hosts.add(host);
    }
    return hosts;
  };

  function isTunnelRequest(request: Request): boolean {
    const h = request.headers;
    if (h.get("cf-ray") || h.get("cf-connecting-ip") || h.get("cf-visitor") || /cloudflare/i.test(h.get("cdn-loop") ?? "")) return true;
    const host = hostnameOf(h.get("host"));
    if (!host) return false;
    if (host.endsWith(".trycloudflare.com") || tunnelHosts().has(host)) return true;
    // Weitergeleitet von irgendeinem anderen Proxy an einen nicht-lokalen Host: ebenfalls wie Tunnel behandeln.
    if ((h.get("x-forwarded-for") || h.get("forwarded")) && !LOOPBACK_HOSTS.has(host) && !host.endsWith(".localhost")) return true;
    return false;
  }

  async function authContext(): Promise<any | null> {
    try {
      const ctx = auth?.$context ? await auth.$context : null;
      return ctx?.internalAdapter && ctx?.authCookies?.sessionToken?.name && ctx?.secret ? ctx : null;
    } catch {
      return null;
    }
  }

  /** Better-Auth-Sitzungscookie fuer das Geraet (eigene Sitzung je Geraet, bei Bedarf neu). */
  async function sessionCookieFor(device: PairedDevice): Promise<string | null> {
    const cached = sessionCache.get(device.id);
    // Keep the cache short so a revoked/expired transient tunnel session is recovered quickly.
    // The mobile client retries its signed-in check while the sign-in landing page is open.
    if (cached && Date.now() - cached.checkedAt < 30_000) return cached.cookie;
    const ctx = await authContext();
    if (!ctx) return null; // Einzelnutzer-Modus: keine Sitzung noetig
    let token = device.sessionToken;
    if (token) {
      const found = await ctx.internalAdapter.findSession(token).catch(() => null);
      const expires = found?.session?.expiresAt ? new Date(found.session.expiresAt).getTime() : 0;
      if (!found || found.user?.id !== device.userId || expires < Date.now() + 24 * 3600_000) {
        if (found) await ctx.internalAdapter.deleteSession(token).catch(() => {});
        token = null;
      }
    }
    if (!token) {
      const session = await ctx.internalAdapter.createSession(device.userId, false, {
        userAgent: `Connect-Handy-Tunnel: ${device.label}`,
        ipAddress: "",
      });
      token = session?.token ?? null;
      if (!token) return null;
      store.setSession(device, token);
    }
    const cookie = `${ctx.authCookies.sessionToken.name}=${await signCookieValue(token, ctx.secret)}`;
    sessionCache.set(device.id, { cookie, checkedAt: Date.now() });
    return cookie;
  }

  async function revoke(device: PairedDevice) {
    sessionCache.delete(device.id);
    store.remove(device.id);
    if (device.sessionToken) {
      const ctx = await authContext();
      await ctx?.internalAdapter.deleteSession(device.sessionToken).catch(() => {});
    }
  }

  function deviceFrom(request: Request): PairedDevice | null {
    const value = parseCookies(request.headers.get("cookie")).find(([name]) => name === DEVICE_COOKIE)?.[1];
    return store.verify(value ? decodeURIComponent(value) : null);
  }

  // helium-pairfix: Rohwert des Geraete-Cookies (zum Verlaengern der Laufzeit, unveraendert zurueckgesetzt).
  function rawDeviceCookie(request: Request): string | null {
    return parseCookies(request.headers.get("cookie")).find(([name]) => name === DEVICE_COOKIE)?.[1] ?? null;
  }
  const deviceCookieHeader = (encodedValue: string) =>
    `${DEVICE_COOKIE}=${encodedValue}; Path=/; Max-Age=${DEVICE_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
  function validOwnerDevice(request: Request): PairedDevice | null {
    const device = deviceFrom(request);
    return device && (!ownerId || device.userId === ownerId) ? device : null;
  }
  /** Saubere App-Adresse ohne Token; ein gueltiges Cookie wird dabei verlaengert (gleicher Wert). */
  function cleanRedirect(device?: PairedDevice | null, request?: Request): Response {
    const headers: Record<string, string> = { location: "/", "cache-control": "no-store", "referrer-policy": "no-referrer" };
    const raw = request ? rawDeviceCookie(request) : null;
    if (device && raw) headers["set-cookie"] = deviceCookieHeader(raw);
    return new Response(null, { status: 303, headers });
  }
  const expiredPage = (from: string) => html(pairExpiredPage(GATEWAY_URL, from), 410);

  const publicDevice = (d: PairedDevice) => ({ id: d.id, label: d.label, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt, userAgent: d.userAgent });

  function qrSvg(text: string) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  }

  // ---------------------------------------------------------------- lokal: /api/tunnel/*
  async function localApi(request: Request, url: URL): Promise<Response> {
    let actor: Actor;
    const viaKey = keyActor(request);
    if (viaKey) actor = viaKey;
    else {
      try {
        actor = await options.resolveActor(request);
      } catch {
        return json({ error: "Bitte anmelden." }, 401);
      }
    }
    const unsafe = request.method !== "GET" && request.method !== "HEAD";
    // Eigener Header erzwingt bei Fremdseiten einen CORS-Preflight, der scheitert -> kein CSRF.
    if (unsafe && !viaKey && request.headers.get("x-connect-tunnel") !== "1") return json({ error: "Header x-connect-tunnel fehlt" }, 403);
    const path = url.pathname.replace(/\/+$/, "");
    const state = tunnel.state();
    const mine = (d: PairedDevice) => actor.role === "admin" || d.userId === actor.id;
    if (path === "/api/tunnel/status" && request.method === "GET") {
      return json({
        mode: config.mode,
        status: state.status,
        url: state.url,
        error: state.error,
        startedAt: state.startedAt,
        lastReadyAt: state.lastReadyAt,
        guard: config.guard,
        binary: Boolean(config.bin),
        fixedUrl: config.mode === "named" || config.mode === "external",
        devices: store.devices().filter(mine).length,
        pcLogin: pcLogin.status(),
      });
    }
    if (path === "/api/tunnel/pair" && request.method === "POST") {
      if (!state.url || state.status !== "online") return json({ error: "Der Tunnel ist gerade nicht online.", status: state.status }, 409);
      for (const [key, value] of pairTokens) if (value.expiresAt < Date.now()) pairTokens.delete(key);
      const token = randomBytes(24).toString("base64url");
      const expiresAt = Date.now() + PAIR_TTL_MS;
      pairTokens.set(token, { userId: actor.id, expiresAt });
      const pairUrl = `${state.url}/__connect/pair?t=${token}`;
      return json({ url: state.url, pairUrl, expiresAt: new Date(expiresAt).toISOString(), qrSvg: qrSvg(pairUrl) });
    }
    if (path === "/api/tunnel/devices" && request.method === "GET") {
      return json({ devices: store.devices().filter(mine).map(publicDevice) });
    }
    const match = path.match(/^\/api\/tunnel\/devices\/([\w-]+)$/);
    if (match && request.method === "DELETE") {
      const device = store.devices().find((d) => d.id === match[1]);
      if (!device || !mine(device)) return json({ error: "Gerät nicht gefunden" }, 404);
      await revoke(device);
      return json({ ok: true });
    }
    if (path === "/api/tunnel/restart" && request.method === "POST") {
      void tunnel.restart();
      return json({ ok: true });
    }
    return json({ error: "Unbekannt" }, 404);
  }

  // ---------------------------------------------------------------- Tunnel: Kopplung
  async function pair(request: Request, url: URL): Promise<Response> {
    const now = Date.now();
    failedPairs = failedPairs.filter((t) => now - t < 10 * 60_000);
    if (failedPairs.length > 30) return html(pairFailedPage("Zu viele Versuche. Bitte in ein paar Minuten erneut."), 429);
    if (request.method === "GET") {
      const token = url.searchParams.get("t") ?? "";
      const entry = pairTokens.get(token);
      if (!entry || entry.expiresAt < now) {
        if (validOwnerDevice(request)) return cleanRedirect(validOwnerDevice(request), request);
        failedPairs.push(now);
        return expiredPage("pair-expired");
      }
      return html(pairPage(token, deviceLabel(request.headers.get("user-agent") ?? "")));
    }
    if (request.method !== "POST") return html(pairFailedPage("Ungültige Anfrage."), 405);
    const origin = request.headers.get("origin");
    if (origin && origin !== "null" && hostnameOf(origin) !== hostnameOf(request.headers.get("host"))) {
      return html(pairFailedPage("Ungültige Herkunft."), 403);
    }
    const form = await request.formData().catch(() => null);
    const token = String(form?.get("t") ?? "");
    const entry = pairTokens.get(token);
    pairTokens.delete(token); // Einmal-Token: in jedem Fall verbraucht
    if (!entry || entry.expiresAt < now) {
      if (validOwnerDevice(request)) return cleanRedirect(validOwnerDevice(request), request);
      failedPairs.push(now);
      return expiredPage("pair-expired");
    }
    const userAgent = request.headers.get("user-agent") ?? "";
    const name = String(form?.get("name") ?? "").trim() || deviceLabel(userAgent);
    const { device, cookieValue } = store.addDevice({ label: name, userId: entry.userId, userAgent });
    await sessionCookieFor(device).catch((error) => console.warn("[tunnel] Sitzung fuer Geraet:", error));
    console.info(`[tunnel] Geraet gekoppelt: ${device.id} (${device.label})`);
    return new Response(null, {
      status: 303,
      headers: {
        location: "/",
        "cache-control": "no-store",
        "set-cookie": `${DEVICE_COOKIE}=${encodeURIComponent(cookieValue)}; Path=/; Max-Age=${DEVICE_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  // ---------------------------------------------------------------- Tunnel: Laptop-Anmeldung (PC-Login)
  async function pcPair(request: Request, url: URL): Promise<Response> {
    const now = Date.now();
    failedPairs = failedPairs.filter((t) => now - t < 10 * 60_000);
    if (failedPairs.length > 30) return html(pairFailedPage("Zu viele Versuche. Bitte in ein paar Minuten erneut."), 429);
    if (request.method !== "GET") return html(pairFailedPage("Ungültige Anfrage."), 405);
    if (!ownerId) return html(pairFailedPage("Auf diesem PC ist kein Besitzer eingerichtet (CONNECT_SINGLE_USER_ID)."), 503);
    const token = url.searchParams.get("token") ?? "";
    const userAgent = request.headers.get("user-agent") ?? "";
    // helium-pairfix: Geraet schon gekoppelt? Dann fuehrt ein verbrauchter/abgelaufener Link nie in eine Fehlerseite.
    const existing = deviceFrom(request);
    const result = await pcLogin.consume(token, userAgent);
    if (!result.ok) {
      if (existing && existing.userId === ownerId) {
        store.touch(existing);
        console.info(`[tunnel] Einmal-Link schon benutzt, Geraet ${existing.id} hat gueltiges Cookie -> App`);
        return cleanRedirect(existing, request);
      }
      failedPairs.push(now);
      console.info("[tunnel] Einmal-Link ungueltig/benutzt, kein Geraete-Cookie -> Gateway");
      return expiredPage("pair-expired");
    }
    // helium-gateway: bekanntes Geraet wiederverwenden statt bei jedem Besuch/Tunnel-Wechsel ein neues anzulegen.
    let device: PairedDevice | null = null;
    let cookieValue: string | null = null;
    let how = "neu";
    if (existing && existing.userId === ownerId) {
      device = existing;
      store.touch(existing);
      how = "Cookie vorhanden";
    } else if (result.browserKeyHash) {
      const match = store
        .devices()
        .filter((d) => d.browserKeyHash === result.browserKeyHash && d.userId === ownerId && d.userAgent === userAgent.slice(0, 300))
        .sort((a, b) => String(b.lastSeenAt ?? "").localeCompare(String(a.lastSeenAt ?? "")))[0];
      const reissued = match ? store.reissue(match.id) : null;
      if (reissued) {
        device = reissued.device;
        cookieValue = reissued.cookieValue;
        how = "gleicher Browser, neues Geheimnis";
      }
    }
    if (!device) {
      const label = result.via === "gateway" ? gatewayLabel(userAgent) : laptopLabel(userAgent);
      const added = store.addDevice({ label, userId: ownerId, userAgent, via: result.via === "gateway" ? "gateway" : "pc-login", browserKeyHash: result.browserKeyHash });
      device = added.device;
      cookieValue = added.cookieValue;
    }
    await sessionCookieFor(device).catch((error) => console.warn("[tunnel] Sitzung fuer Laptop:", error));
    await pcLogin.paired(result.requestId, device.id);
    console.info(`[tunnel] ${result.via === "gateway" ? "Gateway" : "Handy-Freigabe"}: ${device.id} (${device.label}) – ${how}`);
    return new Response(null, {
      status: 303,
      headers: {
        location: "/",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        ...(cookieValue
          ? { "set-cookie": deviceCookieHeader(encodeURIComponent(cookieValue)) }
          : rawDeviceCookie(request)
            ? { "set-cookie": deviceCookieHeader(rawDeviceCookie(request) as string) }
            : {}),
      },
    });
  }

  // ---------------------------------------------------------------- Einstieg
  async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    // helium-cliremote: Geraete-Kennung nur vom Gate selbst (nie vom Client uebernehmen).
    request.headers.delete("x-connect-tunnel-device");
    const tunnelRequest = config.guard && isTunnelRequest(request);
    if (!tunnelRequest) {
      if (url.pathname.startsWith("/api/tunnel/") || url.pathname === "/api/tunnel") return localApi(request, url);
      if (url.pathname === "/__connect/watch.js") return watchScript();
      return null;
    }
    const path = url.pathname;
    if (path === "/__connect/ping") return new Response("connect-tunnel-ok", { headers: { "cache-control": "no-store" } });
    if (path === "/__connect/watch.js") return watchScript();
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
    if (path === "/__connect/pair") return pair(request, url);
    if (path === "/__connect/pc-pair" || (path === "/pair" && url.searchParams.has("token"))) return pcPair(request, url);
    if (request.method === "GET" && PUBLIC_STATIC.test(path)) {
      request.headers.delete("cookie");
      request.headers.set("host", localHost);
      return null;
    }
    // Connect-MCP API über Tunnel: Auth erfolgt per Bearer-Token im Connect-MCP-Router
    if (path.startsWith("/api/connect-mcp")) {
      request.headers.set("host", localHost);
      const origin = request.headers.get("origin");
      if (origin && origin !== "null") request.headers.set("origin", config.localOrigin);
      return null;
    }
    const device = deviceFrom(request);
    if (!device) {
      const isApi = path.startsWith("/api/") || request.headers.get("upgrade")?.toLowerCase() === "websocket";
      if (isApi) return json({ error: "Nicht gekoppelt. Bitte am PC in Connect › Handy verbinden den QR-Code scannen." }, 401);
      // helium-gateway: Weg zurueck ueber das Gateway (kennt immer die aktuelle Tunnel-Adresse).
      const gatewayLink = `<p style="text-align:center;margin:18px 0 0"><a href="${GATEWAY_URL}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:600">Über Connect anmelden</a></p>`;
      // helium-stale: abgelaufene/fehlende Kopplung -> automatisch ueber das Gateway neu verbinden
      // (meta refresh, weil die CSP dieser Seite keine Skripte erlaubt).
      const lockedRaw = lockedPage();
      const autoGateway = `<meta http-equiv="refresh" content="2;url=${GATEWAY_URL}?from=locked">`;
      const page = lockedRaw.includes("</head>") ? lockedRaw.replace("</head>", `${autoGateway}</head>`) : autoGateway + lockedRaw;
      return html(page.includes("</body>") ? page.replace("</body>", `${gatewayLink}</body>`) : page + gatewayLink, 401);
    }
    if (path === "/api/tunnel" || path.startsWith("/api/tunnel/")) return json({ error: "Nur am PC verfügbar." }, 403);
    const method = request.method.toUpperCase();
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
    const host = hostnameOf(request.headers.get("host"));
    const origin = request.headers.get("origin");
    if (unsafe || request.headers.get("upgrade")) {
      if (origin && origin !== "null" && hostnameOf(origin) !== host) return json({ error: "Ungültige Herkunft." }, 403);
      if (!origin && request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Ungültige Herkunft." }, 403);
    }
    if (path === "/api/auth/sign-out" && method === "POST") {
      await revoke(device);
      return json({ success: true }, 200, { "set-cookie": `${DEVICE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
    }
    // Als die Person weiterreichen, die gekoppelt hat.
    const forwarded = parseCookies(request.headers.get("cookie")).filter(
      ([name]) => name !== DEVICE_COOKIE && !/^(__Secure-|__Host-)?better-auth\./.test(name),
    );
    let sessionCookie: string | null = null;
    try {
      sessionCookie = await sessionCookieFor(device);
    } catch (error) {
      console.warn("[tunnel] Sitzung:", error);
      return json({ error: "Sitzung konnte nicht erstellt werden." }, 503);
    }
    const cookie = [...forwarded.map(([n, v]) => `${n}=${v}`), ...(sessionCookie ? [sessionCookie] : [])].join("; ");
    if (cookie) request.headers.set("cookie", cookie);
    else request.headers.delete("cookie");
    request.headers.set("host", localHost);
    if (origin && origin !== "null") request.headers.set("origin", config.localOrigin);
    const referer = request.headers.get("referer");
    if (referer && host && hostnameOf(referer) === host) {
      try {
        const r = new URL(referer);
        request.headers.set("referer", `${config.localOrigin}${r.pathname}${r.search}`);
      } catch {}
    }
    request.headers.set("x-connect-tunnel-device", device.id);
    store.touch(device);
    return null;
  }

  return {
    handle,
    async start() {
      if (config.mode !== "off") console.info(`[tunnel] Modus ${config.mode}, Daten ${config.dataDir}`);
      await tunnel.start().catch((error) => console.warn("[tunnel] Start fehlgeschlagen:", error));
      if (config.mode !== "off") pcLogin.start();
    },
    stop: () => {
      pcLogin.stop();
      return tunnel.stop();
    },
    config,
  };
}
