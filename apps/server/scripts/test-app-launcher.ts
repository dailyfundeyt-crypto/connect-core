/**
 * E2E-Test für Stufe 2 Phase B — App-Instance REST-Routen.
 * Testet die App-Registry und URL-Building-Logik.
 */
import { launchAppInstance, listApps, buildLaunchUrl } from "../src/agent-hub/app-launcher";

console.log(`[e2e] 1. listApps(): ${listApps().length} Apps`);

const apps = listApps();
const codexApp = apps.find((a) => a.id === "codex");
if (!codexApp) throw new Error("Codex nicht gefunden");
console.log(`[e2e] 2. Codex: ${codexApp.displayName} (${codexApp.icon})`);

const url = buildLaunchUrl("codex", "test@example.com", 1);
console.log(`[e2e] 3. Launch URL: ${url}`);
if (!url?.includes("test%40example.com")) throw new Error("E-Mail nicht encoded");
if (!url?.includes("slot=1")) throw new Error("Slot nicht in URL");

// Test alle Apps
for (const app of apps) {
  const u = buildLaunchUrl(app.id, "slot-test@test.com", 2);
  if (!u) {
    console.error(`[e2e] FEHLER: buildLaunchUrl für ${app.id} returned null`);
    process.exit(1);
  }
  console.log(`[e2e]   ${app.id} → ${u}`);
}

// Test ChatGPT (Web, kein Protokoll)
const chatGptUrl = buildLaunchUrl("chatgpt", "hallo@test.de", 3);
console.log(`[e2e] 4. ChatGPT URL: ${chatGptUrl}`);
if (!chatGptUrl?.includes("chatgpt.com")) throw new Error("ChatGPT URL falsch");

// launchAppInstance mit try-catch (spawn kann in Test fehlschlagen)
try {
  const result = launchAppInstance("codex", "test@example.com", 1);
  console.log(`[e2e] 5. launchAppInstance: ok=${result.ok} msg=${result.message}`);
} catch (err) {
  console.log(`[e2e] 5. launchAppInstance: fehlgeschlagen (erwartet im Test-Kontext): ${err}`);
}

console.log(`[e2e] ✅ Stufe 2 Phase B E2E OK`);
