/**
 * helium-appcast: Live-Vorschau fuer Multi-Login-Apps (Codex, Antigravity, Manus).
 *
 * Gleiches Muster wie die Agent-Browser-Vorschau (agent-cdp.ts): die Electron-/Chromium-App wird
 * mit eigenem user-data-dir UND `--remote-debugging-port=<Port pro Profil>` gestartet (nur
 * 127.0.0.1). Connect haengt sich per CDP an, streamt `Page.startScreencast` als JPEG-Frames ueber
 * den eigenen, angemeldeten WebSocket (`/api/app-accounts/:id/screencast`) und leitet Maus,
 * Mausrad, Tasten und Text per `Input.*` zurueck. Der Debug-Port selbst ist nie von aussen
 * erreichbar; Fernzugriff (Laptop/Handy ueber Tunnel) laeuft nur ueber die Connect-Route.
 *
 * Laeuft das Profil schon OHNE Debug-Port, wird NICHT beendet: der Start meldet `needsRestart`, und
 * erst ein Klick auf "Neu mit Vorschau starten" (restart=true) schliesst genau diese Instanz.
 */
import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import type { AppAccountRecord, LaunchAccountResult } from "./types";
import { acquireLaunchSlot, reportLaunchResult } from "../../agent-hub/browser-launch-guard";

export type CastSpec = {
  /** Programm, z. B. ChatGPT.exe (Codex), Antigravity.exe oder helium.exe. */
  exe: string;
  /** Argumente ohne die Debug-Port-Schalter. */
  args: string[];
  env?: NodeJS.ProcessEnv;
  /** user-data-dir des Profils; null = Standardprofil der App (ohne --user-data-dir). */
  profileDir: string | null;
  /** Prozessname fuer die Erkennung laufender Instanzen, z. B. "ChatGPT.exe". */
  processName: string;
  /** Anzeigename fuer Meldungen. */
  appName: string;
};

export type CastLaunchResult = LaunchAccountResult & {
  preview?: boolean;
  debugPort?: number;
  needsRestart?: boolean;
};

const PORT_BASE = Number(process.env.CONNECT_APPCAST_PORT_BASE) || 9640;
const PORT_SPAN = 100;

type CastState = { port: number; pid?: number; startedAt: string; exe: string; profileDir: string | null };

function statePath(account: AppAccountRecord): string {
  return path.join(account.dataDir, "appcast.json");
}

function readState(account: AppAccountRecord): CastState | null {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(account), "utf8")) as CastState;
    return typeof raw.port === "number" ? raw : null;
  } catch {
    return null;
  }
}

function writeState(account: AppAccountRecord, state: CastState): void {
  try {
    fs.mkdirSync(account.dataDir, { recursive: true });
    fs.writeFileSync(statePath(account), JSON.stringify(state, null, 2), "utf8");
  } catch {}
}

function preferredPort(id: string): number {
  let h = 2166136261;
  for (const ch of id.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return PORT_BASE + (h % PORT_SPAN);
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}

async function pickPort(account: AppAccountRecord): Promise<number> {
  const start = readState(account)?.port ?? preferredPort(account.id);
  for (let i = 0; i < PORT_SPAN; i++) {
    const port = PORT_BASE + ((start - PORT_BASE + i + PORT_SPAN) % PORT_SPAN);
    if (await portFree(port)) return port;
  }
  throw new Error("Kein freier Debug-Port im Bereich " + PORT_BASE + "-" + (PORT_BASE + PORT_SPAN - 1));
}

export async function cdpAlive(port: number, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitCdp(port: number, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await cdpAlive(port, 1000)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

type Proc = { ProcessId: number; ParentProcessId: number; CommandLine: string | null };

function listProcesses(processName: string): Promise<Proc[]> {
  if (process.platform !== "win32") return Promise.resolve([]);
  const safe = processName.replace(/[^A-Za-z0-9._-]/g, "");
  const script =
    `Get-CimInstance Win32_Process -Filter "Name='${safe}'" | ` +
    `Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress`;
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 15000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve([]);
        try {
          const parsed = JSON.parse(stdout);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch {
          resolve([]);
        }
      },
    );
  });
}

function norm(p: string): string {
  return p.replace(/["']/g, "").replace(/[\\/]+$/, "").toLowerCase();
}

/** Hauptprozesse (Browser-Prozess, ohne --type=) der Instanz dieses Profils, plus ggf. ihr Debug-Port. */
export async function findRunning(spec: CastSpec): Promise<{ pids: number[]; debugPort: number | null }> {
  const procs = await listProcesses(spec.processName);
  const byPid = new Map(procs.map((p) => [p.ProcessId, p]));
  const want = spec.profileDir ? norm(spec.profileDir) : null;
  const mains = new Set<number>();
  for (const p of procs) {
    const cmd = (p.CommandLine || "").toLowerCase();
    if (!cmd) continue;
    const m = /--user-data-dir=("([^"]+)"|(\S+))/.exec(p.CommandLine || "");
    const dir = m ? norm(m[2] || m[3] || "") : null;
    let matches: boolean;
    if (want) matches = dir === want;
    else matches = !dir && !cmd.includes("--type=");
    if (!matches) continue;
    if (cmd.includes("--type=")) {
      const parent = byPid.get(p.ParentProcessId);
      if (parent) mains.add(parent.ProcessId);
    } else {
      mains.add(p.ProcessId);
    }
  }
  let debugPort: number | null = null;
  for (const pid of mains) {
    const cmd = byPid.get(pid)?.CommandLine || "";
    const m = /--remote-debugging-port=(\d+)/.exec(cmd);
    if (m) debugPort = Number(m[1]);
  }
  return { pids: [...mains], debugPort };
}

function taskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolve) => {
    execFile(
      "taskkill.exe",
      force ? ["/PID", String(pid), "/T", "/F"] : ["/PID", String(pid), "/T"],
      { windowsHide: true, timeout: 10000 },
      () => resolve(),
    );
  });
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Nur nach ausdruecklichem Klick: genau die Instanz dieses Profils schliessen (erst sanft, dann hart). */
async function closeInstance(pids: number[]): Promise<void> {
  for (const pid of pids) await taskkill(pid, false);
  const until = Date.now() + 6000;
  while (Date.now() < until && pids.some(pidAlive)) await new Promise((r) => setTimeout(r, 300));
  for (const pid of pids.filter(pidAlive)) await taskkill(pid, true);
  await new Promise((r) => setTimeout(r, 800));
}

/** Aktueller CDP-Port eines Profils, falls die Instanz mit Vorschau laeuft. */
export async function previewPortFor(account: AppAccountRecord): Promise<number | null> {
  const state = readState(account);
  if (state && (await cdpAlive(state.port))) return state.port;
  return null;
}

export async function launchWithPreview(
  account: AppAccountRecord,
  spec: CastSpec,
  options: { restart?: boolean } = {},
): Promise<CastLaunchResult> {
  const base = {
    app: account.app,
    accountId: account.id,
    label: account.label,
    dataDir: account.dataDir,
  };
  const state = readState(account);
  if (state && (await cdpAlive(state.port))) {
    return {
      ...base,
      ok: true,
      preview: true,
      debugPort: state.port,
      message: `${spec.appName} (${account.label}) laeuft bereits - Live-Vorschau verbunden.`,
    };
  }

  const running = await findRunning(spec);
  if (running.debugPort && (await cdpAlive(running.debugPort))) {
    writeState(account, {
      port: running.debugPort,
      pid: running.pids[0],
      startedAt: new Date().toISOString(),
      exe: spec.exe,
      profileDir: spec.profileDir,
    });
    return {
      ...base,
      ok: true,
      preview: true,
      debugPort: running.debugPort,
      message: `${spec.appName} (${account.label}) laeuft bereits - Live-Vorschau verbunden.`,
    };
  }
  if (running.pids.length > 0) {
    if (!options.restart) {
      return {
        ...base,
        ok: false,
        needsRestart: true,
        message: `${spec.appName} (${account.label}) laeuft schon ohne Vorschau. "Neu mit Vorschau starten" schliesst diese Instanz und oeffnet sie mit Live-Vorschau neu.`,
      };
    }
    await closeInstance(running.pids);
  }

  // loopfix: gleicher Schutz wie beim Agent-Browser – max. 1 Start/15 s, Schutzschalter
  // bei > 3 Starts/Minute oder 2 Fehlstarts in Folge. Nie in einer Schleife neu starten.
  const guardKey = `appcast:${account.app}:${account.id}`;
  const slot = acquireLaunchSlot(guardKey, `${spec.appName} (${account.label})`);
  if (!slot.ok) return { ...base, ok: false, message: slot.error };

  if (spec.profileDir) fs.mkdirSync(spec.profileDir, { recursive: true });
  const port = await pickPort(account);
  const args = [
    ...spec.args,
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
  ];
  try {
    const child = spawn(spec.exe, args, {
      detached: true,
      stdio: "ignore",
      env: spec.env ?? process.env,
      windowsHide: false,
    });
    child.on("error", () => {});
    child.unref();
    const ready = await waitCdp(port, 25000);
    reportLaunchResult(guardKey, ready, ready ? undefined : `Vorschau-Port ${port} antwortet nicht`);
    writeState(account, {
      port,
      pid: child.pid,
      startedAt: new Date().toISOString(),
      exe: spec.exe,
      profileDir: spec.profileDir,
    });
    return {
      ...base,
      ok: true,
      pid: child.pid,
      preview: ready,
      debugPort: port,
      message: ready
        ? `${spec.appName} (${account.label}) gestartet - Live-Vorschau bereit.`
        : `${spec.appName} (${account.label}) gestartet, aber die Vorschau antwortet (noch) nicht.`,
    };
  } catch (err: any) {
    reportLaunchResult(guardKey, false, String(err?.message || err));
    return { ...base, ok: false, message: `${spec.appName} konnte nicht starten: ${err?.message || err}` };
  }
}

// ---------------------------------------------------------------------------------------------
// Screencast-Sitzung: ein CDP-WebSocket pro Zuschauer, Frames raus, Eingaben rein.
// Nachrichtenformat identisch zu LiveScreen (/api/computers/:id/stream).
// ---------------------------------------------------------------------------------------------

type Target = { id: string; type: string; url: string; title: string; webSocketDebuggerUrl?: string };

async function pickTarget(port: number): Promise<Target | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
    const list = (await res.json()) as Target[];
    const pages = list.filter(
      (t) => t.type === "page" && t.webSocketDebuggerUrl && !t.url.startsWith("devtools://"),
    );
    return (
      // Hauptfenster vor Nebenfenstern (z. B. Codex "detached-window").
      pages.find((t) => t.url.startsWith("app://") && /\/index\.html/.test(t.url)) ||
      pages.find((t) => t.url.startsWith("app://") && !/detached|popup|overlay/i.test(t.url)) ||
      pages.find((t) => t.url.startsWith("app://")) ||
      pages.find((t) => !t.url.startsWith("chrome-extension://")) ||
      pages[0] ||
      null
    );
  } catch {
    return null;
  }
}

export type CastSession = { handle(raw: string): void; close(): void };

const FOCUS_COMPOSER = `(() => {
  const a = document.activeElement;
  const editable = (el) => el && (el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|)$/.test(el.type || "")));
  if (editable(a)) return "kept";
  const cands = [...document.querySelectorAll('[contenteditable="true"], textarea')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 10;
  });
  const el = cands.sort((x, y) => y.getBoundingClientRect().bottom - x.getBoundingClientRect().bottom)[0];
  if (!el) return "none";
  el.focus();
  return "focused";
})()`;

export async function openCastSession(
  port: number,
  out: (message: string) => void,
  onEnd: () => void,
): Promise<CastSession> {
  const target = await pickTarget(port);
  if (!target?.webSocketDebuggerUrl) throw new Error("Kein App-Fenster ueber CDP gefunden.");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 1;
  let closed = false;
  let lastFrameAt = 0;
  let viewport = { width: 1280, height: 800 };
  const pending = new Map<number, (result: any) => void>();

  const call = (method: string, params: Record<string, unknown> = {}): Promise<any> =>
    new Promise((resolve) => {
      if (closed || ws.readyState !== WebSocket.OPEN) return resolve(null);
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.delete(id)) resolve(null);
      }, 8000);
    });

  const end = () => {
    if (closed) return;
    closed = true;
    clearInterval(fallback);
    try {
      ws.send(JSON.stringify({ id: nextId++, method: "Page.stopScreencast" }));
    } catch {}
    try {
      ws.close();
    } catch {}
    onEnd();
  };

  // Wenn das Fenster verdeckt/minimiert ist, liefert Chromium u. U. keine Screencast-Frames. Dann
  // alle 2 s ein Einzelbild, damit die Vorschau nicht schwarz bleibt.
  const fallback = setInterval(async () => {
    if (closed || Date.now() - lastFrameAt < 2000) return;
    const metrics = await call("Page.getLayoutMetrics");
    const vp = metrics?.cssVisualViewport || metrics?.visualViewport;
    if (vp?.clientWidth) viewport = { width: Math.round(vp.clientWidth), height: Math.round(vp.clientHeight) };
    const shot = await call("Page.captureScreenshot", { format: "jpeg", quality: 60 });
    if (shot?.data && !closed && Date.now() - lastFrameAt >= 2000) {
      out(JSON.stringify({ type: "frame", data: shot.data, width: viewport.width, height: viewport.height }));
    }
  }, 2000);

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("CDP-Verbindung Zeitueberschreitung")), 8000);
    ws.onopen = () => {
      clearTimeout(t);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error("CDP-Verbindung fehlgeschlagen"));
    };
  });

  ws.onmessage = (event) => {
    let msg: any;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (typeof msg.id === "number") {
      const done = pending.get(msg.id);
      if (done) {
        pending.delete(msg.id);
        done(msg.result ?? null);
      }
      return;
    }
    if (msg.method === "Page.screencastFrame") {
      const p = msg.params || {};
      lastFrameAt = Date.now();
      const md = p.metadata || {};
      if (md.deviceWidth) viewport = { width: Math.round(md.deviceWidth), height: Math.round(md.deviceHeight) };
      try {
        ws.send(JSON.stringify({ id: nextId++, method: "Page.screencastFrameAck", params: { sessionId: p.sessionId } }));
      } catch {}
      out(JSON.stringify({ type: "frame", data: p.data, width: viewport.width, height: viewport.height }));
    }
  };
  ws.onclose = () => end();
  ws.onerror = () => end();

  await call("Page.enable");
  // helium-ui-fullpreview: hoehere Aufloesung fuer die Vollflaechen-/Vollbild-Vorschau (scharfer Text).
  // Chrome liefert nie mehr als die echte Fenstergroesse der App – das Fenster selbst wird NICHT veraendert.
  await call("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 2560, maxHeight: 1600, everyNthFrame: 1 });
  out(JSON.stringify({ type: "target", title: target.title, url: target.url }));

  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const button = (b: unknown) => (b === "right" || b === "middle" ? b : "left");

  const pressKey = async (key: string, code: string, vk: number, text?: string) => {
    await call("Input.dispatchKeyEvent", {
      type: text ? "keyDown" : "rawKeyDown",
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      ...(text ? { text, unmodifiedText: text } : {}),
    });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  };

  return {
    handle(raw: string) {
      let m: any;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (!m || typeof m.type !== "string") return;
      if (m.type === "mouse") {
        const type = m.event === "pressed" ? "mousePressed" : m.event === "released" ? "mouseReleased" : "mouseMoved";
        void call("Input.dispatchMouseEvent", {
          type,
          x: num(m.x),
          y: num(m.y),
          button: type === "mouseMoved" ? "none" : button(m.button),
          clickCount: type === "mouseMoved" ? 0 : Math.max(1, num(m.clickCount, 1)),
          modifiers: num(m.modifiers),
        });
      } else if (m.type === "wheel") {
        void call("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: num(m.x),
          y: num(m.y),
          deltaX: num(m.deltaX),
          deltaY: num(m.deltaY),
          modifiers: num(m.modifiers),
        });
      } else if (m.type === "key") {
        const text = typeof m.text === "string" && m.text.length > 0 ? m.text : undefined;
        void call("Input.dispatchKeyEvent", {
          type: m.event === "up" ? "keyUp" : text ? "keyDown" : "rawKeyDown",
          key: String(m.key ?? ""),
          code: String(m.code ?? ""),
          windowsVirtualKeyCode: num(m.windowsVirtualKeyCode),
          nativeVirtualKeyCode: num(m.windowsVirtualKeyCode),
          modifiers: num(m.modifiers),
          ...(m.event !== "up" && text ? { text, unmodifiedText: text } : {}),
        });
      } else if (m.type === "text" && typeof m.text === "string") {
        void call("Input.insertText", { text: m.text.slice(0, 20000) });
      } else if (m.type === "prompt" && typeof m.text === "string") {
        void (async () => {
          await call("Runtime.evaluate", { expression: FOCUS_COMPOSER, returnByValue: true });
          await call("Input.insertText", { text: m.text.slice(0, 20000) });
          if (m.submit) {
            await new Promise((r) => setTimeout(r, 120));
            await pressKey("Enter", "Enter", 13, "\r");
          }
          out(JSON.stringify({ type: "sent" }));
        })();
      } else if (m.type === "scroll") {
        void call("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: Math.round(viewport.width / 2),
          y: Math.round(viewport.height / 2),
          deltaX: 0,
          deltaY: num(m.deltaY, 400),
        });
      }
    },
    close: end,
  };
}
