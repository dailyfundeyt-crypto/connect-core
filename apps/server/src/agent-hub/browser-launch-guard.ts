/**
 * Browser-Launch-Guard (loopfix 23.10.2026).
 *
 * Hintergrund: Chromium/Helium ist pro --user-data-dir eine Einzelinstanz. Wird ein
 * zweiter Start mit demselben Profil ausgelöst, reicht Chrome ihn an die laufende
 * Instanz weiter (=> neues Fenster) und IGNORIERT --remote-debugging-port. Wenn der
 * Aufrufer dann auf dem "falschen" Port nach CDP sucht, startet er erneut ... und so
 * entstanden Dutzende about:blank-Fenster.
 *
 * Dieser Guard ist die EINZIGE Stelle, die entscheidet, ob ein Profil-Browser gestartet
 * werden darf:
 *  - Single-Instance-Lock pro Profil: läuft schon ein Prozess mit diesem user-data-dir,
 *    wird sein echter Debug-Port verwendet (DevToolsActivePort-Datei oder
 *    --remote-debugging-port aus der Kommandozeile). Läuft er ohne erreichbaren Port,
 *    wird NICHT erneut gestartet, sondern ein Fehler gemeldet.
 *  - Höchstens 1 Start pro Profil alle MIN_INTERVAL_MS.
 *  - Circuit-Breaker: > MAX_LAUNCHES_PER_MIN Starts/Minute, MAX_CONSEC_FAILURES
 *    Fehlstarts in Folge oder > MAX_PAGES Fenster/Tabs => Profil gesperrt (TRIP_MS),
 *    bis „Erneut versuchen“ (resetLaunchGuard) gedrückt wird.
 *  - In-flight-Lock: gleichzeitige Aufrufe teilen sich denselben Startversuch.
 *  - URLs werden per CDP im vorhandenen Tab geöffnet (nie --new-window).
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const LAUNCH_GUARD_LIMITS = {
  MIN_INTERVAL_MS: 15_000,
  WINDOW_MS: 60_000,
  MAX_LAUNCHES_PER_MIN: 3,
  MAX_CONSEC_FAILURES: 2,
  MAX_PAGES: 5,
  TRIP_MS: 10 * 60_000,
};

export function normalizeProfileDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function fnvPort(value: string): number {
  const basePort = Number(process.env.CONNECT_CHROME_CDP_PORT) || 9333;
  let h = 2166136261;
  for (const ch of value) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return basePort + (h % 200);
}

/** Einheitlicher, deterministischer CDP-Port pro Profil (Slash-normalisiert). */
export function canonicalCdpPort(profileDir: string): number {
  return fnvPort(normalizeProfileDir(profileDir));
}

/** Alter agent-cdp-Port (ohne Slash-Normalisierung) – nur zum Wiederfinden alter Instanzen. */
export function legacyCdpPort(profileDir: string): number {
  return fnvPort(profileDir.toLowerCase());
}

export async function cdpPortAlive(port: number, timeoutMs = 800): Promise<boolean> {
  if (!port) return false;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export function readDevToolsActivePort(profileDir: string): number | null {
  try {
    const file = join(profileDir, "DevToolsActivePort");
    if (!existsSync(file)) return null;
    const first = readFileSync(file, "utf8").split(/\r?\n/)[0]?.trim() ?? "";
    const port = Number(first);
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
  } catch {
    return null;
  }
}

type ProcRow = { pid: number; userDataDir: string; port: number | null };
let procCache: { at: number; rows: ProcRow[] } | null = null;
let procInflight: Promise<ProcRow[]> | null = null;

function parseUserDataDir(cmd: string): string | null {
  const m = cmd.match(/--user-data-dir=(?:"([^"]+)"|(\S+))/i);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function parseDebugPort(cmd: string): number | null {
  const m = cmd.match(/--remote-debugging-port=(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Browser-Hauptprozesse (ohne --type=) mit --user-data-dir. Windows: versteckte PowerShell, 3 s Cache. */
async function listProfileProcesses(): Promise<ProcRow[]> {
  if (process.platform !== "win32") return [];
  if (procCache && Date.now() - procCache.at < 3000) return procCache.rows;
  if (procInflight) return procInflight;
  const script =
    "Get-CimInstance Win32_Process -Filter \"CommandLine like '%--user-data-dir=%'\" | " +
    "Where-Object { $_.CommandLine -notmatch '--type=' } | " +
    "ForEach-Object { [string]$_.ProcessId + [char]9 + $_.CommandLine }";
  procInflight = new Promise<ProcRow[]>((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 8000, maxBuffer: 4 * 1024 * 1024 },
      (_err, stdout) => {
        const rows: ProcRow[] = [];
        for (const line of String(stdout ?? "").split(/\r?\n/)) {
          const tab = line.indexOf("\t");
          if (tab <= 0) continue;
          const pid = Number(line.slice(0, tab));
          const cmd = line.slice(tab + 1);
          const dir = parseUserDataDir(cmd);
          if (!pid || !dir) continue;
          rows.push({ pid, userDataDir: normalizeProfileDir(dir), port: parseDebugPort(cmd) });
        }
        procCache = { at: Date.now(), rows };
        resolve(rows);
      },
    );
  }).finally(() => {
    procInflight = null;
  });
  return procInflight;
}

export function invalidateProcessCache(): void {
  procCache = null;
}

export type ProfileCdp = { running: boolean; port: number | null; pid?: number; source?: string };

/**
 * Findet den ECHTEN Debug-Port eines Profils: DevToolsActivePort -> kanonischer Port ->
 * laufender Prozess (Kommandozeile) -> alter Port. Startet nie etwas.
 */
export async function resolveProfileCdp(profileDir: string): Promise<ProfileCdp> {
  const fromFile = readDevToolsActivePort(profileDir);
  if (fromFile && (await cdpPortAlive(fromFile))) return { running: true, port: fromFile, source: "DevToolsActivePort" };
  const canonical = canonicalCdpPort(profileDir);
  if (await cdpPortAlive(canonical)) return { running: true, port: canonical, source: "canonical" };
  const key = normalizeProfileDir(profileDir);
  const rows = (await listProfileProcesses()).filter((row) => row.userDataDir === key);
  if (rows.length > 0) {
    for (const row of rows) {
      if (row.port && (await cdpPortAlive(row.port))) return { running: true, port: row.port, pid: row.pid, source: "cmdline" };
    }
    const legacy = legacyCdpPort(profileDir);
    if (legacy !== canonical && (await cdpPortAlive(legacy))) return { running: true, port: legacy, pid: rows[0]!.pid, source: "legacy" };
    return { running: true, port: null, pid: rows[0]!.pid };
  }
  if (process.platform !== "win32") {
    const legacy = legacyCdpPort(profileDir);
    if (legacy !== canonical && (await cdpPortAlive(legacy))) return { running: true, port: legacy, source: "legacy" };
  }
  return { running: false, port: null };
}

/** Aktueller Port für CDP-Aufrufe (echter Port, sonst kanonischer). */
export async function liveCdpPort(profileDir: string): Promise<number> {
  return (await resolveProfileCdp(profileDir)).port ?? canonicalCdpPort(profileDir);
}

// ---------------------------------------------------------------------------------------------
// Rate-Limit + Circuit-Breaker (generisch, auch für App-Cast).
// ---------------------------------------------------------------------------------------------

type GuardState = {
  launches: number[];
  lastLaunchAt: number;
  consecutiveFailures: number;
  trippedUntil: number;
  trippedReason?: string;
};

const guardStates = new Map<string, GuardState>();

function guardState(key: string): GuardState {
  let st = guardStates.get(key);
  if (!st) {
    st = { launches: [], lastLaunchAt: 0, consecutiveFailures: 0, trippedUntil: 0 };
    guardStates.set(key, st);
  }
  return st;
}

export function tripLaunchGuard(key: string, reason: string): void {
  const st = guardState(key);
  st.trippedUntil = Date.now() + LAUNCH_GUARD_LIMITS.TRIP_MS;
  st.trippedReason = reason;
  console.warn(`[launch-guard] GESPERRT ${key}: ${reason}`);
}

export function resetLaunchGuard(keyOrProfile: string): void {
  guardStates.delete(keyOrProfile);
  guardStates.delete(normalizeProfileDir(keyOrProfile));
}

export function launchGuardStatus(keyOrProfile: string): { tripped: boolean; reason: string | null; launchesLastMinute: number } {
  const st = guardStates.get(keyOrProfile) ?? guardStates.get(normalizeProfileDir(keyOrProfile));
  if (!st) return { tripped: false, reason: null, launchesLastMinute: 0 };
  const now = Date.now();
  return {
    tripped: st.trippedUntil > now,
    reason: st.trippedUntil > now ? st.trippedReason ?? null : null,
    launchesLastMinute: st.launches.filter((t) => now - t < LAUNCH_GUARD_LIMITS.WINDOW_MS).length,
  };
}

/** Darf jetzt gestartet werden? Bei ok=true wird der Start sofort gezählt. */
export function acquireLaunchSlot(key: string, label: string): { ok: true } | { ok: false; error: string; tripped: boolean } {
  const st = guardState(key);
  const now = Date.now();
  if (st.trippedUntil > now) {
    return {
      ok: false,
      tripped: true,
      error: `${label}: Start gesperrt (Schutzschalter: ${st.trippedReason ?? "zu viele Starts"}). Es werden keine weiteren Fenster geöffnet. Fenster prüfen und „Erneut versuchen“ klicken.`,
    };
  }
  st.launches = st.launches.filter((t) => now - t < LAUNCH_GUARD_LIMITS.WINDOW_MS);
  if (st.launches.length >= LAUNCH_GUARD_LIMITS.MAX_LAUNCHES_PER_MIN) {
    tripLaunchGuard(key, `mehr als ${LAUNCH_GUARD_LIMITS.MAX_LAUNCHES_PER_MIN} Starts pro Minute`);
    return { ok: false, tripped: true, error: `${label}: Schutzschalter ausgelöst (zu viele Starts pro Minute). Es werden keine weiteren Fenster geöffnet.` };
  }
  const since = now - st.lastLaunchAt;
  if (since < LAUNCH_GUARD_LIMITS.MIN_INTERVAL_MS) {
    const wait = Math.ceil((LAUNCH_GUARD_LIMITS.MIN_INTERVAL_MS - since) / 1000);
    return { ok: false, tripped: false, error: `${label}: Start läuft bereits oder wurde gerade versucht – bitte ${wait} s warten.` };
  }
  st.launches.push(now);
  st.lastLaunchAt = now;
  return { ok: true };
}

export function reportLaunchResult(key: string, ok: boolean, detail?: string): void {
  const st = guardState(key);
  if (ok) {
    st.consecutiveFailures = 0;
    return;
  }
  st.consecutiveFailures += 1;
  if (st.consecutiveFailures >= LAUNCH_GUARD_LIMITS.MAX_CONSEC_FAILURES) {
    tripLaunchGuard(key, `${st.consecutiveFailures} Fehlstarts in Folge${detail ? ` (${detail})` : ""}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Profil-Browser sicherstellen
// ---------------------------------------------------------------------------------------------

export type EnsureBrowserResult =
  | { ok: true; port: number; reused: boolean; pid?: number }
  | { ok: false; error: string; tripped?: boolean; running?: boolean };

const inflight = new Map<string, Promise<EnsureBrowserResult>>();

/**
 * Stellt sicher, dass genau EINE Instanz für das Profil läuft. `spawn` bekommt den
 * kanonischen Port und darf KEIN --new-window verwenden.
 */
export async function ensureProfileBrowser(
  profileDir: string,
  options: {
    label: string;
    spawn: (port: number) => Promise<{ ok: boolean; detail?: string }>;
    allowLaunch?: boolean;
    waitMs?: number;
  },
): Promise<EnsureBrowserResult> {
  const key = normalizeProfileDir(profileDir);
  const pending = inflight.get(key);
  if (pending) return pending;
  const run = (async (): Promise<EnsureBrowserResult> => {
    const live = await resolveProfileCdp(profileDir);
    if (live.port) {
      reportLaunchResult(key, true);
      return { ok: true, port: live.port, reused: true, pid: live.pid };
    }
    if (live.running) {
      return {
        ok: false,
        running: true,
        error: `${options.label} läuft bereits (PID ${live.pid ?? "?"}), aber ohne erreichbaren Debug-Port. Es wird KEIN weiteres Fenster geöffnet – bitte dieses Agent-Fenster schließen und erneut versuchen.`,
      };
    }
    if (options.allowLaunch === false) return { ok: false, error: `${options.label} ist nicht gestartet.` };
    const slot = acquireLaunchSlot(key, options.label);
    if (!slot.ok) return { ok: false, error: slot.error, tripped: slot.tripped };
    const port = canonicalCdpPort(profileDir);
    invalidateProcessCache();
    const spawned = await options.spawn(port);
    if (!spawned.ok) {
      reportLaunchResult(key, false, spawned.detail);
      return { ok: false, error: `${options.label} konnte nicht gestartet werden: ${spawned.detail ?? "unbekannt"}` };
    }
    const deadline = Date.now() + (options.waitMs ?? 8000);
    while (Date.now() < deadline) {
      const fromFile = readDevToolsActivePort(profileDir);
      if (fromFile && (await cdpPortAlive(fromFile, 500))) {
        reportLaunchResult(key, true);
        return { ok: true, port: fromFile, reused: false };
      }
      if (await cdpPortAlive(port, 500)) {
        reportLaunchResult(key, true);
        return { ok: true, port, reused: false };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    reportLaunchResult(key, false, `CDP antwortet nicht auf 127.0.0.1:${port}`);
    return {
      ok: false,
      error: `${options.label} gestartet, aber der Debug-Port 127.0.0.1:${port} antwortet nicht. Es werden keine weiteren Fenster geöffnet.`,
    };
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, run);
  return run;
}

// ---------------------------------------------------------------------------------------------
// URL im vorhandenen Tab öffnen (nie neues Fenster; höchstens 1x Target.createTarget)
// ---------------------------------------------------------------------------------------------

type PageTarget = { id: string; type: string; url: string; title?: string; webSocketDebuggerUrl?: string };

export async function listPageTargets(port: number): Promise<PageTarget[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) });
  if (!res.ok) throw new Error("CDP /json/list fehlgeschlagen");
  const list = (await res.json()) as PageTarget[];
  return list.filter(
    (t) => t.type === "page" && !t.url.startsWith("devtools://") && !t.url.startsWith("chrome-extension://"),
  );
}

function wsCall(wsUrl: string, method: string, params: Record<string, unknown>): Promise<{ ok: boolean; result?: any; error?: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      resolve({ ok: false, error: "CDP-Timeout" });
    }, 5000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method, params }));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.id !== 1) return;
        clearTimeout(timer);
        try { ws.close(); } catch { /* ignore */ }
        resolve(msg.error ? { ok: false, error: msg.error.message ?? "CDP-Fehler" } : { ok: true, result: msg.result ?? {} });
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve({ ok: false, error: "CDP-Verbindung fehlgeschlagen" });
    };
  });
}

/**
 * Öffnet `url` im vorhandenen Tab des Profils (Page.navigate). Nur wenn gar kein Tab
 * existiert, wird EINMAL Target.createTarget benutzt. Zu viele Tabs => Breaker.
 */
export async function openUrlInProfileTab(
  port: number,
  url: string,
  guardKey: string,
): Promise<{ ok: boolean; targetId?: string; error?: string; pages?: number }> {
  let pages: PageTarget[];
  try {
    pages = await listPageTargets(port);
  } catch {
    return { ok: false, error: `Agent-Browser nicht erreichbar (127.0.0.1:${port}).` };
  }
  const key = normalizeProfileDir(guardKey);
  if (pages.length > LAUNCH_GUARD_LIMITS.MAX_PAGES) {
    tripLaunchGuard(key, `${pages.length} Fenster/Tabs offen (max. ${LAUNCH_GUARD_LIMITS.MAX_PAGES})`);
    return {
      ok: false,
      pages: pages.length,
      error: `Schutzschalter: Im Agent-Browser sind ${pages.length} Fenster/Tabs offen (max. ${LAUNCH_GUARD_LIMITS.MAX_PAGES}). Bitte überzählige Fenster schließen und „Erneut versuchen“ klicken.`,
    };
  }
  const target = pages.find((p) => p.webSocketDebuggerUrl && p.url !== "about:blank") ?? pages.find((p) => p.webSocketDebuggerUrl);
  if (target?.webSocketDebuggerUrl) {
    const nav = await wsCall(target.webSocketDebuggerUrl, "Page.navigate", { url });
    if (!nav.ok) return { ok: false, error: nav.error, pages: pages.length };
    void wsCall(target.webSocketDebuggerUrl, "Page.bringToFront", {});
    return { ok: true, targetId: target.id, pages: pages.length };
  }
  // Kein Tab: genau einmal ein Target anlegen (über den Browser-Endpunkt).
  try {
    const ver = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
    const info = (await ver.json()) as { webSocketDebuggerUrl?: string };
    if (!info.webSocketDebuggerUrl) return { ok: false, error: "Kein Browser-Endpunkt." };
    const created = await wsCall(info.webSocketDebuggerUrl, "Target.createTarget", { url });
    return created.ok ? { ok: true, targetId: created.result?.targetId, pages: 1 } : { ok: false, error: created.error };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
