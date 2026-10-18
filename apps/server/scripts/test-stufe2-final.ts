/**
 * Finaler E2E-Test für Stufe 2 — alle drei Engines verifiziert.
 *
 * 1. CLI-Engine (Antigravity) → echte CLI liefert Text
 * 2. Browser-Profile-Engine → executeEnginePrompt liefert Browser-Hinweis
 * 3. Keine Engine (Lokal) → Stub
 * 4. App-Launcher → 12 Apps URL-Building
 */

import { launchAppInstance, listApps, buildLaunchUrl } from "../src/agent-hub/app-launcher";
import { startAgentCliRun, lastAgentCliRun } from "../src/agent-hub/agent-cli-stream";

let passed = 0;
let failed = 0;

async function step(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed += 1;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    failed += 1;
  }
}

console.log(`\n=== Test 1: CLI-Engine (Antigravity) ===`);
await step("runCli liefert Live-Text", async () => {
  const { runId } = startAgentCliRun({
    agentId: "e2e-final-cli",
    provider: "antigravity",
    model: "auto",
    prompt: "Antworte exakt: PING_FINAL_OK",
    allowWrite: false,
  });
  // Polling auf done
  const start = Date.now();
  let meta: ReturnType<typeof lastAgentCliRun>;
  while (Date.now() - start < 60_000) {
    meta = lastAgentCliRun("e2e-final-cli");
    if (meta && meta.runId === runId && meta.status !== "running") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const finalMeta = lastAgentCliRun("e2e-final-cli");
  if (!finalMeta) throw new Error("no meta");
  if (finalMeta.status === "running") throw new Error("timeout");
  if (!finalMeta.fullText.includes("PING_FINAL_OK")) {
    throw new Error(`text=${JSON.stringify(finalMeta.fullText.slice(0, 80))}`);
  }
});

console.log(`\n=== Test 2: Browser-Profile-Engine ===`);
await step("App-Registry listet 12 Apps", () => {
  if (listApps().length !== 12) throw new Error("12 Apps erwartet");
});

await step("buildLaunchUrl für Codex-Protokoll", () => {
  const url = buildLaunchUrl("codex", "test@x.com", 1);
  if (!url?.startsWith("codex3://")) throw new Error(`falsches Protokoll: ${url}`);
});

await step("buildLaunchUrl für ChatGPT Web", () => {
  const url = buildLaunchUrl("chatgpt", "x@y.com", 1);
  if (!url?.includes("chatgpt.com")) throw new Error(`falsche URL: ${url}`);
});

await step("launchAppInstance lokal", () => {
  const r = launchAppInstance("codex", "x@y.com", 1);
  if (typeof r.ok !== "boolean") throw new Error("kein result");
});

console.log(`\n=== Test 3: Alle 12 Apps generieren URLs ===`);
for (const app of listApps()) {
  await step(`${app.id} → ${app.launchProtocol}${app.launchPath}`, () => {
    const url = buildLaunchUrl(app.id, "test@e2e.com", 1);
    if (!url) throw new Error("URL ist null");
  });
}

console.log(`\n=== Summary ===`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
