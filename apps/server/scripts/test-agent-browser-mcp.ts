/**
 * Direkter E2E-Test der MCP-Browser-Engine ohne HTTP-Auth.
 *
 * Nutzt die internen Funktionen `performBrowserAction` und das
 * eigene `cdpScreenshot`, um die volle Pipeline zu prüfen:
 *   1. `openBrowserTab` → Browser startet
 *   2. `performBrowserAction(kind=navigate)` → navigiert
 *   3. `cdpScreenshot` → liefert JPEG
 *
 * Schreibt den JPEG nach `C:\Users\Kunc GmbH\Downloads\OpenBot-v2-Helium\apps\server\scripts\e2e-out\`.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cdpPortFor, cdpScreenshot, ensureAgentChromeRunning } from "../src/agent-hub/agent-cdp";
import { openBrowserTab, performBrowserAction } from "../src/agent-hub/agent-browser";

const TEST_AGENT = "e2e-stufe12-direct";
const OUT_DIR = "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\apps\\server\\scripts\\e2e-out";
const PROFILE = `C:\\Users\\Kunc GmbH\\AppData\\Local\\ConnectAgents\\browser-profiles\\${TEST_AGENT}`;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

console.log(`[e2e] agent=${TEST_AGENT} profile=${PROFILE}`);

// 1. Tab öffnen (sollte Browser starten)
const tab = await openBrowserTab(undefined, TEST_AGENT);
console.log(`[e2e] openBrowserTab: tabId=${tab.tabId} profileDir=${tab.profileDir}`);
const port = cdpPortFor(PROFILE);
const ready = await ensureAgentChromeRunning(PROFILE);
if (!ready.ok) {
  console.error(`[e2e] FEHLER: Browser-Start: ${ready.detail}`);
  process.exit(1);
}
console.log(`[e2e] Browser ready, port=${port}, binary=${ready.binary}`);

// 2. Screenshot from about:blank
const shot1 = await cdpScreenshot(port);
if (!shot1.ok || !shot1.bytes) {
  console.error(`[e2e] FEHLER: erster Screenshot: ${shot1.error}`);
  process.exit(1);
}
await Bun.write(join(OUT_DIR, "1-about-blank.jpg"), shot1.bytes);
console.log(`[e2e] Screenshot 1: ${shot1.bytes.length} bytes → ${OUT_DIR}\\1-about-blank.jpg`);

// 3. Navigate to example.com via performBrowserAction
const nav = await performBrowserAction(undefined, TEST_AGENT, { kind: "navigate", url: "https://example.com" });
if (!nav.ok) {
  console.error(`[e2e] FEHLER: navigate: ${nav.error}`);
  process.exit(1);
}
console.log(`[e2e] navigate ok: url=${nav.url} title=${nav.title}`);
if (nav.screenshot) {
  const data = nav.screenshot.split(",")[1];
  await Bun.write(join(OUT_DIR, "2-example-com.jpg"), Buffer.from(data, "base64"));
  console.log(`[e2e] Screenshot 2: ${data.length / 4 * 3} bytes → ${OUT_DIR}\\2-example-com.jpg`);
} else {
  console.warn(`[e2e] navigate liefert keinen inline-Screenshot (shot=null)`);
  // Hole einen frischen
  const shot2 = await cdpScreenshot(port);
  if (shot2.ok && shot2.bytes) {
    await Bun.write(join(OUT_DIR, "2-example-com.jpg"), shot2.bytes);
    console.log(`[e2e] Screenshot 2 (manuell): ${shot2.bytes.length} bytes`);
  }
}

// 4. URL/Title prüfen
const info = await fetch(`http://127.0.0.1:${port}/json/list`);
const tabs = (await info.json()) as Array<{ url: string; title: string; type: string }>;
const page = tabs.find((t) => t.type === "page");
console.log(`[e2e] Page: url=${page?.url} title=${page?.title}`);

console.log(`[e2e] Done.`);
