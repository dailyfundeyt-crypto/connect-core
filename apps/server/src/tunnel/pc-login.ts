/**
 * PC-Login (helium-pclogin 23.10.2026, robust gemacht in helium-pcoffline), PC-Seite.
 *
 * 1. Meldet die aktuelle Cloudflare-Tunnel-URL dieses PCs in Supabase (connect_pc_endpoints) unter der
 *    Online-Nutzer-ID aus pc-bridge.env (PC_BRIDGE_OWNER_USER_ID): alle 30 s und sofort, wenn der Tunnel
 *    neu startet / die Adresse wechselt. Fehler (Netz, Pooler, Auth) werden geloggt, die Verbindung wird
 *    neu aufgebaut und mit Backoff (5 s … 60 s) erneut versucht – der Heartbeat hoert nie still auf
 *    (Watchdog startet die Schleife neu, falls ein Aufruf haengt).
 * 2. Verknuepfte Konten: ausser dem Besitzer duerfen weitere Online-Konten diesen PC freigeben/oeffnen, wenn
 *    sie HIER (auf dem PC) eingetragen sind: pc-login.json { "linkedUserIds": [...], "linkedEmails": [...] }
 *    oder PC_LOGIN_LINKED_USER_IDS / PC_LOGIN_LINKED_EMAILS (Komma-Liste, connect.env/pc-bridge.env).
 * 3. Prueft und verbraucht Einmal-Tokens von /__connect/pc-pair?token=… direkt in der DB (atomar, 60 s,
 *    gebunden an Anfrage, genau diesen PC und ein berechtigtes Konto).
 * Ausschalten: CONNECT_PC_LOGIN=off (connect.env) – dann meldet der PC keine Adresse mehr (tunnel_url null).
 */
import { SQL } from "bun";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import type { TunnelState } from "./store";

type Q = (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
const HEARTBEAT_MS = 30_000;
const QUERY_TIMEOUT_MS = 15_000;
const BACKOFF_MIN_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;
const VERSION = "pc-login 3";

function bridgeEnvFile(): string {
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ConnectApp", "data") : join(homedir(), ".connect-app");
  return process.env.PC_BRIDGE_ENV_FILE || join(base, "pc-bridge.env");
}

const list = (value: unknown): string[] =>
  (Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split(",") : []).map((v) => v.trim()).filter(Boolean);

function readBridgeConfig(): { url: string; owner: string; label: string; linkedUserIds: string[]; linkedEmails: string[] } | null {
  const values: Record<string, string> = {};
  const file = bridgeEnvFile();
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match?.[1] && !line.trim().startsWith("#")) values[match[1]] = (match[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
  const pick = (name: string) => process.env[name]?.trim() || values[name]?.trim() || "";
  const url = pick("PC_BRIDGE_DATABASE_URL");
  const owner = pick("PC_BRIDGE_OWNER_USER_ID");
  if (!url || !owner || pick("PC_BRIDGE_DISABLED") === "1") return null;
  return {
    url,
    owner,
    label: pick("PC_BRIDGE_LABEL") || `PC ${hostname()}`,
    linkedUserIds: list(pick("PC_LOGIN_LINKED_USER_IDS")),
    linkedEmails: list(pick("PC_LOGIN_LINKED_EMAILS")).map((e) => e.toLowerCase()),
  };
}

type Client = { q: Q; close: () => void };
function connect(url: string): Client {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get("sslmode") ?? undefined;
  const tls = sslmode === undefined ? true : !["disable", "allow", "prefer"].includes(sslmode);
  const client = new SQL({
    adapter: "postgres",
    hostname: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres",
    ...(tls ? { tls: true } : {}),
    prepare: false,
    max: 2,
    idleTimeout: 30,
    connectionTimeout: 10,
  } as never);
  return {
    q: async (text, values = []) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return (await Promise.race([
          client.unsafe(text, values as never[]),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`DB-Zeitlimit (${QUERY_TIMEOUT_MS / 1000} s)`)), QUERY_TIMEOUT_MS);
          }),
        ])) as unknown as Record<string, unknown>[];
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    close: () => void Promise.resolve(client.close({ timeout: 1 } as never)).catch(() => {}),
  };
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/postgres(ql)?:\/\/[^\s]+/gi, "postgres://***").slice(0, 300);
const sha256 = (text: string) => createHash("sha256").update(text).digest("base64url");

export type PcLoginResult =
  | { ok: true; requestId: string; requesterUa: string; via: string; browserKeyHash: string | null }
  | { ok: false; reason: string };

export function createPcLogin(options: {
  dataDir: string;
  state: () => TunnelState;
  onChange: (listener: (s: TunnelState) => void) => unknown;
}) {
  const enabled = (process.env.CONNECT_PC_LOGIN ?? "").trim().toLowerCase() !== "off";
  const config = readBridgeConfig();
  const idFile = join(options.dataDir, "pc-login.json");
  let fileData: Record<string, unknown> = {};
  try {
    fileData = existsSync(idFile) ? (JSON.parse(readFileSync(idFile, "utf8")) as Record<string, unknown>) : {};
  } catch (error) {
    console.warn("[pc-login] pc-login.json unlesbar:", errorText(error));
  }
  let endpointId = String(fileData.endpointId ?? "");
  if (!/^[\w-]{16,64}$/.test(endpointId)) {
    endpointId = `pc-${randomBytes(12).toString("hex")}`;
    try {
      writeFileSync(idFile, JSON.stringify({ ...fileData, endpointId, createdAt: new Date().toISOString() }, null, 2), { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      console.warn("[pc-login] endpoint-id nicht gespeichert:", errorText(error));
    }
  }
  const linkedUserIds = [...new Set([...(config?.linkedUserIds ?? []), ...list(fileData.linkedUserIds)])].filter((id) => /^[\w-]{8,64}$/.test(id));
  const linkedEmails = [...new Set([...(config?.linkedEmails ?? []), ...list(fileData.linkedEmails).map((e) => e.toLowerCase())])].filter((e) => /^[^\s@]+@[^\s@]+$/.test(e));

  let client: Client | null = null;
  let loop: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let inFlightSince = 0;
  let failures = 0;
  let lastError: string | null = null;
  let lastBeat: string | null = null;
  let lastBeatMs = 0;
  let lastUrl: string | null | undefined;
  const db = (): Q => (client ??= connect(config!.url)).q;
  const resetClient = () => {
    client?.close();
    client = null;
  };

  async function beat(): Promise<boolean> {
    if (!config) return true;
    if (inFlightSince && Date.now() - inFlightSince < QUERY_TIMEOUT_MS + 5_000) return true; // laeuft schon
    inFlightSince = Date.now();
    const s = options.state();
    const online = enabled && s.status === "online" && Boolean(s.url);
    const url = online ? s.url : null;
    try {
      await db()(
        `insert into connect_pc_endpoints (endpoint_id, owner_user_id, device_name, tunnel_url, tunnel_status, enabled, version, last_seen,
                                           linked_user_ids, linked_emails, heartbeat_error, heartbeat_failures)
         values ($1, $2, $3, $4, $5, $6, $7, now(), string_to_array($8, ','), string_to_array($9, ','), null, 0)
         on conflict (endpoint_id) do update set owner_user_id = excluded.owner_user_id, device_name = excluded.device_name,
           tunnel_url = excluded.tunnel_url, tunnel_status = excluded.tunnel_status, enabled = excluded.enabled,
           version = excluded.version, last_seen = now(), linked_user_ids = excluded.linked_user_ids,
           linked_emails = excluded.linked_emails, heartbeat_error = $10, heartbeat_failures = $11`,
        [
          endpointId, config.owner, config.label, url, online ? "online" : s.status || "offline", enabled, VERSION,
          linkedUserIds.join(","), linkedEmails.join(","),
          failures ? `nach ${failures} Fehlversuch(en) wieder ok: ${lastError ?? ""}`.slice(0, 300) : null, failures,
        ],
      );
      if (url !== lastUrl) console.info(`[pc-login] Tunnel-Adresse gemeldet: ${url ? "online" : `offline (${s.status})`}`);
      if (failures) console.info(`[pc-login] Heartbeat wieder ok nach ${failures} Fehlversuch(en).`);
      lastUrl = url;
      lastBeat = new Date().toISOString();
      lastBeatMs = Date.now();
      lastError = null;
      failures = 0;
      return true;
    } catch (error) {
      failures += 1;
      lastError = errorText(error);
      if (failures <= 3 || failures % 10 === 0) console.warn(`[pc-login] Heartbeat fehlgeschlagen (${failures}x): ${lastError}`);
      resetClient(); // neue Verbindung beim naechsten Versuch (Pooler-Timeouts, abgerissene Verbindung)
      return false;
    } finally {
      inFlightSince = 0;
    }
  }

  function schedule(ms: number) {
    if (!running) return;
    if (loop) clearTimeout(loop);
    loop = setTimeout(async () => {
      loop = null;
      let ok = false;
      try {
        ok = await beat();
      } catch (error) {
        console.warn("[pc-login] Heartbeat-Schleife:", errorText(error));
      }
      schedule(ok ? HEARTBEAT_MS : Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, failures - 1)));
    }, ms);
  }

  async function audit(event: string, requestId: string | null, detail: Record<string, unknown>) {
    if (!config) return;
    await db()(
      "insert into connect_pc_login_audit (request_id, owner_user_id, endpoint_id, event, detail) values ($1, $2, $3, $4, $5::jsonb)",
      [requestId, config.owner, endpointId, event, JSON.stringify(detail)],
    ).catch(() => {});
  }

  return {
    configured: Boolean(config),
    enabled,
    status: () => ({
      configured: Boolean(config),
      enabled,
      running,
      endpointId,
      lastBeat,
      lastError,
      failures,
      reportedUrl: lastUrl ?? null,
      linkedAccounts: linkedUserIds.length + linkedEmails.length,
    }),
    start() {
      if (!config) {
        console.info("[pc-login] aus: pc-bridge.env fehlt (keine Online-Anmeldung über den PC).");
        return;
      }
      if (running) return;
      running = true;
      if (linkedUserIds.length || linkedEmails.length) console.info(`[pc-login] verknüpfte Konten: ${linkedUserIds.length + linkedEmails.length}`);
      schedule(0);
      // Tunnel neu gestartet / neue Adresse: sofort melden.
      options.onChange(() => schedule(0));
      // Watchdog: falls die Schleife aus irgendeinem Grund nicht mehr laeuft, neu anstossen.
      watchdog = setInterval(() => {
        if (running && !loop && !inFlightSince) schedule(0);
        else if (running && lastBeatMs && Date.now() - lastBeatMs > 3 * HEARTBEAT_MS && !inFlightSince && failures === 0) schedule(0);
      }, HEARTBEAT_MS);
      (watchdog as { unref?: () => void }).unref?.();
    },
    stop() {
      running = false;
      if (loop) clearTimeout(loop);
      if (watchdog) clearInterval(watchdog);
      loop = null;
      watchdog = null;
    },
    /** Verbraucht ein Einmal-Token (genau einmal, nur fuer diesen PC und ein berechtigtes Konto). */
    async consume(token: string, userAgent: string): Promise<PcLoginResult> {
      if (!config || !enabled) return { ok: false, reason: "PC-Anmeldung ist auf diesem PC nicht eingerichtet." };
      if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return { ok: false, reason: "Ungültiger Anmelde-Link." };
      try {
        const rows = await db()(
          `update connect_pc_login_requests r set status = 'consumed', consumed_at = now()
            where r.token_hash = $1 and r.status = 'issued' and r.token_expires_at > now() and r.endpoint_id = $3
              and (r.owner_user_id = $2
                   or r.owner_user_id = any(string_to_array($4, ','))
                   or exists (select 1 from users u where u.id = r.owner_user_id and u.email_verified
                                and lower(u.email) = any(string_to_array($5, ','))))
          returning r.id, r.requester_ua, r.via, r.browser_key_hash`,
          [sha256(token), config.owner, endpointId, linkedUserIds.join(","), linkedEmails.join(",")],
        );
        const row = rows[0];
        if (!row) {
          await audit("pair_failed", null, { reason: "invalid-or-expired" });
          return { ok: false, reason: "Der Anmelde-Link ist abgelaufen oder wurde schon benutzt. Bitte neu starten." };
        }
        const requestId = String(row.id);
        const requesterUa = String(row.requester_ua ?? "");
        if (requesterUa && userAgent && requesterUa !== userAgent.slice(0, 400)) {
          await audit("pair_failed", requestId, { reason: "browser-mismatch" });
          return { ok: false, reason: "Der Link wurde in einem anderen Browser geöffnet als die Anmeldung gestartet wurde." };
        }
        const browserKeyHash = typeof row.browser_key_hash === "string" && row.browser_key_hash ? String(row.browser_key_hash) : null;
        return { ok: true, requestId, requesterUa, via: String(row.via ?? "qr"), browserKeyHash };
      } catch (error) {
        console.warn("[pc-login] Token-Pruefung:", errorText(error));
        resetClient();
        return { ok: false, reason: "Anmeldung gerade nicht prüfbar (keine Verbindung zur Online-Datenbank)." };
      }
    },
    async paired(requestId: string, deviceId: string) {
      if (!config) return;
      await db()("update connect_pc_login_requests set consumed_device_id = $2 where id = $1", [requestId, deviceId]).catch(() => {});
      await audit("paired", requestId, { deviceId });
    },
  };
}
