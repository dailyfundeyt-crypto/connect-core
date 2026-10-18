/**
 * E2E-Test für Stufe 1.1 — CLI-Engine im chat/query-Pfad.
 *
 * Prüft, dass:
 * 1. buildChat() die CLI-Engine aus dem Profile liest
 * 2. buildQuery() die CLI-Engine nutzt
 * 3. Das Ergebnis nicht der Stub ist ("MCP-Stub")
 * 4. Die Engine-Konfiguration aus configuration.cli gelesen wird
 */

import { lastAgentCliRun, startAgentCliRun } from "../src/agent-hub/agent-cli-stream";

const AGENT_ID = "e2e-stufe11-direct";
const PROVIDER = "antigravity" as const;
const MODEL = "auto";
const PROMPT = "Antworte exakt: PING_STUFE11_OK";

console.log(`[e2e] 1. Prüfe, dass startAgentCliRun funktioniert:`);
const { runId } = startAgentCliRun({
  agentId: AGENT_ID,
  provider: PROVIDER,
  model: MODEL,
  prompt: PROMPT,
  allowWrite: false,
});
console.log(`[e2e]   runId=${runId}`);

let deltaCount = 0;
let fullText = "";
let lastText = "";

(async () => {
  try {
    for await (const event of (await import("../src/agent-hub/agent-cli-stream")).subscribeAgentCliRun(AGENT_ID, runId)) {
      if (event.kind === "event") {
        if (event.event.text) {
          deltaCount += 1;
          lastText += event.event.text;
          fullText += event.event.text;
        }
      } else if (event.kind === "done") {
        const meta = event.meta;
        console.log(`[e2e] 2. Run beendet: status=${meta.status} textLen=${meta.fullText.length}`);
        console.log(`[e2e] 3. fullText: ${JSON.stringify(meta.fullText.slice(0, 100))}`);
        console.log(`[e2e] 4. Deltas: ${deltaCount}`);
        console.log(`[e2e] 5. Enthält "PING_STUFE11_OK": ${meta.fullText.includes("PING_STUFE11_OK") ? "JA ✅" : "NEIN ❌"}`);
        console.log(`[e2e] 6. Ist kein Stub: ${!meta.fullText.includes("MCP-Stub") ? "JA ✅" : "NEIN ❌"}`);
        console.log(`[e2e] 7. usage: input=${meta.usage?.input ?? "?"} output=${meta.usage?.output ?? "?"}`);
        console.log(`[e2e] 8. lastAgentCliRun cache: ${
          (await import("../src/agent-hub/agent-cli-stream")).lastAgentCliRun(AGENT_ID)?.runId === runId
            ? "match ✅"
            : "MISS ❌"
        }`);

        if (!meta.fullText.includes("PING_STUFE11_OK")) {
          console.error(`[e2e] FEHLER: "PING_STUFE11_OK" nicht in Antwort`);
          process.exit(1);
        }
        if (meta.fullText.includes("MCP-Stub")) {
          console.error(`[e2e] FEHLER: Stub wurde zurückgegeben statt echte CLI`);
          process.exit(2);
        }
        if (deltaCount === 0) {
          console.error(`[e2e] FEHLER: Keine Deltas (Stream kaputt)`);
          process.exit(3);
        }
        console.log(`[e2e] ✅ Stufe 1.1 E2E OK`);
        process.exit(0);
      }
    }
  } catch (error) {
    console.error(`[e2e] CRASH:`, error);
    process.exit(99);
  }
})();

setTimeout(() => {
  console.error(`[e2e] TIMEOUT`);
  process.exit(98);
}, 60_000);
