/**
 * Agent Browser-Use Service Integration (Phase E Schritt 18).
 *
 * Bindet die externe Software "C:\Users\Kunc GmbH\Browser use" als Dienst an,
 * damit jeder Agent SEIN eigenes, isoliertes Helium-Profil steuert:
 * - öffnen (Navigieren zu beliebigen URLs im eigenen Helium-Profil)
 * - klicken (CSS-Selektoren, Text-Selektoren oder Koordinaten)
 * - tippen (Tastatureingaben, Text einfügen, Tasten wie Enter/Tab)
 * - Screenshot (Live-Bilderfassung des Agenten-Tabs)
 * - browser-use Tasks (Lernfähige Automatisierung via LangGraph / Browser-Use)
 *
 * SICHERHEIT:
 * - Stefans persönliches Helium-Profil (%LOCALAPPDATA%\imput\Helium\User Data)
 *   wird NIEMALS angefasst (assertNotStefanProfile).
 * - Jeder Agent nutzt ausschließlich sein eigenes isoliertes Profil unter
 *   %LOCALAPPDATA%\ConnectAgents\<agentId>\helium mit eigenem CDP-Port.
 * - Die Live-Ansicht in der Chrome-Vorschau speist sich direkt aus diesem CDP-Port.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { agentBrowserDirs, heliumExecutable } from "../agent-hub/catalog";
import { assertNotStefanProfile } from "../agent-hub/routes";
import {
  cdpCall,
  cdpGlideCursor,
  cdpNavigate,
  cdpPortFor,
  cdpScreenshot,
  ensureAgentChromeRunning,
  injectAgentVisuals,
  waitForCdp,
} from "../agent-hub/agent-cdp";
import { openUrlInProfileTab, resolveProfileCdp } from "../agent-hub/browser-launch-guard";

export const BROWSER_USE_DIR = "C:\\Users\\Kunc GmbH\\Browser use";
export const BROWSER_USE_PYTHON = "C:\\Users\\Kunc GmbH\\Browser use\\.venv\\Scripts\\python.exe";
export const COMET_BRIDGE_SCRIPT = "C:\\Users\\Kunc GmbH\\Browser use\\comet_bridge.py";
export const RUN_SCRIPT = "C:\\Users\\Kunc GmbH\\Browser use\\run.py";
export const LEARNING_AGENT_SCRIPT = "C:\\Users\\Kunc GmbH\\Browser use\\learning_agent.py";

export type BrowserUseServiceStatus = {
  serviceAvailable: boolean;
  serviceDir: string;
  pythonBinary: string;
  bridgeScript: string;
  agentId: string;
  profileDir: string;
  cdpPort: number;
  isStefanProtected: boolean;
  browserRunning: boolean;
  installedPackages: {
    playwright: boolean;
    browserUse: boolean;
    cometBridge: boolean;
  };
};

export type BrowserUseActionResult = {
  ok: boolean;
  agentId: string;
  action: "open" | "click" | "type" | "screenshot" | "task" | "status";
  url?: string | null;
  title?: string | null;
  screenshot?: string | null; // data:image/jpeg;base64,...
  output?: string;
  error?: string;
  durationMs?: number;
};

/**
 * Überprüft den Status des Browser-Use-Dienstes und des Agenten-Profils.
 */
export async function getBrowserUseStatus(agentId: string): Promise<BrowserUseServiceStatus> {
  const dirs = agentBrowserDirs(agentId);
  assertNotStefanProfile(dirs.profile);

  const pythonExists = existsSync(BROWSER_USE_PYTHON);
  const bridgeExists = existsSync(COMET_BRIDGE_SCRIPT);
  const live = await resolveProfileCdp(dirs.profile);
  const port = live.port ?? cdpPortFor(dirs.profile);

  let browserRunning = false;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(500),
    });
    browserRunning = res.ok;
  } catch {
    browserRunning = false;
  }

  return {
    serviceAvailable: pythonExists && bridgeExists,
    serviceDir: BROWSER_USE_DIR,
    pythonBinary: BROWSER_USE_PYTHON,
    bridgeScript: COMET_BRIDGE_SCRIPT,
    agentId,
    profileDir: dirs.profile,
    cdpPort: port,
    isStefanProtected: true,
    browserRunning,
    installedPackages: {
      playwright: pythonExists,
      browserUse: existsSync(join(BROWSER_USE_DIR, "browser-use")),
      cometBridge: bridgeExists,
    },
  };
}

/**
 * Stellt sicher, dass das isolierte Helium-Profil des Agenten läuft und der CDP-Port bereit ist.
 */
export async function ensureAgentHeliumReady(
  agentId: string,
  startUrl = "about:blank",
): Promise<{ ok: boolean; port: number; profileDir: string; error?: string }> {
  const dirs = agentBrowserDirs(agentId);
  assertNotStefanProfile(dirs.profile);

  mkdirSync(dirs.profile, { recursive: true });
  mkdirSync(dirs.output, { recursive: true });

  // loopfix: KEIN automatisches Zuruecksetzen des Schutzschalters mehr (das hat die
  // Fehlerbremse bei jedem Chat-Befehl wieder aufgehoben). Reset nur ueber „Erneut versuchen“.
  const ready = await ensureAgentChromeRunning(dirs.profile, startUrl);
  const port = ready.ok && ready.port ? ready.port : cdpPortFor(dirs.profile);
  if (!ready.ok) {
    return {
      ok: false,
      port,
      profileDir: dirs.profile,
      error: `Helium konnte für Agent ${agentId} nicht gestartet werden: ${ready.detail}`,
    };
  }

  const cdpReady = await waitForCdp(port, 6000);
  if (!cdpReady) {
    return {
      ok: false,
      port,
      profileDir: dirs.profile,
      error: `CDP antwortet nicht auf Port 127.0.0.1:${port}`,
    };
  }

  return { ok: true, port, profileDir: dirs.profile };
}

/**
 * Führt einen Befehl über comet_bridge.py aus der Software C:\Users\Kunc GmbH\Browser use aus.
 */
async function executeCometBridgeCommand(
  port: number,
  command: string,
  args: string[] = [],
  timeoutMs = 15000,
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const pythonBin = existsSync(BROWSER_USE_PYTHON) ? BROWSER_USE_PYTHON : "python";
    const scriptPath = COMET_BRIDGE_SCRIPT;

    const procArgs = [scriptPath, "--port", String(port), command, ...args];
    const proc = spawn(pythonBin, procArgs, {
      windowsHide: true,
      cwd: BROWSER_USE_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve({
        ok: false,
        stdout,
        stderr: stderr + `\nTimeout nach ${timeoutMs}ms`,
        code: -1,
      });
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout,
        stderr: String(err),
        code: -1,
      });
    });
  });
}

/**
 * 1. Öffnen (Navigation): Öffnet eine URL im eigenen Helium-Profil des Agenten.
 */
export async function browserUseOpen(
  agentId: string,
  url: string,
): Promise<BrowserUseActionResult> {
  const start = Date.now();
  const ready = await ensureAgentHeliumReady(agentId, url);
  if (!ready.ok) {
    return {
      ok: false,
      agentId,
      action: "open",
      error: ready.error,
      durationMs: Date.now() - start,
    };
  }

  const port = ready.port;

  // loopfix: URL per CDP im VORHANDENEN Tab oeffnen (Page.navigate, nie neues Fenster).
  // Mehr als 5 Fenster/Tabs => Schutzschalter, Fehler im Chat.
  const opened = await openUrlInProfileTab(port, url, ready.profileDir);
  if (!opened.ok) {
    return {
      ok: false,
      agentId,
      action: "open",
      error: opened.error ?? "Navigation fehlgeschlagen",
      durationMs: Date.now() - start,
    };
  }
  await new Promise((r) => setTimeout(r, 1500));
  const bridgeRes = { ok: true, stdout: "", stderr: "" };

  // Fallback via CDP falls comet_bridge fehlschlägt oder Playwright nicht sofort hooked
  if (!bridgeRes.ok) {
    const cdpRes = await cdpNavigate(port, url);
    if (!cdpRes.ok) {
      return {
        ok: false,
        agentId,
        action: "open",
        error: bridgeRes.stderr || cdpRes.error || "Navigation fehlgeschlagen",
        durationMs: Date.now() - start,
      };
    }
  }

  // Live-Informationen abrufen
  let title: string | null = null;
  let currentUrl = url;
  try {
    const evalRes = await cdpCall(port, "Runtime.evaluate", {
      expression: "JSON.stringify({ title: document.title, url: location.href })",
      returnByValue: true,
    });
    const val = (evalRes.result?.result as any)?.value;
    if (typeof val === "string") {
      const parsed = JSON.parse(val);
      title = parsed.title;
      currentUrl = parsed.url;
    }
  } catch {
    /* ignore */
  }

  // Live-Visuals (animierter Cursor + blauer Comet-Rahmen) vor Screenshot sicherstellen
  await injectAgentVisuals(port);

  // Frischen Screenshot für die Chrome-Vorschau erzeugen
  const shot = await cdpScreenshot(port);
  const screenshotBase64 = shot.ok && shot.bytes
    ? `data:image/jpeg;base64,${Buffer.from(shot.bytes).toString("base64")}`
    : null;

  return {
    ok: true,
    agentId,
    action: "open",
    url: currentUrl,
    title,
    screenshot: screenshotBase64,
    output: bridgeRes.stdout || `Erfolgreich geöffnet: ${currentUrl}`,
    durationMs: Date.now() - start,
  };
}

/**
 * 2. Klicken: Klickt ein Element via Selector oder Pixel-Koordinaten im Agenten-Browser.
 */
export async function browserUseClick(
  agentId: string,
  options: { selector?: string; x?: number; y?: number },
): Promise<BrowserUseActionResult> {
  const start = Date.now();
  const ready = await ensureAgentHeliumReady(agentId);
  if (!ready.ok) {
    return {
      ok: false,
      agentId,
      action: "click",
      error: ready.error,
      durationMs: Date.now() - start,
    };
  }

  const port = ready.port;
  let bridgeRes: { ok: boolean; stdout: string; stderr: string };

  if (options.selector && options.selector.trim()) {
    bridgeRes = await executeCometBridgeCommand(port, "click", [options.selector.trim()]);
    // Fallback via CDP Runtime.evaluate click falls nötig
    if (!bridgeRes.ok) {
      const locate = await cdpCall(port, "Runtime.evaluate", {
        expression: `(() => {
          const sel = ${JSON.stringify(options.selector.trim())};
          const el = document.querySelector(sel);
          if (el) {
            el.click();
            return { ok: true, tag: el.tagName };
          }
          return { ok: false, error: 'Element nicht gefunden' };
        })()`,
        returnByValue: true,
      });
      const val = (locate.result?.result as any)?.value;
      if (val && val.ok) {
        bridgeRes = { ok: true, stdout: `Clicked ${val.tag} via CDP`, stderr: "" };
      }
    }
  } else if (typeof options.x === "number" && typeof options.y === "number") {
    bridgeRes = await executeCometBridgeCommand(port, "clickat", [
      String(Math.round(options.x)),
      String(Math.round(options.y)),
    ]);
    if (!bridgeRes.ok) {
      await cdpGlideCursor(port, options.x, options.y, true, 240);
      const down = await cdpCall(port, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: options.x,
        y: options.y,
        button: "left",
        clickCount: 1,
        buttons: 1,
      });
      const up = await cdpCall(port, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: options.x,
        y: options.y,
        button: "left",
        clickCount: 1,
        buttons: 0,
      });
      if (down.ok && up.ok) {
        bridgeRes = { ok: true, stdout: `Clicked at (${options.x}, ${options.y}) via CDP`, stderr: "" };
      }
    }
  } else {
    return {
      ok: false,
      agentId,
      action: "click",
      error: "Weder Selector noch (x, y) Koordinaten angegeben.",
      durationMs: Date.now() - start,
    };
  }

  if (!bridgeRes.ok) {
    return {
      ok: false,
      agentId,
      action: "click",
      error: bridgeRes.stderr || "Klick-Aktion fehlgeschlagen",
      durationMs: Date.now() - start,
    };
  }

  // Screenshot für Live-Ansicht
  const shot = await cdpScreenshot(port);
  const screenshotBase64 = shot.ok && shot.bytes
    ? `data:image/jpeg;base64,${Buffer.from(shot.bytes).toString("base64")}`
    : null;

  return {
    ok: true,
    agentId,
    action: "click",
    screenshot: screenshotBase64,
    output: bridgeRes.stdout || "Klick erfolgreich ausgeführt.",
    durationMs: Date.now() - start,
  };
}

/**
 * 3. Tippen: Sendet Tastatureingaben oder Tastenkombinationen in den Agenten-Browser.
 */
export async function browserUseType(
  agentId: string,
  options: { text?: string; key?: string; submit?: boolean },
): Promise<BrowserUseActionResult> {
  const start = Date.now();
  const ready = await ensureAgentHeliumReady(agentId);
  if (!ready.ok) {
    return {
      ok: false,
      agentId,
      action: "type",
      error: ready.error,
      durationMs: Date.now() - start,
    };
  }

  const port = ready.port;
  const outputs: string[] = [];

  if (options.text) {
    const typeRes = await executeCometBridgeCommand(port, "type", [options.text]);
    if (!typeRes.ok) {
      // Fallback via CDP Input.insertText
      const cdpType = await cdpCall(port, "Input.insertText", { text: options.text });
      if (!cdpType.ok) {
        return {
          ok: false,
          agentId,
          action: "type",
          error: typeRes.stderr || cdpType.error || "Tippen fehlgeschlagen",
          durationMs: Date.now() - start,
        };
      }
      outputs.push(`Typed "${options.text}" via CDP`);
    } else {
      outputs.push(typeRes.stdout || `Typed "${options.text}"`);
    }
  }

  if (options.key) {
    const keyRes = await executeCometBridgeCommand(port, "key", [options.key]);
    if (!keyRes.ok) {
      await cdpCall(port, "Input.dispatchKeyEvent", {
        type: "keyDown",
        key: options.key,
        code: options.key,
      });
      await cdpCall(port, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key: options.key,
        code: options.key,
      });
    }
    outputs.push(`Pressed ${options.key}`);
  }

  if (options.submit) {
    const enterRes = await executeCometBridgeCommand(port, "key", ["Enter"]);
    if (!enterRes.ok) {
      await cdpCall(port, "Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await cdpCall(port, "Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
    }
    outputs.push("Pressed Enter");
  }

  // Screenshot für Live-Ansicht
  const shot = await cdpScreenshot(port);
  const screenshotBase64 = shot.ok && shot.bytes
    ? `data:image/jpeg;base64,${Buffer.from(shot.bytes).toString("base64")}`
    : null;

  return {
    ok: true,
    agentId,
    action: "type",
    screenshot: screenshotBase64,
    output: outputs.join(" | ") || "Eingabe erfolgreich",
    durationMs: Date.now() - start,
  };
}

/**
 * 4. Screenshot: Erfasst einen frischen Screenshot des aktuellen Agenten-Tabs.
 */
export async function browserUseScreenshot(
  agentId: string,
): Promise<{
  ok: boolean;
  agentId: string;
  screenshot: string | null;
  bytes: Uint8Array | null;
  url?: string;
  savedPath?: string;
  error?: string;
}> {
  const ready = await ensureAgentHeliumReady(agentId);
  if (!ready.ok) {
    return {
      ok: false,
      agentId,
      screenshot: null,
      bytes: null,
      error: ready.error,
    };
  }

  const port = ready.port;
  const shot = await cdpScreenshot(port);

  if (!shot.ok || !shot.bytes) {
    return {
      ok: false,
      agentId,
      screenshot: null,
      bytes: null,
      error: shot.error ?? "Screenshot konnte nicht erfasst werden.",
    };
  }

  // Auch physisch im Agenten-Output-Ordner sichern
  const dirs = agentBrowserDirs(agentId);
  const shotFile = join(dirs.output, `screenshot-${Date.now()}.jpg`);
  try {
    writeFileSync(shotFile, Buffer.from(shot.bytes));
  } catch {
    /* best effort */
  }

  const base64 = `data:image/jpeg;base64,${Buffer.from(shot.bytes).toString("base64")}`;

  return {
    ok: true,
    agentId,
    screenshot: base64,
    bytes: shot.bytes,
    url: shot.url,
    savedPath: shotFile,
  };
}

/**
 * 5. Task: Führt eine autonome Browser-Use Aufgabe für den Agenten aus.
 */
export async function browserUseRunTask(
  agentId: string,
  taskPrompt: string,
): Promise<BrowserUseActionResult> {
  const start = Date.now();
  const ready = await ensureAgentHeliumReady(agentId);
  if (!ready.ok) {
    return {
      ok: false,
      agentId,
      action: "task",
      error: ready.error,
      durationMs: Date.now() - start,
    };
  }

  const port = ready.port;
  const pythonBin = existsSync(BROWSER_USE_PYTHON) ? BROWSER_USE_PYTHON : "python";

  return new Promise((resolve) => {
    // Starte den task mit Umgebungsvariable CHROME_CDP_URL auf den Agenten-Port gerichtet
    const proc = spawn(pythonBin, [RUN_SCRIPT, taskPrompt], {
      windowsHide: true,
      cwd: BROWSER_USE_DIR,
      env: {
        ...process.env,
        CHROME_CDP_URL: `http://127.0.0.1:${port}`,
        CONNECT_AGENT_ID: agentId,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    const timeoutMs = 90000;
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve({
        ok: false,
        agentId,
        action: "task",
        output: stdout,
        error: stderr + `\nTask Timeout nach ${timeoutMs}ms`,
        durationMs: Date.now() - start,
      });
    }, timeoutMs);

    proc.on("close", async (code) => {
      clearTimeout(timer);
      const shot = await cdpScreenshot(port);
      const screenshotBase64 = shot.ok && shot.bytes
        ? `data:image/jpeg;base64,${Buffer.from(shot.bytes).toString("base64")}`
        : null;

      resolve({
        ok: code === 0,
        agentId,
        action: "task",
        screenshot: screenshotBase64,
        output: stdout || stderr,
        error: code === 0 ? undefined : stderr || "Task mit Fehler beendet.",
        durationMs: Date.now() - start,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        agentId,
        action: "task",
        error: String(err),
        durationMs: Date.now() - start,
      });
    });
  });
}
