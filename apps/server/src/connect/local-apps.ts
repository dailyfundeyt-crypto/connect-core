import { like } from "drizzle-orm";
import type { Hono, MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";
import type { Database } from "../db/client";
import { connectWorkspaceKv } from "../db/schema";

/**
 * Handy-In-App-Browser (Executor helium-inappbrowser, 17.10.2026).
 *
 * 1. GET /api/embed-check?url=…  (mit Login): lädt nur die Kopfzeilen der Seite und meldet,
 *    ob sie sich in einen Frame einbetten lässt (X-Frame-Options / CSP frame-ancestors).
 * 2. /apps/<port>/…  (nur lokaler Connect-Server, mit Login): Reverse-Proxy auf
 *    http://127.0.0.1:<port>/…, damit Stefans lokale Apps (z. B. Vite auf 5173) über den
 *    QR-Tunnel auf dem Handy laufen. Nur Ports, die als localhost-Link bei einer Firma
 *    gespeichert sind (connect.level3.browser / connect.company.siteUrl des angemeldeten Kontos).
 * 3. Absolute Pfade der App (/assets/…, /src/…, /api/…): Anfragen, deren Referer unter
 *    /apps/<port>/ liegt, werden per 307 auf /apps/<port>/… umgeleitet.
 */

type Env = { Variables: AppVariables };

const BLOCKED_PORTS = new Set([5544, 5432, 5433, 22, 3389]);
const APP_PATH = /^\/apps\/(\d{2,5})(\/.*)?$/;

function selfPort(): number {
  const n = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 3101);
  return Number.isFinite(n) ? n : 3101;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "0.0.0.0" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** frame-ancestors / X-Frame-Options auswerten. `origin` = Connect-Origin, die einbetten will. */
export function frameVerdict(headers: Headers, origin: string | null): { embeddable: boolean; reason?: string } {
  const xfo = (headers.get("x-frame-options") ?? "").trim().toLowerCase();
  const csp = headers.get("content-security-policy") ?? "";
  const fa = csp
    .split(/[;,]/)
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith("frame-ancestors"));
  if (fa) {
    const sources = fa.split(/\s+/).slice(1).map((s) => s.toLowerCase());
    if (sources.includes("*")) return { embeddable: true };
    if (origin) {
      const o = origin.toLowerCase();
      const host = (() => {
        try {
          return new URL(o).host;
        } catch {
          return "";
        }
      })();
      const ok = sources.some((s) => {
        const src = s.replace(/^'|'$/g, "");
        if (src === o || src === host) return true;
        if (src === "https:" && o.startsWith("https:")) return true;
        if (src.startsWith("*.")) return host.endsWith(src.slice(1)) || host.endsWith(src.slice(2));
        if (src.startsWith("https://*.")) return host.endsWith(src.slice("https://*".length));
        return false;
      });
      if (ok) return { embeddable: true };
    }
    return { embeddable: false, reason: "csp" };
  }
  if (xfo === "deny" || xfo === "sameorigin" || xfo.startsWith("allow-from")) {
    return { embeddable: false, reason: "x-frame-options" };
  }
  return { embeddable: true };
}

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function embedCheck(rawUrl: string, origin: string | null) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { status: 400, body: { error: "Ungültige Adresse." } };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { status: 400, body: { error: "Nur http(s)." } };
  }
  if (isPrivateHost(url.hostname)) {
    return { status: 200, body: { url: url.href, embeddable: null, reason: "local" } };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "de-DE,de;q=0.9" },
      });
      try {
        await res.body?.cancel();
      } catch {}
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, current);
        if (isPrivateHost(next.hostname) || (next.protocol !== "https:" && next.protocol !== "http:")) break;
        current = next;
        continue;
      }
      const verdict = frameVerdict(res.headers, origin);
      return {
        status: 200,
        body: { url: url.href, finalUrl: current.href, httpStatus: res.status, ...verdict },
      };
    }
    return { status: 200, body: { url: url.href, embeddable: null, reason: "redirects" } };
  } catch {
    return { status: 200, body: { url: url.href, embeddable: null, reason: "unreachable" } };
  } finally {
    clearTimeout(timer);
  }
}

function requestOrigin(headers: Headers): string | null {
  const origin = headers.get("origin");
  if (origin && origin !== "null") return origin;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return null;
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0]?.trim()}://${host}`;
}

/** GET /api/embed-check — lokal und (gleiche Logik als eigene Funktion) auf Vercel. */
export function installEmbedCheck(app: Hono<Env>, requireUser: MiddlewareHandler<Env>) {
  app.get("/api/embed-check", requireUser, async (context) => {
    const raw = context.req.query("url") ?? "";
    const result = await embedCheck(raw, requestOrigin(context.req.raw.headers));
    context.header("cache-control", "private, max-age=600");
    return context.json(result.body, result.status as 200);
  });
}

// ---------------------------------------------------------------------------------------------
// Lokaler App-Proxy
// ---------------------------------------------------------------------------------------------

const LOCAL_URL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1)(?::(\d{2,5}))?/gi;
const portCache = new Map<string, { at: number; ports: Set<number> }>();

/** Ports aus den gespeicherten Firmen-Links des Kontos (Whitelist). */
async function allowedPorts(database: Database, userId: string, fresh = false): Promise<Set<number>> {
  const hit = portCache.get(userId);
  if (!fresh && hit && Date.now() - hit.at < 10_000) return hit.ports;
  const rows = await database
    .select({ key: connectWorkspaceKv.key, value: connectWorkspaceKv.value })
    .from(connectWorkspaceKv)
    .where(like(connectWorkspaceKv.key, `u:${userId}:connect.%`));
  const ports = new Set<number>();
  const own = selfPort();
  for (const row of rows) {
    if (!/connect\.(level3\.browser|company\.siteUrl)$/.test(row.key)) continue;
    const text = typeof row.value === "string" ? row.value : JSON.stringify(row.value ?? "");
    for (const m of text.matchAll(LOCAL_URL)) {
      const port = m[1] ? Number(m[1]) : 80;
      if (port > 0 && port < 65536 && port !== own && !BLOCKED_PORTS.has(port)) ports.add(port);
    }
  }
  portCache.set(userId, { at: Date.now(), ports });
  return ports;
}

const HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
]);

function filterCookies(cookie: string | null): string | null {
  if (!cookie) return null;
  const kept = cookie
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c && !/^(__secure-|__host-)?better-auth/i.test(c));
  return kept.length ? kept.join("; ") : null;
}

function rewriteHtml(html: string, prefix: string): string {
  // Absolute Pfade in Attributen auf den Proxy-Präfix (doppelte // = protokollrelativ, bleibt).
  return html.replace(/(\s(?:src|href|action|poster)=["'])\/(?!\/)/gi, `$1${prefix}/`);
}

export function localAppRefererRedirect(): MiddlewareHandler<Env> {
  return async (context, next) => {
    const path = context.req.path;
    if (path.startsWith("/apps/")) return next();
    const referer = context.req.header("referer");
    if (!referer) return next();
    let ref: URL;
    try {
      ref = new URL(referer);
    } catch {
      return next();
    }
    const host = context.req.header("x-forwarded-host") ?? context.req.header("host");
    if (!host || ref.host !== host) return next();
    const m = APP_PATH.exec(ref.pathname);
    if (!m) return next();
    // Connects eigene Anmeldung bleibt bei Connect.
    if (path.startsWith("/api/auth/")) return next();
    const search = new URL(context.req.url).search;
    return context.redirect(`/apps/${m[1]}${path}${search}`, 307);
  };
}

export function installLocalAppProxy(
  app: Hono<Env>,
  requireUser: MiddlewareHandler<Env>,
  database: Database | undefined,
) {
  app.get("/api/local-apps/info", requireUser, async (context) => {
    const ports = database ? [...(await allowedPorts(database, context.get("actor").id, true))].sort((a, b) => a - b) : [];
    return context.json({ proxy: true, prefix: "/apps", ports });
  });

  const handler: MiddlewareHandler<Env> = async (context) => {
    const url = new URL(context.req.url);
    const m = APP_PATH.exec(url.pathname);
    if (!m) return context.notFound();
    const port = Number(m[1]);
    const rest = m[2] ?? "";
    if (!rest) return context.redirect(`/apps/${port}/${url.search}`, 308);
    if (!database) return context.text("Keine Datenbank.", 503);
    const actor = context.get("actor");
    let ports = await allowedPorts(database, actor.id);
    if (!ports.has(port)) ports = await allowedPorts(database, actor.id, true);
    if (!ports.has(port)) {
      return context.html(
        `<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#07080c;color:#ddd;font:15px system-ui;padding:24px">Port ${port} ist nicht freigegeben. Leg zuerst bei einer Firma einen Link <b>http://localhost:${port}</b> an.</body>`,
        403,
      );
    }
    const prefix = `/apps/${port}`;
    const upstreamOrigin = `http://localhost:${port}`;
    const target = `http://127.0.0.1:${port}${rest}${url.search}`;
    const headers = new Headers();
    context.req.raw.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (HOP.has(k) || k === "cookie" || k.startsWith("x-forwarded") || k.startsWith("cf-")) return;
      headers.set(key, value);
    });
    headers.set("host", `localhost:${port}`);
    headers.set("accept-encoding", "identity");
    const cookie = filterCookies(context.req.header("cookie") ?? null);
    if (cookie) headers.set("cookie", cookie);
    if (headers.has("origin")) headers.set("origin", upstreamOrigin);
    const referer = headers.get("referer");
    if (referer) {
      try {
        const r = new URL(referer);
        const rm = APP_PATH.exec(r.pathname);
        headers.set("referer", `${upstreamOrigin}${rm?.[2] ?? "/"}${r.search}`);
      } catch {
        headers.delete("referer");
      }
    }
    const method = context.req.method;
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : context.req.raw.body,
        redirect: "manual",
        // @ts-expect-error Bun: Streaming-Body braucht duplex
        duplex: "half",
      });
    } catch {
      return context.html(
        `<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#07080c;color:#ddd;font:15px system-ui;padding:24px">Die App auf Port ${port} antwortet nicht. Läuft sie auf deinem PC?</body>`,
        502,
      );
    }
    const out = new Headers();
    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (HOP.has(k) || k === "content-encoding" || k === "x-frame-options" || k === "content-security-policy" || k === "set-cookie") return;
      out.append(key, value);
    });
    for (const sc of upstream.headers.getSetCookie?.() ?? []) {
      out.append("set-cookie", sc.replace(/;\s*domain=[^;]*/gi, ""));
    }
    const loc = upstream.headers.get("location");
    if (loc) {
      let next = loc;
      const abs = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::(\d+))?(\/.*)?$/i.exec(loc);
      if (abs && Number(abs[1] ?? 80) === port) next = `${prefix}${abs[2] ?? "/"}`;
      else if (loc.startsWith("/") && !loc.startsWith("//")) next = `${prefix}${loc}`;
      out.set("location", next);
    }
    out.set("referrer-policy", "same-origin");
    out.set("cache-control", out.get("cache-control") ?? "no-store");
    const type = upstream.headers.get("content-type") ?? "";
    if (type.includes("text/html") && method !== "HEAD") {
      const html = rewriteHtml(await upstream.text(), prefix);
      return new Response(html, { status: upstream.status, headers: out });
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  };
  app.all("/apps/:port", requireUser, handler);
  app.all("/apps/:port/*", requireUser, handler);
}
