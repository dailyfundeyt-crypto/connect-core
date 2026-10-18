/**
 * E2E-Test für Stufe 1.3 — Live-CLI-Stream.
 *
 * Startet einen agy-Run über `startAgentCliRun` und liest alle Events
 * live. Wir prüfen, dass der Parse das echte Antigravity-Format
 * versteht und Text-Deltas während des Laufs publiziert.
 */

import { lastAgentCliRun, startAgentCliRun, subscribeAgentCliRun, abortAgentCliRun } from "../src/agent-hub/agent-cli-stream";

const AGENT_ID = "e2e-stufe13-direct";
const PROVIDER = "antigravity" as const;
const MODEL = "auto";
const PROMPT = "Antworte mit genau: PING_STUFE13_OK";

console.log(`[e2e] starting run: provider=${PROVIDER} model=${MODEL} prompt=${JSON.stringify(PROMPT)}`);
const { runId } = startAgentCliRun({
  agentId: AGENT_ID,
  provider: PROVIDER,
  model: MODEL,
  prompt: PROMPT,
  allowWrite: false,
});
console.log(`[e2e] runId=${runId}`);

let deltaCount = 0;
let lastText = "";
let firstDeltaAt = 0;
const startedAt = Date.now();

(async () => {
  try {
    for await (const event of subscribeAgentCliRun(AGENT_ID, runId)) {
      if (event.kind === "meta") {
        console.log(`[e2e] meta: status=${event.meta.status} startedAt=${event.meta.startedAt}`);
      } else if (event.kind === "event") {
        const inner = event.event;
        if (inner.text) {
          deltaCount += 1;
          if (firstDeltaAt === 0) firstDeltaAt = Date.now() - startedAt;
          lastText += inner.text;
          process.stdout.write(`[e2e] delta(${deltaCount}): ${JSON.stringify(inner.text.slice(0, 80))}\n`);
        }
        if (inner.error) {
          console.log(`[e2e] error: ${inner.error}`);
        }
        if (inner.usage) {
          console.log(`[e2e] usage: input=${inner.usage.input} output=${inner.usage.output}`);
        }
      } else if (event.kind === "done") {
        const meta = event.meta;
        console.log(`[e2e] done: status=${meta.status} duration=${meta.finishedAt! - meta.startedAt}ms textLen=${meta.fullText.length} error=${meta.error ?? "-"}`);
        console.log(`[e2e] fullText: ${JSON.stringify(meta.fullText.slice(0, 200))}`);
        console.log(`[e2e] stats: ${deltaCount} deltas, first delta after ${firstDeltaAt}ms`);
        const last = lastAgentCliRun(AGENT_ID);
        console.log(`[e2e] lastAgentCliRun: ${last?.runId === runId ? "match" : "MISS-MATCH"}`);
        if (meta.status === "error") {
          process.exit(1);
        }
        if (deltaCount === 0) {
          console.error(`[e2e] KEINE DELTAS! Parse-Format kaputt?`);
          process.exit(2);
        }
        if (!meta.fullText.includes("PING_STUFE13_OK")) {
          console.error(`[e2e] Antwort enthält nicht "PING_STUFE13_OK" — Parse falsch`);
          process.exit(3);
        }
        console.log(`[e2e] ✅ E2E OK`);
        process.exit(0);
      }
    }
  } catch (error) {
    console.error(`[e2e] CRASH:`, error);
    process.exit(99);
  }
})();

// Safety timeout: 60s
setTimeout(() => {
  console.error(`[e2e] TIMEOUT — aborting run`);
  abortAgentCliRun(AGENT_ID, runId);
  process.exit(98);
}, 60_000);
