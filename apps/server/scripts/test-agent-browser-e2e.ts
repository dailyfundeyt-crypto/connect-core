/**
 * E2E-Test für Stufe 1.2 — echte Browser-Engine.
 *
 * Startet einen Chrome mit dem Helium-Binary + Profil-Verzeichnis,
 * prüft ob CDP antwortet, macht einen Screenshot und einen Navigate.
 *
 * Aufruf: bun apps/server/scripts/test-agent-browser-e2e.ts
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const HELIUM = "C:\\Users\\Kunc GmbH\\AppData\\Local\\imput\\Helium\\Application\\chrome.exe";
const PROFILE = "C:\\Users\\Kunc GmbH\\AppData\\Local\\ConnectAgents\\browser-profiles\\e2e-stufe12";
const CDP_BASE = 9333;

function cdpPortFor(profileDir: string): number {
  let h = 2166136261;
  for (const ch of profileDir.toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return CDP_BASE + (h % 200);
}

const port = cdpPortFor(PROFILE);
console.log(`[test] profile=${PROFILE}`);
console.log(`[test] port=${port}`);

// 1. Browser starten (falls nicht schon läuft)
if (!existsSync(PROFILE)) {
  console.log("[test] Profil fehlt, lege leeres Verzeichnis an");
  // Bun.file().write() anstatt mkdirSync — wir nutzen die Bun-Standard-Methoden
  await Bun.$`mkdir -p "${PROFILE}"`.quiet();
}

const versionCheck = async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(800),
    });
    return res.ok;
  } catch {
    return false;
  }
};

if (await versionCheck()) {
  console.log(`[test] CDP läuft schon auf ${port}`);
} else {
  console.log(`[test] Starte Helium mit CDP...`);
  const args = [
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    "--new-window",
    "about:blank",
  ];
  // Start-Process: überlebt unseren Process
  const ps = `Start-Process -FilePath '${HELIUM}' -ArgumentList '${args.map((a) => a.replace(/'/g, "''")).join(" ")}'`;
  await Bun.$`powershell.exe -NoProfile -NonInteractive -Command ${ps}`.quiet();
  // Warten bis CDP da ist
  for (let i = 0; i < 30; i++) {
    if (await versionCheck()) {
      console.log(`[test] CDP antwortet nach ${i * 200}ms`);
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

if (!(await versionCheck())) {
  console.error(`[test] FEHLER: CDP antwortet nicht auf 127.0.0.1:${port}`);
  process.exit(1);
}

// 2. Tabs listen
const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}>;
console.log(`[test] Tabs: ${list.length}`);
const page = list.find((t) => t.type === "page");
if (!page) {
  console.error("[test] Kein Page-Tab");
  process.exit(1);
}
console.log(`[test] Page: id=${page.id} url=${page.url}`);

// 3. Screenshot ziehen
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise<void>((resolve, reject) => {
  ws.onopen = () => resolve();
  ws.onerror = () => reject(new Error("ws failed"));
});

const send = (id: number, method: string, params: Record<string, unknown> = {}) =>
  new Promise<{ id?: number; result?: { data?: string }; error?: { message?: string } }>((resolve) => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data)) as {
        id?: number;
        result?: { data?: string };
        error?: { message?: string };
      };
      if (msg.id === id) {
        ws.removeEventListener("message", handler);
        resolve(msg);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

const shot = await send(1, "Page.captureScreenshot", { format: "jpeg", quality: 60 });
if (shot.error || !shot.result?.data) {
  console.error("[test] Screenshot fehler:", shot.error);
  process.exit(1);
}
const bytes = Buffer.from(shot.result.data, "base64");
await Bun.write(`${PROFILE}/test-screenshot.jpg`, bytes);
console.log(`[test] ✅ Screenshot: ${bytes.length} bytes → ${PROFILE}/test-screenshot.jpg`);

// 4. Navigate zu example.com
const nav = await send(2, "Page.navigate", { url: "https://example.com" });
console.log(`[test] Navigate:`, nav.error?.message ?? "ok");
await new Promise((r) => setTimeout(r, 1500));
const shot2 = await send(3, "Page.captureScreenshot", { format: "jpeg", quality: 60 });
if (shot2.result?.data) {
  const bytes2 = Buffer.from(shot2.result.data, "base64");
  await Bun.write(`${PROFILE}/test-screenshot-example.jpg`, bytes2);
  console.log(`[test] ✅ Screenshot nach navigate: ${bytes2.length} bytes → ${PROFILE}/test-screenshot-example.jpg`);
}

ws.close();
console.log(`[test] Done.`);
