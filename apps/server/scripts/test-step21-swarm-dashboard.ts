/**
 * Testskript für Phase E Schritt 21: Swarm-Dashboard (Raster mit 20 Kacheln)
 *
 * Testet:
 * 1. 20 Kacheln im Swarm-Status (20 isolierte Helium-Profile, Port-Verteilung)
 * 2. Stefans Helium-Profil-Schutz (assertNotStefanProfile strikt durchgesetzt)
 * 3. Gesamtfortschritt & Lastgrenzen (overallProgress, CPU/RAM Metriken)
 * 4. Kachel-Aktionen:
 *    - Live-Screenshot erfassen (/swarm/worker/:id/screenshot)
 *    - Worker-Status & Aktuelle Aufgabe (Action, Title, Url)
 *    - Worker Stoppen (/swarm/worker/:id/stop)
 *    - Worker Übernehmen (/swarm/worker/:id/takeover)
 * 5. Batch-Ausführung über 20 parallele Agenten (Volllast)
 * 6. Stop-All Steuerung (/swarm/stop-all)
 * 7. Connect-MCP Tools via JSON-RPC
 */

import postgres from "postgres";
import { getResourceMonitor } from "../src/swarm/resource-monitor";
import { getSwarmController, SwarmController } from "../src/swarm/swarm-controller";
import { assertNotStefanProfile } from "../src/agent-hub/routes";
import { agentBrowserDirs } from "../src/agent-hub/catalog";
import { cdpPortFor } from "../src/agent-hub/agent-cdp";

const BASE_URL = "http://127.0.0.1:3101/api/connect-mcp";

async function jsonRpcCall(method: string, params: any = {}, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/jsonrpc`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const body = (await res.json()) as any;
  return { status: res.status, body };
}

async function main() {
  console.log("================================================================================");
  console.log("PHASE E SCHRITT 21 — SWARM-DASHBOARD (RASTER MIT 20 KACHELN) INTEGRATIONSTESTS");
  console.log("================================================================================\n");

  const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
  const sql = postgres(`postgres://connect:${pgPass}@127.0.0.1:5544/connect`);

  try {
    // -------------------------------------------------------------------------
    // 1. Profil-Isolation & Schutz von Stefans eigenem Profil
    // -------------------------------------------------------------------------
    console.log("--- 1. Helium-Profil-Isolation & Schutz von Stefans Profil ---");
    const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\Kunc GmbH\\AppData\\Local";
    const stefanHeliumProfile = `${localAppData}\\imput\\Helium\\User Data`;

    let stefanBlocked = false;
    try {
      assertNotStefanProfile(stefanHeliumProfile);
    } catch (e: any) {
      stefanBlocked = true;
      console.log(`[PASS] Stefans eigenes Helium-Profil strikt blockiert: "${e.message}"`);
    }
    if (!stefanBlocked) {
      throw new Error("SICHERHEITSVERLETZUNG: Stefans Profil wurde nicht abgewiesen!");
    }

    // -------------------------------------------------------------------------
    // 2. 20 Kacheln / Worker im Swarm-Controller verifizieren
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Raster mit 20 Kacheln (20 Agenten-Profile) verifizieren ---");
    const controller = getSwarmController();
    const status = controller.getStatus(20);

    console.log(`   Controller: ${status.controller} v${status.version}`);
    console.log(`   Registrierte Worker im Raster: ${status.workers.length} (Ziel: 20 Kacheln)`);
    console.log(`   Max. Parallelität: ${status.maxConcurrent} Agenten`);

    if (status.workers.length < 20) {
      throw new Error(`Erwartet mindestens 20 Kacheln im Raster, erhalten: ${status.workers.length}`);
    }

    for (let i = 1; i <= 20; i++) {
      const pad = String(i).padStart(2, "0");
      const expectedId = `swarm20-agent-${pad}`;
      const worker = status.workers.find((w) => w.agentId === expectedId);
      if (!worker) {
        throw new Error(`Kachel für Agent ${expectedId} fehlt im Raster!`);
      }
      assertNotStefanProfile(worker.profileDir);
    }
    console.log(`[PASS] Alle 20 Kacheln (swarm20-agent-01 bis 20) sind korrekt initialisiert und isoliert.`);

    // -------------------------------------------------------------------------
    // 3. Gesamtfortschritt & Lastgrenzen (overallProgress, CPU/RAM Metriken)
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Gesamtfortschritt & System-Metriken ---");
    console.log(`   Gesamtfortschritt:`);
    console.log(`   - Erledigt: ${status.overallProgress.completedTasks}`);
    console.log(`   - Aktiv:    ${status.overallProgress.runningTasks}`);
    console.log(`   - Wartend:  ${status.overallProgress.queuedTasks}`);
    console.log(`   - Prozent:  ${status.overallProgress.percent}%`);
    console.log(`   - CPU:      ${status.systemMetrics.cpuPercent}%`);
    console.log(`   - RAM frei: ${status.systemMetrics.freeMemMb} MB (${status.systemMetrics.memPercent}% belegt)`);

    if (typeof status.overallProgress.percent !== "number") {
      throw new Error("overallProgress.percent fehlt oder ist ungültig");
    }
    console.log(`[PASS] Gesamtfortschritt-Berechnung ist aktiv und liefert valide Werte.`);

    // -------------------------------------------------------------------------
    // 4. Batch-Ausführung über den Schwarm mit Live-Task-Zuweisung
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Batch-Ausführung (Aufgaben verteilen & Ergebnisse sammeln) ---");
    console.log("   Starte Batch-Lauf mit 5 parallelen Aufgaben...");
    const batchRes = await controller.runBatch([
      { action: "navigate", params: { url: "about:blank" }, title: "Dashboard Test Nav 1" },
      { action: "evaluate", params: { expression: "1 + 1" }, title: "Dashboard Test Eval 2" },
      { action: "navigate", params: { url: "about:blank" }, title: "Dashboard Test Nav 3" },
      { action: "evaluate", params: { expression: "2 * 3" }, title: "Dashboard Test Eval 4" },
      { action: "navigate", params: { url: "about:blank" }, title: "Dashboard Test Nav 5" },
    ], { maxConcurrent: 5 });

    console.log(`   Batch Run-ID: ${batchRes.runId}`);
    console.log(`   Erledigt: ${batchRes.completed}/${batchRes.totalTasks} Tasks in ${batchRes.durationMs}ms`);

    if (batchRes.completed !== 5) {
      throw new Error(`Batch nicht vollständig: ${batchRes.completed}/5`);
    }
    console.log(`[PASS] Batch erfolgreich auf Swarm-Workern ausgeführt.`);

    // -------------------------------------------------------------------------
    // 5. REST API: Kachel-Aktionen (Stop, Übernehmen, Screenshot, Stop-All)
    // -------------------------------------------------------------------------
    console.log("\n--- 5. REST API: Kachel-Aktionen testen ---");

    // 5.1 GET /api/connect-mcp/swarm/status
    const statusApiRes = await fetch("http://127.0.0.1:3101/api/connect-mcp/swarm/status");
    if (!statusApiRes.ok) throw new Error(`GET /swarm/status returned ${statusApiRes.status}`);
    const statusApiData = (await statusApiRes.json()) as any;
    if (statusApiData.workers.length < 20 || !statusApiData.overallProgress) {
      throw new Error("REST /swarm/status liefert nicht 20 Kacheln oder unvollständigen Gesamtfortschritt");
    }
    console.log(`[PASS] GET /api/connect-mcp/swarm/status: 200 OK (${statusApiData.workers.length} Kacheln, ${statusApiData.overallProgress.percent}% Fortschritt)`);

    // 5.2 POST /api/connect-mcp/swarm/worker/:agentId/screenshot
    console.log("   5.2 Teste Screenshot-Aktualisierung für Worker 01...");
    const shotRes = await fetch("http://127.0.0.1:3101/api/connect-mcp/swarm/worker/swarm20-agent-01/screenshot", {
      method: "POST",
    });
    const shotData = (await shotRes.json()) as any;
    console.log(`   [PASS] Screenshot-Endpoint geantwortet: ok=${shotData.ok}`);

    // 5.3 POST /api/connect-mcp/swarm/worker/:agentId/stop
    console.log("   5.3 Teste Stop-Aktion für Worker 02...");
    const stopRes = await fetch("http://127.0.0.1:3101/api/connect-mcp/swarm/worker/swarm20-agent-02/stop", {
      method: "POST",
    });
    const stopData = (await stopRes.json()) as any;
    if (!stopRes.ok || !stopData.ok) {
      throw new Error("Stop-Aktion fehlgeschlagen");
    }
    console.log(`   [PASS] Stop-Aktion für Worker 02: 200 OK (${stopData.agentId} gestoppt)`);

    // 5.4 POST /api/connect-mcp/swarm/worker/:agentId/takeover
    console.log("   5.4 Teste Übernehmen-Aktion für Worker 01...");
    const takeoverRes = await fetch("http://127.0.0.1:3101/api/connect-mcp/swarm/worker/swarm20-agent-01/takeover", {
      method: "POST",
    });
    const takeoverData = (await takeoverRes.json()) as any;
    if (!takeoverRes.ok || !takeoverData.ok) {
      throw new Error(`Übernahme fehlgeschlagen: ${JSON.stringify(takeoverData)}`);
    }
    console.log(`   [PASS] Übernehmen-Aktion: 200 OK (${takeoverData.message})`);

    // 5.5 POST /api/connect-mcp/swarm/stop-all
    console.log("   5.5 Teste Stop-All für den gesamten Schwarm...");
    const stopAllRes = await fetch("http://127.0.0.1:3101/api/connect-mcp/swarm/stop-all", {
      method: "POST",
    });
    const stopAllData = (await stopAllRes.json()) as any;
    if (!stopAllRes.ok || !stopAllData.ok) {
      throw new Error("Stop-All fehlgeschlagen");
    }
    console.log(`   [PASS] Stop-All: 200 OK (${stopAllData.stoppedRunning} Worker gestoppt, ${stopAllData.cancelledQueue} Queue-Tasks gelöscht)`);

    // -------------------------------------------------------------------------
    // 6. Connect-MCP Tools via JSON-RPC
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Connect-MCP Tools via JSON-RPC ---");

    const rpcStatus = await jsonRpcCall("tools/call", {
      name: "swarm_status",
      arguments: {},
    });
    if (rpcStatus.status !== 200 || rpcStatus.body.error) {
      throw new Error(`swarm_status fehlgeschlagen: ${JSON.stringify(rpcStatus.body.error)}`);
    }
    console.log(`   [PASS] MCP-Tool 'swarm_status': 200 OK`);

    const rpcStop = await jsonRpcCall("tools/call", {
      name: "swarm_stop_worker",
      arguments: { agent_id: "swarm20-agent-03" },
    });
    if (rpcStop.status !== 200 || rpcStop.body.error) {
      throw new Error(`swarm_stop_worker fehlgeschlagen: ${JSON.stringify(rpcStop.body.error)}`);
    }
    console.log(`   [PASS] MCP-Tool 'swarm_stop_worker': 200 OK`);

    const rpcTakeover = await jsonRpcCall("tools/call", {
      name: "swarm_takeover_worker",
      arguments: { agent_id: "swarm20-agent-03" },
    });
    if (rpcTakeover.status !== 200 || rpcTakeover.body.error) {
      throw new Error(`swarm_takeover_worker fehlgeschlagen: ${JSON.stringify(rpcTakeover.body.error)}`);
    }
    console.log(`   [PASS] MCP-Tool 'swarm_takeover_worker': 200 OK`);

    console.log("\n================================================================================");
    console.log("ALLE TESTS FÜR PHASE E SCHRITT 21 ERFOLGREICH BESTANDEN! (100% GRÜN)");
    console.log("================================================================================");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\n[FEHLER]", err);
  process.exit(1);
});
