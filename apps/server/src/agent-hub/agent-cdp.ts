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

import { existsSync } from "node:fs";

/** Deterministic CDP port per profile: CONNECT_CHROME_CDP_PORT (default 9333) + 0..199. */
export function cdpPortFor(profileDir: string): number {
  const basePort = Number(process.env.CONNECT_CHROME_CDP_PORT) || 9333;
  let h = 2166136261;
  for (const ch of profileDir.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return basePort + (h % 200);
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

export async function cdpScreenshot(
  port: number,
  targetId?: string,
): Promise<CdpShot> {
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
export type ChromeLaunch = { ok: true; binary: string } | { ok: false; detail: string };

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

export async function launchAgentChrome(
  url: string,
  profileDir: string,
): Promise<ChromeLaunch> {
  const args = [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${cdpPortFor(profileDir)}`,
    "--remote-debugging-address=127.0.0.1",
    "--new-window",
    url,
  ];
  const errors: string[] = [];
  for (const binary of CHROME_BIN_CANDIDATES) {
    if (!(await chromeBinaryExists(binary))) {
      errors.push(`${binary}: nicht gefunden`);
      continue;
    }
    if (process.platform === "win32") {
      // Wir starten den Browser via `cmd.exe /c start "" "..."` statt
      // PowerShell-Start-Process, weil das PowerShell-Pendant Args mit
      // Leerzeichen falsch splittet (z.B. `--user-data-dir="C:\Users\…"`
      // wird zu `--user-data-dir="C:\Users\…"` mit allem NACH dem ersten
      // Leerzeichen als zweitem Argument). `cmd /c start` nimmt die
      // Argumente als einen String, den wir selbst korrekt quoten.
      const cmdQuoted = args
        .map((a) => (a.includes(" ") || a.includes('"') ? `"${a.replace(/"/g, '\\"')}"` : a))
        .join(" ");
      const cmdLine = `start "" "${binary}" ${cmdQuoted}`;
      try {
        const proc = Bun.spawn(
          ["cmd.exe", "/d", "/c", cmdLine],
          {
            stdout: "ignore",
            stderr: "pipe",
            stdin: "ignore",
            windowsHide: false,
          } as Parameters<typeof Bun.spawn>[1],
        );
        void proc.exited.catch(() => undefined);
        // Wir warten kurz, falls cmd.exe sofort einen Fehler meldet; sonst
        // ist der Browser detached und läuft eigenständig.
        await new Promise((r) => setTimeout(r, 200));
        return { ok: true, binary };
      } catch (err) {
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
  return cdpCall(port, "Page.navigate", { url: parsed.href }, targetId);
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

/**
 * Stufe 1.2 Helper: Sorgt dafür, dass der Agent-Browser für dieses
 * Profil-Verzeichnis läuft. Wenn nicht, startet er einen.
 *
 * Blockt bis der CDP-Server antwortet — und schlägt sonst fehl.
 */
export async function ensureAgentChromeRunning(
  profileDir: string,
  startUrl = "about:blank",
): Promise<ChromeLaunch> {
  const port = cdpPortFor(profileDir);
  // CDP schon da?
  if (existsSync(profileDir) && (await waitForCdp(port, 600))) {
    return { ok: true, binary: "running" };
  }
  // Sonst starten
  const launch = await launchAgentChrome(startUrl, profileDir);
  if (!launch.ok) return launch;
  const ready = await waitForCdp(port, 6000);
  if (!ready) {
    return {
      ok: false,
      detail: `Browser gestartet, aber CDP antwortet nicht auf 127.0.0.1:${port}.`,
    };
  }
  return launch;
}
