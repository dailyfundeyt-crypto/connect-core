/**
 * CDP-Helfer für Agent-Browser (Stufe 1.2 — reale Engine).
 *
 * Genutzt von `agent-browser.ts` (MCP-Tab-Lifecycle) und dem alten
 * Live-Preview-Endpoint in `connect/routes.ts`. Wir extrahieren die
 * Helfer hierhin, damit beide Seiten sie teilen — die Vorschau in
 * `connect/routes.ts` (Connect-User, eigener Browser) und das
 * Agent-MCP-Panel (eigener Agent, eigener Browser) sind sonst Duplikate.
 *
 * Die Helfer funktionieren genauso wie zuvor in `connect/routes.ts`:
 *   - `cdpPageTarget(port, targetId)` — findet den richtigen Page-Target
 *   - `cdpCall(port, method, params, targetId)` — generischer CDP-Call
 *   - `cdpScreenshot(port, targetId)` — JPEG-Screenshot
 *   - `cdpPortFor(profileDir)` — deterministischer Port (Hash modulo 200)
 *
 * Sie sind Loopback-only: `127.0.0.1` ist die einzige Verbindung, und
 * `WebSocketDebuggerUrl` ist die URL, die Chrome uns gibt.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalCdpPort,
  ensureProfileBrowser,
  normalizeProfileDir,
  openUrlInProfileTab,
  resetLaunchGuard,
} from "./browser-launch-guard";

/** Deterministic CDP port per profile: CONNECT_CHROME_CDP_PORT (default 9333) + 0..199. */
// loopfix: EIN Port fuer alle Aufrufer (Slash-normalisiert, identisch zu connect/routes.ts).
// Vorher ohne Normalisierung => anderer Port als die Vorschau => Endlos-Neustarts.
export function cdpPortFor(profileDir: string): number {
  return canonicalCdpPort(profileDir);
}

export type CdpResult = {
  ok: boolean;
  result?: Record<string, unknown>;
  url?: string;
  error?: string;
};

export type CdpShot = { ok: boolean; bytes?: Uint8Array; url?: string; error?: string };

export type CdpTarget = {
  id?: string;
  type?: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

export async function cdpPageTargets(
  port: number,
): Promise<Array<{ id: string; title: string; url: string }>> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error("Agent-Browser nicht erreichbar.");
  const list = (await res.json()) as CdpTarget[];
  return list
    .filter(
      (target): target is CdpTarget & { id: string } =>
        Boolean(
          target.id &&
            target.type === "page" &&
            target.webSocketDebuggerUrl &&
            !target.url?.startsWith("devtools://"),
        ),
    )
    .map((target) => ({
      id: target.id,
      title: target.title ?? target.url ?? "Neuer Tab",
      url: target.url ?? "about:blank",
    }));
}

export async function cdpPageTarget(
  port: number,
  targetId?: string,
): Promise<CdpTarget | null> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) return null;
  const list = (await res.json()) as CdpTarget[];
  if (targetId) {
    return (
      list.find(
        (target) =>
          target.id === targetId &&
          target.type === "page" &&
          target.webSocketDebuggerUrl,
      ) ?? null
    );
  }
  return (
    list.find(
      (t) =>
        t.type === "page" && t.webSocketDebuggerUrl && !t.url?.startsWith("devtools://"),
    ) ?? null
  );
}

export async function cdpCall(
  port: number,
  method: string,
  params: Record<string, unknown>,
  targetId?: string,
): Promise<CdpResult> {
  let target: CdpTarget | null = null;
  try {
    target = await cdpPageTarget(port, targetId);
  } catch {
    return { ok: false, error: `Agent-Browser nicht erreichbar (CDP 127.0.0.1:${port}).` };
  }
  if (!target?.webSocketDebuggerUrl) {
    return { ok: false, error: "Kein offener Tab im Agent-Browser." };
  }
  const wsUrl = target.webSocketDebuggerUrl;
  return await new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve({ ok: false, error: "CDP-Timeout." });
    }, 5000);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method, params }));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          id?: number;
          result?: Record<string, unknown>;
          error?: { message?: string };
        };
        if (msg.id !== 1) return;
        clearTimeout(timer);
        ws.close();
        resolve(
          msg.error
            ? { ok: false, error: msg.error.message ?? "CDP-Fehler" }
            : { ok: true, result: msg.result ?? {}, url: target?.url },
        );
      } catch {
        /* ignore non-JSON */
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve({ ok: false, error: "CDP-Verbindung fehlgeschlagen." });
    };
  });
}

export const VISUAL_AGENT_SCRIPT = `(() => {
  var style = document.getElementById('__agent_visual_styles__');
  if (!style) {
    style = document.createElement('style');
    style.id = '__agent_visual_styles__';
    style.textContent = '@keyframes __agent_glow_pulse__ { 0% { box-shadow: inset 0 0 18px rgba(0, 242, 254, 0.35), inset 0 0 4px rgba(0, 242, 254, 0.5); border-color: rgba(0, 242, 254, 0.65); } 100% { box-shadow: inset 0 0 32px rgba(0, 242, 254, 0.6), inset 0 0 8px rgba(0, 242, 254, 0.9); border-color: rgba(0, 242, 254, 0.95); } } @keyframes __agent_dot_pulse__ { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.3); opacity: 1; filter: drop-shadow(0 0 6px #00f2fe); } }';
    (document.head || document.documentElement).appendChild(style);
  }

  var glow = document.getElementById('__agent_active_glow__');
  if (!glow) {
    glow = document.createElement('div');
    glow.id = '__agent_active_glow__';
    glow.style.cssText = 'position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; pointer-events: none !important; z-index: 2147483645 !important; box-sizing: border-box !important; border: 3px solid rgba(0, 242, 254, 0.8) !important; box-shadow: inset 0 0 24px rgba(0, 242, 254, 0.45), inset 0 0 6px rgba(0, 242, 254, 0.7) !important; animation: __agent_glow_pulse__ 2.2s ease-in-out infinite alternate !important; transition: opacity 0.35s ease-in-out !important; opacity: 1 !important;';
    document.documentElement.appendChild(glow);
  }

  var pill = document.getElementById('__agent_status_pill__');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = '__agent_status_pill__';
    pill.style.cssText = 'position: fixed !important; top: 14px !important; right: 20px !important; background: rgba(8, 20, 38, 0.92) !important; border: 1.5px solid rgba(0, 242, 254, 0.75) !important; box-shadow: 0 4px 18px rgba(0, 242, 254, 0.4) !important; backdrop-filter: blur(8px) !important; color: #00f2fe !important; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; font-size: 11px !important; font-weight: 700 !important; letter-spacing: 0.6px !important; padding: 5px 12px !important; border-radius: 9999px !important; display: flex !important; align-items: center !important; gap: 7px !important; pointer-events: none !important; z-index: 2147483646 !important; user-select: none !important; transition: opacity 0.3s ease !important; opacity: 1 !important;';
    pill.innerHTML = '<span style="width: 7px; height: 7px; border-radius: 50%; background: #00f2fe; box-shadow: 0 0 8px #00f2fe; display: inline-block; animation: __agent_dot_pulse__ 1.5s ease-in-out infinite;"></span><span>AGENT ACTIVE</span>';
    document.documentElement.appendChild(pill);
  }

  var cursor = document.getElementById('__agent_cursor__');
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = '__agent_cursor__';
    cursor.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 28px !important; height: 28px !important; pointer-events: none !important; z-index: 2147483647 !important; display: block !important; will-change: transform !important;';
    cursor.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.65)) drop-shadow(0 0 6px rgba(0,242,254,0.75));"><path d="M4 2 L19 12 L11 13.5 L8 21 L4 2 Z" fill="#00f2fe" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
  }

  if (!window.__agentCursorPos) {
    window.__agentCursorPos = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
  }
  cursor.style.transform = "translate(" + window.__agentCursorPos.x + "px, " + window.__agentCursorPos.y + "px)";

  window.__updateCursor = function(x, y) {
    if (!cursor) return;
    window.__agentCursorPos = { x: x, y: y };
    cursor.style.transform = "translate(" + x + "px, " + y + "px)";
  };

  window.__clickRipple = function(x, y) {
    var rip = document.createElement('div');
    rip.style.cssText = 'position: fixed; left: ' + x + 'px; top: ' + y + 'px; width: 8px; height: 8px; border-radius: 50%; border: 2px solid #00f2fe; box-shadow: 0 0 14px #00f2fe, inset 0 0 6px #00f2fe; pointer-events: none; z-index: 2147483646; transform: translate(-50%, -50%); transition: all 0.42s cubic-bezier(0.1, 0.8, 0.3, 1); opacity: 1;';
    document.documentElement.appendChild(rip);
    requestAnimationFrame(function() {
      rip.style.width = '48px';
      rip.style.height = '48px';
      rip.style.opacity = '0';
    });
    setTimeout(function() { rip.remove(); }, 450);
  };

  window.__glideCursor = function(targetX, targetY, durationMs, doRipple) {
    durationMs = durationMs || 280;
    return new Promise(function(resolve) {
      var startX = window.__agentCursorPos ? window.__agentCursorPos.x : window.innerWidth / 2;
      var startY = window.__agentCursorPos ? window.__agentCursorPos.y : window.innerHeight / 2;
      var startTime = performance.now();

      function frame(now) {
        var elapsed = now - startTime;
        var progress = Math.min(elapsed / durationMs, 1);
        var ease = 1 - Math.pow(1 - progress, 3);
        var curX = startX + (targetX - startX) * ease;
        var curY = startY + (targetY - startY) * ease;
        window.__updateCursor(curX, curY);

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          window.__updateCursor(targetX, targetY);
          if (doRipple) window.__clickRipple(targetX, targetY);
          resolve({ x: targetX, y: targetY });
        }
      }
      requestAnimationFrame(frame);
    });
  };
})();`;

export async function injectAgentVisuals(
  port: number,
  targetId?: string,
): Promise<boolean> {
  try {
    void cdpCall(port, "Page.addScriptToEvaluateOnNewDocument", {
      source: VISUAL_AGENT_SCRIPT,
    }, targetId).catch(() => undefined);

    const res = await cdpCall(port, "Runtime.evaluate", {
      expression: VISUAL_AGENT_SCRIPT,
    }, targetId);
    return res.ok;
  } catch {
    return false;
  }
}

export async function cdpGlideCursor(
  port: number,
  targetX: number,
  targetY: number,
  doRipple = true,
  durationMs = 240,
  targetId?: string,
): Promise<void> {
  try {
    await injectAgentVisuals(port, targetId);
    await cdpCall(port, "Runtime.evaluate", {
      expression: `if (window.__glideCursor) window.__glideCursor(${targetX}, ${targetY}, ${durationMs}, ${doRipple ? "true" : "false"});`,
    }, targetId);
    await new Promise((r) => setTimeout(r, durationMs));
  } catch {
    /* ignore */
  }
}

export async function cdpScreenshot(
  port: number,
  targetId?: string,
): Promise<CdpShot> {
  // Ensure visual elements (cyan cursor, glowing blue border) are in the DOM before screenshot
  void injectAgentVisuals(port, targetId).catch(() => undefined);
  const res = await cdpCall(port, "Page.captureScreenshot", { format: "jpeg", quality: 60 }, targetId);
  if (!res.ok || !res.result) return { ok: false, error: res.error ?? "CDP-Fehler" };
  const data = typeof res.result.data === "string" ? res.result.data : "";
  if (!data) return { ok: false, error: "Leerer Screenshot." };
  return {
    ok: true,
    bytes: Uint8Array.from(Buffer.from(data, "base64")),
    url: res.url,
  };
}

/**
 * Läuft ein Chrome mit isoliertem Profil und Remote-Debugging-Port.
 *
 * Diese Funktion nutzt Helium/Edge/Chrome, je nach CONNECT_CHROME_BIN
 * (Default: `%LOCALAPPDATA%\imput\Helium\Application\chrome.exe`).
 * Sie wird vom alten `connect/routes.ts`-Code und vom neuen
 * `agent-browser.ts` geteilt — beide brauchen einen Browser pro
 * Agent-Profil.
 */
export type ChromeLaunch = { ok: true; binary: string; port?: number } | { ok: false; detail: string };

const CHROME_BIN_CANDIDATES: string[] = [
  process.env.CONNECT_CHROME_BIN?.trim(),
  "C:\\Users\\Kunc GmbH\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/microsoft-edge",
].filter((bin): bin is string => Boolean(bin));

async function chromeBinaryExists(binary: string): Promise<boolean> {
  if (binary.includes("/") || binary.includes("\\")) {
    try {
      return await Bun.file(binary).exists();
    } catch {
      return false;
    }
  }
  try {
    const proc = Bun.spawn(["which", binary], { stdout: "pipe", stderr: "ignore" });
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * loopfix: Einziger erlaubter Start eines Agent-Browsers. Laeuft das Profil schon, wird
 * die vorhandene Instanz (echter Debug-Port) benutzt und die URL per CDP im vorhandenen
 * Tab geoeffnet – nie ein neues Fenster. Rate-Limit + Schutzschalter: browser-launch-guard.ts.
 */
export async function launchAgentChrome(
  url: string,
  profileDir: string,
): Promise<ChromeLaunch> {
  const res = await ensureProfileBrowser(profileDir, {
    label: "Agent-Browser",
    spawn: (port) => spawnAgentChromeRaw(url, profileDir, port),
  });
  if (!res.ok) return { ok: false, detail: res.error };
  if (res.reused && url && url !== "about:blank") {
    const opened = await openUrlInProfileTab(res.port, url, profileDir);
    if (!opened.ok) return { ok: false, detail: opened.error ?? "Navigation fehlgeschlagen" };
  }
  return { ok: true, binary: res.reused ? "running" : "helium", port: res.port };
}

/** Roh-Start OHNE Schutz – nur ueber ensureProfileBrowser aufrufen. */
async function spawnAgentChromeRaw(
  url: string,
  profileDir: string,
  port: number,
): Promise<ChromeLaunch> {
  const normalized = profileDir.toLowerCase().replace(/\\/g, "/");
  const stefanHeliumUserData = (
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "imput", "Helium", "User Data")
      : "c:/users/kunc gmbh/appdata/local/imput/helium/user data"
  )
    .toLowerCase()
    .replace(/\\/g, "/");

  if (normalized === stefanHeliumUserData || normalized.startsWith(stefanHeliumUserData + "/")) {
    console.error("[agent-cdp] SICHERHEITSBLOCK: Stefans eigenes Helium-Profil darf NIE berührt werden!", profileDir);
    return {
      ok: false,
      detail: "SICHERHEITSABBRUCH: Stefans eigenes Helium-Profil darf NIE verwendet werden!",
    };
  }

  const args = [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--hide-crash-restore-bubble", // loopfix: kein "Seiten wiederherstellen?" (koennte alte Fenster zurueckholen)
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    // loopfix: kein --new-window – die URL oeffnet im ersten Fenster der neuen Instanz.
    url || "about:blank",
  ];
  const errors: string[] = [];
  for (const binary of CHROME_BIN_CANDIDATES) {
    if (!(await chromeBinaryExists(binary))) {
      errors.push(`${binary}: nicht gefunden`);
      continue;
    }
    if (process.platform === "win32") {
      try {
        const proc = Bun.spawn([binary, ...args], {
          stdout: "ignore",
          stderr: "ignore",
          stdin: "ignore",
        });
        proc.unref();
        return { ok: true, binary };
      } catch (err) {
        // loopfix: KEIN sichtbarer "cmd.exe /c start"-Fallback mehr (das war ein sichtbares
        // Konsolenfenster und ein zweiter, ungeschuetzter Startweg).
        errors.push(`${binary}: ${err instanceof Error ? err.message : String(err)}`);
      }
      continue;
    }
    try {
      const proc = Bun.spawn([binary, ...args], {
        stdout: "ignore",
        stderr: "pipe",
        stdin: "ignore",
      });
      const earlyExit = await Promise.race([
        proc.exited.then((c) => c),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 900)),
      ]);
      if (earlyExit !== null && earlyExit !== 0) {
        let stderr = "";
        try {
          stderr = (await new Response(proc.stderr).text()).trim().slice(0, 240);
        } catch {
          /* ignore */
        }
        errors.push(
          `${binary}: beendet (code ${earlyExit})${stderr ? ` — ${stderr}` : ""}`,
        );
        continue;
      }
      void proc.exited.catch(() => undefined);
      return { ok: true, binary };
    } catch (err) {
      errors.push(`${binary}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return {
    ok: false,
    detail:
      errors.join(" · ") ||
      "Kein Chrome/Edge/Helium gefunden. CONNECT_CHROME_BIN setzen oder Helium/Chrome installieren.",
  };
}

/** Warten, bis der CDP-Server auf dem Port antwortet (max. 6s). */
export async function waitForCdp(port: number, timeoutMs = 6000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(800),
      });
      if (res.ok) return true;
    } catch {
      /* noch nicht da */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** Convenience: `cdpCall` über `Page.navigate` mit URL-Validation. */
export async function cdpNavigate(
  port: number,
  rawUrl: string,
  targetId?: string,
): Promise<CdpResult> {
  let parsed: URL;
  try {
    parsed = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`,
    );
  } catch {
    return { ok: false, error: "Bitte eine gültige Webadresse eingeben." };
  }
  if (!["http:", "https:"].includes(parsed.protocol) && parsed.href !== "about:blank") {
    return { ok: false, error: "Nur Webadressen mit http oder https sind erlaubt." };
  }
  const navRes = await cdpCall(port, "Page.navigate", { url: parsed.href }, targetId);
  if (navRes.ok) {
    void injectAgentVisuals(port, targetId);
  }
  return navRes;
}

/** Liefert `Page.getLayoutMetrics` in einer handlichen Form. */
export async function cdpViewport(
  port: number,
  targetId?: string,
): Promise<{ width: number; height: number; error?: string }> {
  const res = await cdpCall(port, "Page.getLayoutMetrics", {}, targetId);
  if (!res.ok || !res.result) return { width: 0, height: 0, error: res.error };
  const viewport = (res.result.cssLayoutViewport ?? res.result.layoutViewport) as
    | { clientWidth?: number; clientHeight?: number }
    | undefined;
  return {
    width: Number(viewport?.clientWidth) || 0,
    height: Number(viewport?.clientHeight) || 0,
  };
}

type ProfileLaunchTracker = {
  failures: number;
  lastAttemptAt: number;
  lastError?: string;
  /** true = nach MAX_LAUNCH_RETRIES Fehlschlägen dauerhaft gestoppt, bis jemand `retry` drückt. */
  stopped?: boolean;
};

export type AgentBrowserStatus = "ok" | "starting" | "failing" | "stopped";
export type AgentBrowserStatusInfo = {
  status: AgentBrowserStatus;
  failures: number;
  maxRetries: number;
  error: string | null;
  lastAttemptAt: string | null;
};

const MAX_LAUNCH_RETRIES = 3;

/**
 * Persistenter Startstatus pro Profil-Verzeichnis. Liegt unter
 * %LOCALAPPDATA%/ConnectAgents/browser-launch-status.json, damit ein gestoppter
 * Browser nach einem Server-Neustart NICHT wieder in eine Fehlerschleife läuft.
 */
function statusStorePath(): string {
  const base = process.env.LOCALAPPDATA ?? join(process.env.HOME ?? ".", ".local", "share");
  const dir = join(base, "ConnectAgents");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return join(dir, "browser-launch-status.json");
}

function loadTrackers(): Map<string, ProfileLaunchTracker> {
  try {
    const raw = JSON.parse(readFileSync(statusStorePath(), "utf8")) as Record<string, ProfileLaunchTracker>;
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

const profileLaunchTrackers = loadTrackers();

type StatusListener = (profileDir: string, info: AgentBrowserStatusInfo) => void;
const statusListeners = new Set<StatusListener>();
/** Registriert einen Listener (z. B. DB-Update der agents.browser_status-Spalte). */
export function onAgentBrowserStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function persistTrackers(profileDir: string): void {
  try {
    writeFileSync(statusStorePath(), JSON.stringify(Object.fromEntries(profileLaunchTrackers), null, 2), "utf8");
  } catch (error) {
    console.warn(`[agent-cdp] Browser-Status konnte nicht gespeichert werden: ${String(error)}`);
  }
  const info = getAgentBrowserStatus(profileDir);
  for (const listener of statusListeners) {
    try {
      listener(profileDir, info);
    } catch {
      /* Listener-Fehler nie nach oben durchreichen */
    }
  }
}

/** Manueller Retry (oder Profil repariert): Zähler + Stop zurücksetzen. */
/** loopfix: Der Schutzschalter (Guard) wird NUR beim manuellen „Erneut versuchen“ (includeGuard=true) zurückgesetzt. */
export function resetAgentChromeLaunchAttempts(profileDir: string, includeGuard = false): void {
  if (includeGuard) resetLaunchGuard(profileDir);
  if (profileLaunchTrackers.delete(profileDir.toLowerCase())) persistTrackers(profileDir);
}

export function getAgentBrowserStatus(profileDir: string): AgentBrowserStatusInfo {
  const tracker = profileLaunchTrackers.get(profileDir.toLowerCase());
  if (!tracker) {
    return { status: "ok", failures: 0, maxRetries: MAX_LAUNCH_RETRIES, error: null, lastAttemptAt: null };
  }
  return {
    status: tracker.stopped || tracker.failures >= MAX_LAUNCH_RETRIES ? "stopped" : tracker.failures > 0 ? "failing" : "starting",
    failures: tracker.failures,
    maxRetries: MAX_LAUNCH_RETRIES,
    error: tracker.lastError ?? null,
    lastAttemptAt: tracker.lastAttemptAt ? new Date(tracker.lastAttemptAt).toISOString() : null,
  };
}

export function getAgentChromeLaunchAttempts(profileDir: string): { failures: number; cooldownRemainingMs: number; stopped: boolean } {
  const tracker = profileLaunchTrackers.get(profileDir.toLowerCase());
  if (!tracker) return { failures: 0, cooldownRemainingMs: 0, stopped: false };
  return { failures: tracker.failures, cooldownRemainingMs: 0, stopped: Boolean(tracker.stopped) };
}

const loggedStops = new Set<string>();

/**
 * Stufe 1.2 Helper: Sorgt dafür, dass der Agent-Browser für dieses
 * Profil-Verzeichnis läuft. Wenn nicht, startet er einen.
 * Nach MAX_LAUNCH_RETRIES Fehlschlägen wird DAUERHAFT gestoppt (auch über
 * Server-Neustarts), bis `resetAgentChromeLaunchAttempts` (Retry-API) läuft.
 */
export async function ensureAgentChromeRunning(
  profileDir: string,
  startUrl = "about:blank",
): Promise<ChromeLaunch> {
  const key = profileDir.toLowerCase();
  let tracker = profileLaunchTrackers.get(key) ?? { failures: 0, lastAttemptAt: 0 };
  // loopfix: gestoppter Zustand laeuft nach 10 Minuten ab (danach wieder genau 1 Versuch).
  if (tracker.stopped && tracker.lastAttemptAt && Date.now() - tracker.lastAttemptAt > 10 * 60_000) {
    profileLaunchTrackers.delete(key);
    loggedStops.delete(key);
    tracker = { failures: 0, lastAttemptAt: 0 };
  }

  if (tracker.stopped || tracker.failures >= MAX_LAUNCH_RETRIES) {
    if (!tracker.stopped) {
      tracker.stopped = true;
      profileLaunchTrackers.set(key, tracker);
      persistTrackers(profileDir);
    }
    if (!loggedStops.has(key)) {
      loggedStops.add(key);
      console.warn(`[agent-cdp] Browser-Start für ${profileDir} gestoppt nach ${tracker.failures} Fehlschlägen: ${tracker.lastError ?? "?"}`);
    }
    return {
      ok: false,
      detail: `Browser-Start gestoppt nach ${tracker.failures}/${MAX_LAUNCH_RETRIES} Fehlschlägen (${tracker.lastError ?? "unbekannt"}). Profil prüfen und „Erneut versuchen“ klicken.`,
    };
  }

  // loopfix: Single-Instance + Rate-Limit + Schutzschalter (browser-launch-guard.ts).
  const res = await ensureProfileBrowser(profileDir, {
    label: "Agent-Browser",
    spawn: (port) => spawnAgentChromeRaw(startUrl, profileDir, port),
  });
  if (res.ok) {
    loggedStops.delete(key);
    if (profileLaunchTrackers.delete(key)) persistTrackers(profileDir);
    return { ok: true, binary: res.reused ? "running" : "helium", port: res.port };
  }
  tracker.lastAttemptAt = Date.now();
  tracker.failures += 1;
  tracker.lastError = res.error;
  tracker.stopped = Boolean(res.tripped) || tracker.failures >= MAX_LAUNCH_RETRIES;
  profileLaunchTrackers.set(key, tracker);
  persistTrackers(profileDir);
  return { ok: false, detail: res.error };
}

/** Normalisierter Schluessel (fuer Aufrufer, die den Guard direkt nutzen). */
export function agentProfileKey(profileDir: string): string {
  return normalizeProfileDir(profileDir);
}
