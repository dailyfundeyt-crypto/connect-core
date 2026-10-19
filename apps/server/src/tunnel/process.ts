/**
 * cloudflared als versteckter Hintergrundprozess.
 *
 * - quick: `cloudflared tunnel --url http://127.0.0.1:<port>` -> zufaellige https://*.trycloudflare.com
 * - named: `cloudflared tunnel run` mit TUNNEL_TOKEN in der Umgebung (nicht in der Befehlszeile)
 * - external/off: startet nichts
 *
 * Der Prozess wird abgekoppelt gestartet (kein Konsolenfenster) und ueberlebt einen Server-Neustart,
 * damit die Quick-URL dabei NICHT wechselt: Beim Start wird ein laufender cloudflared ueber seinen
 * lokalen Metrics-Port (127.0.0.1) wiedererkannt und uebernommen. Ein Waechter prueft alle 30 s
 * /ready und startet nach 3 Fehlschlaegen neu; alle 5 min geht ein Ping einmal durchs Internet.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { TunnelConfig } from "./config";
import type { TunnelState, TunnelStore } from "./store";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function metrics(config: TunnelConfig, path: string, timeoutMs = 2500): Promise<Response | null> {
  try {
    return await fetch(`http://127.0.0.1:${config.metricsPort}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }
}

function alive(pid: number | null | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function createTunnelProcess(config: TunnelConfig, store: TunnelStore) {
  let state: TunnelState = {
    mode: config.mode,
    status: config.mode === "off" ? "off" : "starting",
    url: config.mode === "named" || config.mode === "external" ? config.publicUrl : null,
    pid: null,
    startedAt: null,
    lastReadyAt: null,
    error: null,
    restarts: 0,
  };
  let failures = 0;
  let publicFailures = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let publicTimer: ReturnType<typeof setInterval> | null = null;
  let busy = false;
  const listeners = new Set<(s: TunnelState) => void>();

  const save = (patch: Partial<TunnelState>) => {
    state = { ...state, ...patch, mode: config.mode };
    try {
      store.writeState(state);
    } catch {}
    for (const listener of listeners) listener(state);
  };

  async function cloudflaredOnMetricsPort(): Promise<boolean> {
    const response = await metrics(config, "/metrics");
    if (!response?.ok) return false;
    const text = await response.text().catch(() => "");
    return text.includes("cloudflared");
  }

  async function readUrl(): Promise<string | null> {
    if (config.mode !== "quick") return config.publicUrl;
    const response = await metrics(config, "/quicktunnel");
    if (!response?.ok) return null;
    const body = (await response.json().catch(() => null)) as { hostname?: string } | null;
    return body?.hostname ? `https://${body.hostname}` : null;
  }

  async function ready(): Promise<boolean> {
    const response = await metrics(config, "/ready");
    return response?.status === 200;
  }

  function kill(pid: number | null) {
    if (!pid || !alive(pid)) return;
    try {
      process.kill(pid);
    } catch {}
  }

  async function launch() {
    if (!config.bin || !existsSync(config.bin)) {
      save({ status: "missing-binary", error: "cloudflared nicht gefunden (scripts/tunnel/setup-tunnel.ps1 bzw. .sh ausfuehren)" });
      return;
    }
    if (config.mode === "named" && !config.token) {
      save({ status: "error", error: "CONNECT_TUNNEL_TOKEN fehlt fuer den benannten Tunnel" });
      return;
    }
    mkdirSync(store.path, { recursive: true });
    const logfile = join(store.path, "cloudflared.log");
    try {
      if (existsSync(logfile) && statSync(logfile).size > 5_000_000) unlinkSync(logfile);
    } catch {}
    const common = ["tunnel", "--no-autoupdate", "--metrics", `127.0.0.1:${config.metricsPort}`, "--logfile", logfile, "--loglevel", "info", "--protocol", config.protocol];
    const args =
      config.mode === "quick"
        ? [...common, "--url", `http://127.0.0.1:${config.port}`]
        : [...common, "run"];
    const childEnv = { ...process.env } as Record<string, string>;
    // Nichts von Connects Geheimnissen an cloudflared vererben.
    for (const key of Object.keys(childEnv)) {
      if (/SECRET|TOKEN|PASSWORD|DATABASE_URL|API_KEY|OAUTH/i.test(key)) delete childEnv[key];
    }
    if (config.mode === "named" && config.token) childEnv.TUNNEL_TOKEN = config.token;
    const child = spawn(config.bin, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: childEnv,
    });
    child.unref();
    save({ status: "starting", pid: child.pid ?? null, startedAt: new Date().toISOString(), error: null, url: config.mode === "quick" ? null : config.publicUrl });
    for (let i = 0; i < 45; i++) {
      await sleep(1000);
      if (!alive(child.pid)) break;
      const url = await readUrl();
      if (url && (await ready())) {
        failures = 0;
        publicFailures = 0;
        save({ status: "online", url, lastReadyAt: new Date().toISOString() });
        console.info(`[tunnel] online: ${url}`);
        return;
      }
    }
    const url = await readUrl();
    save({ status: alive(child.pid) ? "offline" : "error", url, error: alive(child.pid) ? "Tunnel verbindet noch" : `cloudflared beendet, siehe ${logfile}` });
  }

  async function ensure(force = false) {
    if (busy || config.mode === "off" || config.mode === "external") return;
    busy = true;
    try {
      if (!force) {
        const previous = store.readState();
        if ((await cloudflaredOnMetricsPort()) && (await ready())) {
          // Laufenden cloudflared uebernehmen (Server-Neustart): gleiche URL bleibt.
          const url = await readUrl();
          if (url) {
            failures = 0;
            save({ status: "online", url, pid: previous?.pid ?? state.pid, startedAt: previous?.startedAt ?? state.startedAt, lastReadyAt: new Date().toISOString(), error: null });
            return;
          }
        }
      }
      // Alten eigenen Prozess beenden: nur wenn die PID wirklich zu cloudflared gehoert (Metrics-Port antwortet)
      // oder wir sie selbst in diesem Lauf gestartet haben.
      const previousPid = store.readState()?.pid ?? state.pid;
      if (previousPid && alive(previousPid) && ((await cloudflaredOnMetricsPort()) || previousPid === state.pid)) {
        kill(previousPid);
        await sleep(1500);
      }
      if (force) save({ restarts: state.restarts + 1 });
      await launch();
    } finally {
      busy = false;
    }
  }

  async function watchdog() {
    if (busy) return;
    if (await ready()) {
      failures = 0;
      const url = await readUrl();
      save({ status: "online", lastReadyAt: new Date().toISOString(), ...(url ? { url } : {}) });
      return;
    }
    failures += 1;
    save({ status: "offline" });
    if (failures >= 3) {
      failures = 0;
      console.warn("[tunnel] cloudflared nicht bereit, starte neu");
      await ensure(true);
    }
  }

  async function publicPing() {
    if (busy || state.status !== "online" || !state.url) return;
    try {
      const response = await fetch(`${state.url}/__connect/ping`, { signal: AbortSignal.timeout(15_000) });
      const text = await response.text();
      publicFailures = text.includes("connect-tunnel-ok") ? 0 : publicFailures + 1;
    } catch {
      publicFailures += 1;
    }
    if (publicFailures >= 3) {
      publicFailures = 0;
      console.warn("[tunnel] oeffentliche URL antwortet nicht, starte neu");
      await ensure(true);
    }
  }

  return {
    state: () => state,
    onChange(listener: (s: TunnelState) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (config.mode === "off") {
        save({ status: "off", url: null });
        return;
      }
      if (config.mode === "external") {
        save({ status: config.publicUrl ? "online" : "error", url: config.publicUrl, error: config.publicUrl ? null : "CONNECT_TUNNEL_PUBLIC_URL fehlt" });
        return;
      }
      await ensure(false);
      timer = setInterval(() => void watchdog(), 30_000);
      publicTimer = setInterval(() => void publicPing(), 5 * 60_000);
    },
    restart: () => ensure(true),
    stop() {
      if (timer) clearInterval(timer);
      if (publicTimer) clearInterval(publicTimer);
      kill(state.pid);
    },
  };
}

export type TunnelProcess = ReturnType<typeof createTunnelProcess>;
