/**
 * PC-Login (helium-pclogin, 23.10.2026), Vercel-Seite: Laptop meldet sich per QR + Handy-Freigabe an der
 * Connect App des eigenen PCs an (ueber dessen Cloudflare-Tunnel).
 *
 *   POST /api/pc-login/requests               (oeffentlich, Rate-Limit je IP)  -> { id, code, pollSecret, expiresAt, approveUrl, qrSvg }
 *   GET  /api/pc-login/requests/:id/status    (Header x-pc-login-secret)       -> { status } | { status:"approved", redirect }
 *   GET  /api/pc-login/requests/:id           (angemeldet)                     -> Geraeteinfos + Zustand des eigenen PCs
 *   POST /api/pc-login/requests/:id/approve   (angemeldet, Header x-pc-login: 1)
 *   POST /api/pc-login/requests/:id/deny      (angemeldet, Header x-pc-login: 1)
 *
 *   POST /api/gateway/open                    (angemeldet, Header x-pc-login: 1) -> { status:"redirect", url } | { status:"offline", pc }
 *   GET  /api/gateway/pc                      (angemeldet)                     -> { pc, account } (fuer Offline-Seite / Diagnose)
 *
 * PC-Zuordnung (helium-pcoffline): ein Konto sieht einen PC, wenn es dessen Besitzer ist ODER vom PC selbst als
 * verknuepftes Konto gemeldet wird (connect_pc_endpoints.linked_user_ids / linked_emails, nur verifizierte E-Mails).
 * Gateway (helium-gateway): angemeldete Nutzer bekommen direkt (selbst freigegeben) ein 60-s-Einmal-Token fuer
 * die aktuelle Tunnel-Adresse ihres PCs – gleicher Mechanismus/Tabelle wie die Handy-Freigabe.
 *
 * Sicherheit: Anfrage 2 min gueltig; nur Hashes von Abfrage-Geheimnis und Token in der DB; die Tunnel-URL
 * und das Einmal-Token (60 s) bekommt NUR der Inhaber des Abfrage-Geheimnisses und NUR nach Freigabe durch
 * eine angemeldete Sitzung. Der PC prueft und verbraucht das Token selbst direkt in der DB (pc-login.ts).
 * Laeuft im Vercel-Bundle: keine Node-/Hono-Importe.
 */
import type { Q } from "./store";

export const PC_LOGIN_REQUEST_TTL_S = 120;
export const PC_LOGIN_TOKEN_TTL_S = 60;
export const PC_ENDPOINT_ONLINE_S = 90;
const MAX_REQUESTS_PER_IP_10MIN = 20;
const MAX_APPROVALS_PER_USER_10MIN = 15;
const MAX_GATEWAY_PER_USER_10MIN = 40;
const NO_STORE = { "cache-control": "no-store, max-age=0", "cdn-cache-control": "no-store", "vercel-cdn-cache-control": "no-store" };
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Ctx = {
  req: { param: (name: string) => string; header: (name: string) => string | undefined; url: string; json: () => Promise<unknown> };
  json: (body: unknown, status?: number, headers?: Record<string, string>) => Response;
  get: (key: string) => unknown;
};
type Handler = (context: Ctx, next: () => Promise<void>) => Promise<Response | void>;
type AppLike = {
  get: (path: string, ...handlers: Handler[]) => unknown;
  post: (path: string, ...handlers: Handler[]) => unknown;
};
export type QrSvg = (text: string) => string;

const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return b64url(new Uint8Array(digest));
}
function shortCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function actorId(context: Ctx): string | null {
  const actor = context.get("actor") as { id?: string } | undefined;
  return typeof actor?.id === "string" ? actor.id : null;
}

function clientIp(context: Ctx): string {
  const xff = context.req.header("x-forwarded-for") ?? "";
  return (context.req.header("x-real-ip") || xff.split(",")[0] || "").trim();
}

function coarseIp(ip: string): string {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split(".").slice(0, 2).join(".") + ".x.x";
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + ":…";
  return "";
}

function place(context: Ctx, ip: string): string {
  const dec = (v: string | undefined) => {
    try {
      return v ? decodeURIComponent(v) : "";
    } catch {
      return v ?? "";
    }
  };
  const city = dec(context.req.header("x-vercel-ip-city"));
  const country = dec(context.req.header("x-vercel-ip-country"));
  return [[city, country].filter(Boolean).join(", "), coarseIp(ip)].filter(Boolean).join(" · ").slice(0, 120);
}

/** Kurzbeschreibung eines User-Agents: "Chrome auf Windows". */
export function describeUserAgent(ua: string): { os: string; browser: string; kind: string } {
  const os = /windows/i.test(ua)
    ? "Windows"
    : /iphone|ipad/i.test(ua)
      ? "iOS"
      : /mac os x|macintosh/i.test(ua)
        ? "macOS"
        : /android/i.test(ua)
          ? "Android"
          : /cros/i.test(ua)
            ? "ChromeOS"
            : /linux/i.test(ua)
              ? "Linux"
              : "unbekannt";
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /opr\//i.test(ua)
      ? "Opera"
      : /firefox\//i.test(ua)
        ? "Firefox"
        : /chrome\//i.test(ua)
          ? "Chrome"
          : /safari\//i.test(ua)
            ? "Safari"
            : "Browser";
  const kind = /iphone|android.*mobile/i.test(ua) ? "Handy" : /ipad|tablet/i.test(ua) ? "Tablet" : "Laptop";
  return { os, browser, kind };
}

async function audit(q: Q, event: string, data: { requestId?: string | null; owner?: string | null; endpoint?: string | null; detail?: Record<string, unknown> }) {
  await q(
    "insert into connect_pc_login_audit (request_id, owner_user_id, endpoint_id, event, detail) values ($1, $2, $3, $4, $5::jsonb)",
    [data.requestId ?? null, data.owner ?? null, data.endpoint ?? null, event, JSON.stringify(data.detail ?? {})],
  ).catch((error) => console.warn("[pc-login] audit", error));
}

type EndpointRow = {
  endpoint_id: string;
  owner_user_id: string;
  device_name: string;
  tunnel_url: string | null;
  tunnel_status: string;
  enabled: boolean;
  last_seen: string;
  age_s: number;
  heartbeat_error: string | null;
};

/** Online = aktiv, Tunnel online, Adresse vorhanden, Heartbeat juenger als 90 s (Vergleich komplett in der DB: now() vs. timestamptz). */
const ONLINE_SQL = `e.enabled and e.tunnel_status = 'online' and e.tunnel_url is not null and e.last_seen > now() - interval '${PC_ENDPOINT_ONLINE_S} seconds'`;
const ENDPOINT_COLUMNS = `e.endpoint_id, e.owner_user_id, e.device_name, e.tunnel_url, e.tunnel_status, e.enabled, e.last_seen,
  greatest(0, extract(epoch from now() - e.last_seen))::int as age_s, e.heartbeat_error`;
/** Konto darf diesen PC nutzen: Besitzer oder vom PC verknuepft (ID bzw. verifizierte E-Mail). */
const ACCESS_SQL = `(e.owner_user_id = $1 or $1 = any(e.linked_user_ids)
   or (cardinality(e.linked_emails) > 0 and exists (select 1 from users u where u.id = $1 and u.email_verified and lower(u.email) = any(e.linked_emails))))`;

/** Bester PC des Kontos (online bevorzugt, sonst der zuletzt gesehene) – auch wenn offline, fuer genaue Gruende. */
async function endpointFor(q: Q, me: string): Promise<EndpointRow | undefined> {
  const rows = await q(
    `select ${ENDPOINT_COLUMNS}, (${ONLINE_SQL}) as online from connect_pc_endpoints e
      where ${ACCESS_SQL}
      order by (${ONLINE_SQL}) desc, e.last_seen desc limit 1`,
    [me],
  );
  return rows[0] as (EndpointRow & { online: boolean }) | undefined;
}

async function onlineEndpoint(q: Q, me: string): Promise<EndpointRow | undefined> {
  const row = (await endpointFor(q, me)) as (EndpointRow & { online: boolean }) | undefined;
  return row?.online ? row : undefined;
}

async function endpointById(q: Q, endpointId: string): Promise<EndpointRow | undefined> {
  const rows = await q(`select ${ENDPOINT_COLUMNS} from connect_pc_endpoints e where e.endpoint_id = $1 and ${ONLINE_SQL}`, [endpointId]);
  return rows[0] as EndpointRow | undefined;
}

function ago(seconds: number): string {
  if (seconds < 90) return `${seconds} s`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} Min.`;
  if (seconds < 48 * 3600) return `${Math.round(seconds / 3600)} Std.`;
  return `${Math.round(seconds / 86400)} Tagen`;
}

export type PcState = {
  online: boolean;
  reason: "online" | "no-pc" | "disabled" | "stale" | "tunnel-offline";
  message: string;
  name?: string;
  lastSeen?: string;
  secondsAgo?: number;
};

/** Genauer Zustand des PCs fuer Handy/Gateway. */
function pcState(row: (EndpointRow & { online?: boolean }) | undefined): PcState {
  if (!row)
    return {
      online: false,
      reason: "no-pc",
      message: "Für dieses Konto ist kein PC registriert. Melde dich mit dem Google-Konto an, mit dem dein PC verbunden ist, oder verknüpfe dieses Konto am PC.",
    };
  const base = { name: row.device_name, lastSeen: new Date(row.last_seen).toISOString(), secondsAgo: Number(row.age_s) };
  if (row.online) return { ...base, online: true, reason: "online", message: `${row.device_name} ist online.` };
  if (!row.enabled) return { ...base, online: false, reason: "disabled", message: "PC-Anmeldung ist auf deinem PC ausgeschaltet (CONNECT_PC_LOGIN=off)." };
  if (Number(row.age_s) > PC_ENDPOINT_ONLINE_S)
    return { ...base, online: false, reason: "stale", message: `Dein PC meldet sich seit ${ago(Number(row.age_s))} nicht. Läuft die Connect App und hat der PC Internet?` };
  return {
    ...base,
    online: false,
    reason: "tunnel-offline",
    message: `Connect läuft auf deinem PC, aber der Tunnel ist gerade ${row.tunnel_status === "starting" ? "im Aufbau" : "offline"}. Einen Moment …`,
  };
}

async function accountEmail(q: Q, me: string): Promise<string | null> {
  const rows = await q("select email from users where id = $1", [me]).catch(() => []);
  return typeof rows[0]?.email === "string" ? (rows[0].email as string) : null;
}

function safeTunnelUrl(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? u.origin : null;
  } catch {
    return null;
  }
}

export function installPcLoginRoutes(app: AppLike, requireUser: Handler, q: Q, qrSvg?: QrSvg) {
  const fail = (context: Ctx, error: unknown) => {
    console.error("[pc-login]", error);
    return context.json({ error: "PC-Anmeldung gerade nicht erreichbar." }, 500);
  };
  const csrf = (context: Ctx) => context.req.header("x-pc-login") === "1";

  // Laptop: neue Anfrage.
  app.post("/api/pc-login/requests", async (context) => {
    if (!csrf(context)) return context.json({ error: "Header x-pc-login fehlt." }, 403);
    try {
      const ip = clientIp(context);
      const ipHash = await sha256(`pc-login:${ip}`);
      const recent = await q(
        "select count(*)::int as n from connect_pc_login_requests where requester_ip_hash = $1 and created_at > now() - interval '10 minutes'",
        [ipHash],
      );
      if (Number(recent[0]?.n ?? 0) >= MAX_REQUESTS_PER_IP_10MIN) {
        await audit(q, "request_rate_limited", { detail: { place: place(context, ip) } });
        return context.json({ error: "Zu viele Anmeldeversuche. Bitte in ein paar Minuten erneut." }, 429);
      }
      // Alte Anfragen als abgelaufen markieren (keine Loeschung).
      await q("update connect_pc_login_requests set status = 'expired' where status in ('pending','approved') and expires_at < now() - interval '1 minute'").catch(() => {});
      const id = crypto.randomUUID();
      const pollSecret = randomToken(32);
      const code = shortCode();
      const ua = (context.req.header("user-agent") ?? "").slice(0, 400);
      const rows = await q(
        `insert into connect_pc_login_requests (id, short_code, poll_secret_hash, expires_at, requester_ua, requester_ip_hash, requester_place)
         values ($1, $2, $3, now() + ($4 || ' seconds')::interval, $5, $6, $7) returning expires_at`,
        [id, code, await sha256(pollSecret), String(PC_LOGIN_REQUEST_TTL_S), ua, ipHash, place(context, ip)],
      );
      await audit(q, "request_created", { requestId: id, detail: { place: place(context, ip), ua: describeUserAgent(ua) } });
      const origin = new URL(context.req.url).origin;
      const approveUrl = `${origin}/pc-login/approve?r=${id}`;
      return context.json({
        id,
        code,
        pollSecret,
        expiresAt: new Date(String(rows[0]?.expires_at)).toISOString(),
        approveUrl,
        qrSvg: qrSvg ? qrSvg(approveUrl) : null,
      });
    } catch (error) {
      return fail(context, error);
    }
  });

  // Laptop: Zustand abfragen. Nach Freigabe wird hier (einmalig) das 60-s-Token erzeugt.
  app.get("/api/pc-login/requests/:id/status", async (context) => {
    const id = context.req.param("id");
    const secret = context.req.header("x-pc-login-secret") ?? "";
    if (!UUID.test(id) || secret.length < 20) return context.json({ error: "Ungültige Anfrage." }, 400);
    try {
      const rows = await q(
        "select status, poll_secret_hash, expires_at < now() as expired, owner_user_id, endpoint_id from connect_pc_login_requests where id = $1",
        [id],
      );
      const row = rows[0] as { status: string; poll_secret_hash: string; expired: boolean; owner_user_id: string | null; endpoint_id: string | null } | undefined;
      if (!row || row.poll_secret_hash !== (await sha256(secret))) return context.json({ error: "Anfrage nicht gefunden." }, 404);
      if (row.status === "pending") return context.json({ status: row.expired ? "expired" : "pending" }, 200, NO_STORE);
      if (row.status !== "approved") return context.json({ status: row.status === "issued" ? "used" : row.status });
      if (row.expired) return context.json({ status: "expired" });
      const endpoint = row.endpoint_id ? await endpointById(q, row.endpoint_id) : undefined;
      const base = endpoint?.tunnel_url ? safeTunnelUrl(endpoint.tunnel_url) : null;
      if (!base) return context.json({ status: "pc-offline", error: "Dein PC ist gerade nicht erreichbar (Tunnel offline)." });
      const token = randomToken(32);
      const issued = await q(
        `update connect_pc_login_requests set status = 'issued', token_hash = $2, issued_at = now(),
                token_expires_at = now() + ($3 || ' seconds')::interval
          where id = $1 and status = 'approved' and expires_at > now() returning id`,
        [id, await sha256(token), String(PC_LOGIN_TOKEN_TTL_S)],
      );
      if (!issued.length) return context.json({ status: "used" });
      await audit(q, "token_issued", { requestId: id, owner: row.owner_user_id, endpoint: row.endpoint_id });
      return context.json({ status: "approved", redirect: `${base}/__connect/pc-pair?token=${encodeURIComponent(token)}` });
    } catch (error) {
      return fail(context, error);
    }
  });

  // Handy (angemeldet): Infos zur Anfrage.
  app.get("/api/pc-login/requests/:id", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Bitte anmelden." }, 401);
    const id = context.req.param("id");
    if (!UUID.test(id)) return context.json({ error: "Ungültige Anfrage." }, 400);
    try {
      const rows = await q(
        `select short_code, status, created_at, expires_at, expires_at < now() as expired, requester_ua, requester_place, owner_user_id
           from connect_pc_login_requests where id = $1`,
        [id],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return context.json({ error: "Anfrage nicht gefunden." }, 404);
      // Fremde (bereits von jemand anderem freigegebene) Anfragen nicht offenlegen.
      if (row.owner_user_id && row.owner_user_id !== me) return context.json({ error: "Anfrage nicht gefunden." }, 404);
      const pc = pcState(await endpointFor(q, me));
      const ua = String(row.requester_ua ?? "");
      return context.json({
        code: row.short_code,
        status: row.status === "pending" && row.expired ? "expired" : row.status,
        createdAt: new Date(String(row.created_at)).toISOString(),
        expiresAt: new Date(String(row.expires_at)).toISOString(),
        device: { ...describeUserAgent(ua), userAgent: ua, place: row.requester_place },
        pc,
        account: pc.reason === "no-pc" ? await accountEmail(q, me) : undefined,
      }, 200, NO_STORE);
    } catch (error) {
      return fail(context, error);
    }
  });

  const decide = (approve: boolean): Handler => async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Bitte anmelden." }, 401);
    if (!csrf(context)) return context.json({ error: "Header x-pc-login fehlt." }, 403);
    const id = context.req.param("id");
    if (!UUID.test(id)) return context.json({ error: "Ungültige Anfrage." }, 400);
    try {
      const recent = await q(
        "select count(*)::int as n from connect_pc_login_audit where owner_user_id = $1 and event in ('approved','denied','approve_failed') and at > now() - interval '10 minutes'",
        [me],
      );
      if (Number(recent[0]?.n ?? 0) >= MAX_APPROVALS_PER_USER_10MIN) return context.json({ error: "Zu viele Freigaben. Bitte kurz warten." }, 429);
      if (!approve) {
        const rows = await q("update connect_pc_login_requests set status = 'denied', owner_user_id = $2 where id = $1 and status = 'pending' returning id", [id, me]);
        await audit(q, "denied", { requestId: id, owner: me });
        return rows.length ? context.json({ ok: true, status: "denied" }) : context.json({ error: "Anfrage ist nicht mehr offen." }, 409);
      }
      const candidate = await endpointFor(q, me);
      const state = pcState(candidate);
      const endpoint = state.online ? candidate : undefined;
      if (!endpoint) {
        await audit(q, "approve_failed", { requestId: id, owner: me, detail: { reason: state.reason } });
        return context.json({ error: state.message, pc: state }, 409);
      }
      const rows = await q(
        `update connect_pc_login_requests set status = 'approved', owner_user_id = $2, endpoint_id = $3, approved_at = now()
          where id = $1 and status = 'pending' and expires_at > now() returning id`,
        [id, me, endpoint.endpoint_id],
      );
      if (!rows.length) {
        await audit(q, "approve_failed", { requestId: id, owner: me, detail: { reason: "not-pending" } });
        return context.json({ error: "Die Anfrage ist abgelaufen oder wurde schon benutzt. Bitte am Laptop neu starten." }, 409);
      }
      await audit(q, "approved", { requestId: id, owner: me, endpoint: endpoint.endpoint_id });
      return context.json({ ok: true, status: "approved", pc: endpoint.device_name });
    } catch (error) {
      return fail(context, error);
    }
  };
  app.post("/api/pc-login/requests/:id/approve", requireUser, decide(true));
  app.post("/api/pc-login/requests/:id/deny", requireUser, decide(false));

  // ---------------------------------------------------------------- Gateway (angemeldet -> eigener PC)
  app.get("/api/gateway/pc", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Bitte anmelden." }, 401, NO_STORE);
    try {
      const pc = pcState(await endpointFor(q, me));
      return context.json({ pc, account: await accountEmail(q, me) }, 200, NO_STORE);
    } catch (error) {
      return fail(context, error);
    }
  });

  app.post("/api/gateway/open", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Bitte anmelden." }, 401, NO_STORE);
    if (!csrf(context)) return context.json({ error: "Header x-pc-login fehlt." }, 403, NO_STORE);
    try {
      const candidate = await endpointFor(q, me);
      const pc = pcState(candidate);
      if (!pc.online || !candidate?.tunnel_url) return context.json({ status: "offline", pc, account: pc.reason === "no-pc" ? await accountEmail(q, me) : undefined }, 200, NO_STORE);
      const base = safeTunnelUrl(candidate.tunnel_url);
      if (!base) return context.json({ status: "offline", pc: { ...pc, online: false, reason: "tunnel-offline", message: "Ungültige Tunnel-Adresse." } }, 200, NO_STORE);
      const recent = await q(
        "select count(*)::int as n from connect_pc_login_audit where owner_user_id = $1 and event = 'gateway_issued' and at > now() - interval '10 minutes'",
        [me],
      );
      if (Number(recent[0]?.n ?? 0) >= MAX_GATEWAY_PER_USER_10MIN) {
        await audit(q, "gateway_rate_limited", { owner: me, endpoint: candidate.endpoint_id });
        return context.json({ status: "error", error: "Zu viele Weiterleitungen. Bitte in ein paar Minuten erneut." }, 429, NO_STORE);
      }
      const ip = clientIp(context);
      const ua = (context.req.header("user-agent") ?? "").slice(0, 400);
      const id = crypto.randomUUID();
      const token = randomToken(32);
      // Browser-Kennung (localStorage auf der Gateway-Seite): erlaubt dem PC, dasselbe Geraet nach Tunnel-Wechsel wiederzuverwenden.
      const input = (await context.req.json().catch(() => ({}))) as { browserKey?: unknown };
      const browserKey = typeof input?.browserKey === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(input.browserKey) ? input.browserKey : null;
      const browserKeyHash = browserKey ? await sha256(`gateway-browser:${me}:${browserKey}`) : null;
      await q(
        `insert into connect_pc_login_requests (id, short_code, poll_secret_hash, status, expires_at, requester_ua, requester_ip_hash, requester_place,
                                                owner_user_id, endpoint_id, approved_at, token_hash, token_expires_at, issued_at, via, browser_key_hash)
         values ($1, $2, $3, 'issued', now() + ($4 || ' seconds')::interval, $5, $6, $7, $8, $9, now(), $10, now() + ($11 || ' seconds')::interval, now(), 'gateway', $12)`,
        [id, shortCode(), await sha256(randomToken(32)), String(PC_LOGIN_REQUEST_TTL_S), ua, await sha256(`gateway:${ip}`), place(context, ip),
         me, candidate.endpoint_id, await sha256(token), String(PC_LOGIN_TOKEN_TTL_S), browserKeyHash],
      );
      await audit(q, "gateway_issued", { requestId: id, owner: me, endpoint: candidate.endpoint_id, detail: { place: place(context, ip), ua: describeUserAgent(ua) } });
      return context.json({ status: "redirect", url: `${base}/__connect/pc-pair?token=${encodeURIComponent(token)}`, pc }, 200, NO_STORE);
    } catch (error) {
      return fail(context, error);
    }
  });
}
