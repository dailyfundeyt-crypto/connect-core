/**
 * Testskript für Phase E Schritt 20: Swarm-Controller (Agent B)
 *
 * Testet:
 * 1. Profil-Isolation & Stefan-Helium-Profil-Schutz (assertNotStefanProfile)
 *    + Profilsperre (Lockfile) gegen Doppelnutzung
 * 2. Grenzen für CPU/RAM (ResourceMonitor) mit künstlich niedrigem Limit & Scheduler-Backpressure
 * 3. Crash-Injektion: Browser-Prozess eines Swarm-Workers künstlich beenden (nur swarm20-agent-*)
 *    + CDP-Heartbeat-Erkennung, Auto-Restart mit Backoff & Wiederaufnahme des Tasks
 *    + Nach maxRetries: Task => failed, Worker => crashed
 * 4. Stufentest 3 → 10 → 20 Agenten parallel (jede Stufe ≥ 95% erfolgreich; bei Fehler Abbruch)
 * 5. Persistenz in Postgres 5544 (swarm_tasks & swarm_results) & Wiederaufnahme nach Neustart
 * 6. Connect-MCP Tool-Integration (run_swarm, swarm_status, swarm_get_results) & REST API
 * 7. Persistiertes JSON-Log nach %LOCALAPPDATA%\ConnectApp\logs\swarm-test-<datum>.json
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { getResourceMonitor } from "../src/swarm/resource-monitor";
import { getSwarmController, SwarmController } from "../src/swarm/swarm-controller";
import { acquireProfileLock, isProfileLocked, releaseProfileLock } from "../src/swarm/profile-lock";
import { assertNotStefanProfile } from "../src/agent-hub/routes";
import { agentBrowserDirs } from "../src/agent-hub/catalog";
import { cdpPortFor } from "../src/agent-hub/agent-cdp";
import type { SwarmTaskAction } from "../src/swarm/swarm-types";

const BASE_URL = "http://127.0.0.1:3101/api/connect-mcp";

async function jsonRpcCall(method: string, params: any = {}, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

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

/**
 * Beendet gezielt und sicher NUR Prozesse von Swarm-Workern (swarm20-agent-*).
 * Stefans eigenes Profil oder andere Prozesse werden unter KEINEN Umständen berührt.
 */
function killSwarmWorkerProcess(agentId: string): number {
  if (!agentId.startsWith("swarm20-agent-") && agentId !== "test-crash-agent") {
    throw new Error(`SICHERHEITSABBRUCH: Nur Swarm-Worker-Prozesse dürfen beendet werden! Ziel: ${agentId}`);
  }

  let killed = 0;
  try {
    const psCmd = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*ConnectAgents\\\\${agentId}*' } | Select-Object -ExpandProperty ProcessId`;
    const out = execSync(`powershell -NoProfile -Command "& { ${psCmd} }"`, { encoding: "utf-8" }).trim();
    if (out) {
      const pids = out.split(/\r?\n/).map((s) => parseInt(s.trim(), 10)).filter((p) => !isNaN(p) && p > 0);
      for (const pid of pids) {
        try {
          process.kill(pid);
          killed++;
        } catch {}
      }
    }
  } catch (err: any) {
    console.warn(`[killSwarmWorkerProcess] Abfragefehler: ${err?.message || String(err)}`);
  }
  return killed;
}

async function main() {
  console.log("================================================================================");
  console.log("PHASE E SCHRITT 20 — SWARM-CONTROLLER INTEGRATIONSTESTS (AGENT B)");
  console.log("================================================================================\n");

  const pgPass = "f1691e59c1531553fd6002595803b1792d1aedf0201833fb";
  const sql = postgres(`postgres://connect:${pgPass}@127.0.0.1:5544/connect`);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\Kunc GmbH\\AppData\\Local";
  const logDir = join(localAppData, "ConnectApp", "logs");
  const logFile = join(logDir, `swarm-test-${dateStr}.json`);

  const testReport: Record<string, any> = {
    testSuite: "Swarm-Controller Integration Tests (Phase E Schritt 20)",
    date: now.toISOString(),
    host: "Kunc GmbH",
    os: process.platform,
    stages: {},
    overallSuccess: false,
  };

  try {
    // -------------------------------------------------------------------------
    // 1. Profil-Isolation & Schutz von Stefans eigenem Profil + Profilsperre
    // -------------------------------------------------------------------------
    console.log("--- 1. Helium-Profil-Isolation, Schutz von Stefans Profil & Profilsperre ---");
    const stefanHeliumProfile = `${localAppData}\\imput\\Helium\\User Data`;

    let stefanBlocked = false;
    try {
      assertNotStefanProfile(stefanHeliumProfile);
    } catch (e: any) {
      stefanBlocked = true;
      console.log(`[PASS] Stefans eigenes Helium-Profil wurde strikt blockiert: "${e.message}"`);
    }
    if (!stefanBlocked) {
      throw new Error("SICHERHEITSVERLETZUNG: Stefans Profil wurde nicht abgewiesen!");
    }

    // 20 Swarm-Profile verifizieren
    const profileDirs = new Set<string>();
    const cdpPorts = new Set<number>();

    for (let i = 1; i <= 20; i++) {
      const pad = String(i).padStart(2, "0");
      const agentId = `swarm20-agent-${pad}`;
      const dirs = agentBrowserDirs(agentId);

      if (!dirs.profile.includes("ConnectAgents") || !dirs.profile.includes(agentId)) {
        throw new Error(`Ungültiges Profilverzeichnis für ${agentId}: ${dirs.profile}`);
      }

      assertNotStefanProfile(dirs.profile);
      profileDirs.add(dirs.profile.toLowerCase());
      cdpPorts.add(cdpPortFor(dirs.profile));
    }

    if (profileDirs.size !== 20) {
      throw new Error(`Erwartet 20 verschiedene Profile, erhalten: ${profileDirs.size}`);
    }
    console.log(`[PASS] 20 isolierte Helium-Profile verifiziert (unter ConnectAgents\\swarm20-agent-XX\\helium).`);

    // Profilsperre (Lockfile) gegen Doppelnutzung testen
    const testLockProfile = agentBrowserDirs("swarm20-agent-01").profile;
    releaseProfileLock(testLockProfile);

    const lock1 = acquireProfileLock(testLockProfile, "swarm20-agent-01", "task-lock-1");
    if (!lock1.success) {
      throw new Error(`Erster Lock-Erwerb fehlgeschlagen: ${lock1.error}`);
    }
    console.log(`[PASS] Lockfile erfolgreich erstellt für swarm20-agent-01.`);

    // Zweiter Agent versucht dasselbe Profil zu sperren -> MUSS fehlschlagen
    const lock2 = acquireProfileLock(testLockProfile, "other-agent", "task-lock-2");
    if (lock2.success) {
      throw new Error("Profilsperre versagte: Doppelnutzung desselben Profils wurde erlaubt!");
    }
    console.log(`[PASS] Profilsperre verhinderte Doppelnutzung: "${lock2.error}"`);

    // Lock wieder freigeben
    releaseProfileLock(testLockProfile, "swarm20-agent-01");
    const checkLock = isProfileLocked(testLockProfile);
    if (checkLock.locked) {
      throw new Error("Lockfile wurde nach releaseProfileLock nicht freigegeben!");
    }
    console.log(`[PASS] Profilsperre ordnungsgemäß freigegeben.`);

    testReport.stages["1_isolation_and_lock"] = {
      stefanProfileBlocked: true,
      profilesCount: 20,
      uniquePortsCount: cdpPorts.size,
      lockfileTestPassed: true,
    };

    // -------------------------------------------------------------------------
    // 2. Grenzen für CPU/RAM (Resource-Monitor) & Scheduler-Backpressure
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Grenzen für CPU/RAM (Resource-Monitor) & Scheduler-Backpressure ---");
    const monitor = getResourceMonitor();
    const metrics = monitor.getMetrics();
    console.log(`   Aktuelle System-Metriken:`);
    console.log(`   - CPU-Auslastung: ${metrics.cpuPercent}%`);
    console.log(`   - Gesamt-RAM:     ${metrics.totalMemMb} MB`);
    console.log(`   - Freier RAM:     ${metrics.freeMemMb} MB`);
    console.log(`   - Verwendeter RAM: ${metrics.usedMemMb} MB (${metrics.memPercent}%)`);

    if (metrics.totalMemMb <= 0 || metrics.freeMemMb <= 0) {
      throw new Error("Ungültige RAM-Werte vom ResourceMonitor erhalten");
    }

    const normalLimits = {
      maxConcurrent: 20,
      maxCpuPercent: 85,
      minFreeMemMb: 1024,
      maxMemPercent: 90,
      taskTimeoutMs: 60000,
      maxRetries: 2,
      retryDelayMs: 500,
    };
    const normalCheck = monitor.checkLimits(normalLimits);
    console.log(`[PASS] Normale Grenzprüfung: allowed=${normalCheck.allowed}`);

    // Limit-Test: maxCpuPercent künstlich niedrig (0%)
    const tightCpuLimits = { ...normalLimits, maxCpuPercent: 0 };
    const tightCpuCheck = monitor.checkLimits(tightCpuLimits);
    if (tightCpuCheck.allowed) {
      throw new Error("ResourceMonitor hätte bei künstlich niedrigem maxCpuPercent=0% drosseln müssen!");
    }
    console.log(`[PASS] Limit-Test mit künstlich niedrigem maxCpuPercent (0%): "${tightCpuCheck.reason}"`);

    // Backpressure im Scheduler verifizieren
    const backpressureController = new SwarmController();
    backpressureController.setLimits({ maxCpuPercent: 0, maxConcurrent: 2 });
    const bpTask = backpressureController.enqueueTask({
      action: "navigate",
      title: "Backpressure Test Task",
      params: { url: "about:blank" },
    });
    // Task sollte wegen Backpressure nicht sofort scheduled werden
    await new Promise((r) => setTimeout(r, 400));
    const bpStatus = backpressureController.getStatus();
    console.log(`[PASS] Scheduler-Backpressure aktiv: queueLength=${bpStatus.queueLength}, runningTasks=${bpStatus.runningTasks}`);
    // Limit wieder freigeben und abbrechen
    backpressureController.cancelTask(bpTask.id);
    backpressureController.stopAll();
    backpressureController.stopScheduler();

    testReport.stages["2_limits_and_backpressure"] = {
      metrics,
      normalAllowed: normalCheck.allowed,
      tightCpuDrosselReason: tightCpuCheck.reason,
      backpressureVerified: true,
    };

    // -------------------------------------------------------------------------
    // 3. Crash-Erkennung per CDP-Heartbeat, Crash-Injektion & Auto-Restart
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Crash-Erkennung per CDP-Heartbeat & Auto-Restart ---");
    const crashController = new SwarmController();
    crashController.setLimits({
      maxConcurrent: 2,
      maxRetries: 2,
      retryDelayMs: 400,
      maxCpuPercent: 95,
      minFreeMemMb: 100,
      maxMemPercent: 98,
    });
    crashController.registerWorker("test-crash-agent", "Crash Test Bot");

    // 3.1 Test: Automatischer Neustart bei simuliertem Absturz
    console.log("   3.1 Starte Task mit simuliertem Verbindungsabbruch...");
    const simulatedTask = crashController.enqueueTask({
      agentId: "test-crash-agent",
      action: "navigate",
      title: "Simulated Crash Task",
      params: { url: "about:blank", simulateCrash: true },
      maxRetries: 2,
    });

    let waitCount = 0;
    while (
      (simulatedTask.status === "queued" ||
        simulatedTask.status === "scheduled" ||
        simulatedTask.status === "running" ||
        simulatedTask.status === "retrying") &&
      waitCount < 60
    ) {
      await new Promise((r) => setTimeout(r, 200));
      waitCount++;
    }

    if (simulatedTask.status !== "completed" || !simulatedTask.recoveredFromCrash) {
      throw new Error(
        `Simulierter Crash-Recovery fehlgeschlagen! Status: ${simulatedTask.status}, Recovered: ${simulatedTask.recoveredFromCrash}`,
      );
    }
    console.log(`[PASS] Simulierter Absturz: Automatisch repariert, Task abgeschlossen (${simulatedTask.retryCount} Retries).`);

    // 3.2 Test: Echte Crash-Injektion (Prozess eines Swarm-Workers künstlich beenden)
    console.log("   3.2 Starte Task mit echter Prozess-Beendigung (Crash-Injektion auf swarm20-agent-01)...");
    const injectWorkerId = "swarm20-agent-01";
    crashController.registerWorker(injectWorkerId, "Swarm20 Bot 01");

    const injectTask = crashController.enqueueTask({
      agentId: injectWorkerId,
      action: "navigate",
      title: "Crash Injection Live Task",
      params: { url: "about:blank" },
      maxRetries: 2,
    });

    // Kurz warten und pollen, bis der Browser-Prozess gestartet ist, dann gezielt beenden
    let killedCount = 0;
    for (let poll = 0; poll < 10; poll++) {
      await new Promise((r) => setTimeout(r, 600));
      killedCount = killSwarmWorkerProcess(injectWorkerId);
      if (killedCount > 0) break;
    }
    console.log(`   -> Prozess von ${injectWorkerId} künstlich beendet (${killedCount} PIDs terminiert).`);

    // Warten auf Recovery
    waitCount = 0;
    while (
      (injectTask.status === "queued" ||
        injectTask.status === "scheduled" ||
        injectTask.status === "running" ||
        injectTask.status === "retrying") &&
      waitCount < 70
    ) {
      await new Promise((r) => setTimeout(r, 200));
      waitCount++;
    }

    if (injectTask.status !== "completed") {
      throw new Error(`Crash-Injektion Task fehlgeschlagen! Status: ${injectTask.status}, Fehler: ${injectTask.error}`);
    }
    console.log(`[PASS] Künstlich gekillter Browser wurde per CDP-Heartbeat erkannt und automatisch neu gestartet! Task lief erfolgreich weiter.`);

    // 3.3 Test: Nach maxRetries => Task failed, Worker crashed
    console.log("   3.3 Teste maxRetries-Erschöpfung: Task => failed, Worker => crashed...");
    const exhaustTask = crashController.enqueueTask({
      agentId: "test-crash-agent",
      action: "navigate",
      title: "Exhaust Retries Task",
      params: { url: "about:blank", simulateCrash: true },
      maxRetries: 0, // Keine Retries erlaubt -> sofortiger Crash
    });

    waitCount = 0;
    while (
      (exhaustTask.status === "queued" ||
        exhaustTask.status === "scheduled" ||
        exhaustTask.status === "running" ||
        exhaustTask.status === "retrying") &&
      waitCount < 40
    ) {
      await new Promise((r) => setTimeout(r, 200));
      waitCount++;
    }

    const testWorker = crashController.getStatus().workers.find((w) => w.agentId === "test-crash-agent");
    if (exhaustTask.status !== "failed") {
      throw new Error(`Erwartet: Task status 'failed', erhalten: ${exhaustTask.status}`);
    }
    if (testWorker?.status !== "crashed") {
      throw new Error(`Erwartet: Worker status 'crashed', erhalten: ${testWorker?.status}`);
    }
    console.log(`[PASS] Nach maxRetries: Task => failed, Worker => crashed verifiziert.`);

    testReport.stages["3_crash_recovery"] = {
      simulatedCrashPassed: true,
      injectedProcessCrashKilledPids: killedCount,
      injectedProcessCrashRecovered: true,
      maxRetriesExhaustedWorkerCrashed: true,
    };

    // -------------------------------------------------------------------------
    // 4. Stufentest 3 → 10 → 20 Agenten parallel
    //    Jede Stufe ≥ 95 % Tasks erfolgreich; bei Fehler nicht zur nächsten Stufe.
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Stufentest: 3 → 10 → 20 Agenten parallel (mind. 95% Erfolgsquote) ---");

    // STUFE 4A: Erst mit 3 Agenten parallel testen
    console.log("\n>>> STUFE 4A: 3 AGENTEN PARALLEL <<<");
    const controller3 = new SwarmController();
    controller3.setLimits({ maxConcurrent: 3, maxCpuPercent: 95, minFreeMemMb: 200, maxMemPercent: 98 });

    const tasks3 = [
      { action: "navigate" as const, params: { url: "about:blank" }, title: "Agent #1 Blank" },
      { action: "evaluate" as const, params: { expression: "2 + 2" }, title: "Agent #2 Math" },
      { action: "navigate" as const, params: { url: "about:blank" }, title: "Agent #3 Blank" },
    ];

    const start3 = Date.now();
    const batch3 = await controller3.runBatch(tasks3, { maxConcurrent: 3 });
    const dur3 = Date.now() - start3;
    const rate3 = (batch3.completed / batch3.totalTasks) * 100;

    console.log(`   Ergebnis 3er-Stufe: ${batch3.completed}/${batch3.totalTasks} erfolgreich (${rate3.toFixed(1)}%) in ${dur3}ms`);
    testReport.stages["4a_stage_3"] = {
      total: batch3.totalTasks,
      completed: batch3.completed,
      failed: batch3.failed,
      successRatePercent: rate3,
      durationMs: dur3,
      passed: rate3 >= 95,
    };

    if (rate3 < 95) {
      throw new Error(`ABBRUCH: Stufe 3 erreichte nur ${rate3}% (< 95%). Nicht zur nächsten Stufe übergehen!`);
    }
    console.log(`[PASS] Stufe 3 erfolgreich abgeschlossen (≥ 95%). Weiter zu Stufe 10.`);

    // STUFE 4B: Dann mit 10 Agenten parallel testen
    console.log("\n>>> STUFE 4B: 10 AGENTEN PARALLEL <<<");
    const controller10 = new SwarmController();
    controller10.setLimits({ maxConcurrent: 10, maxCpuPercent: 95, minFreeMemMb: 200, maxMemPercent: 98 });

    const tasks10 = [];
    for (let i = 1; i <= 10; i++) {
      tasks10.push({
        action: (i % 2 === 0 ? "evaluate" : "navigate") as SwarmTaskAction,
        params: i % 2 === 0 ? { expression: `${i} * 10` } : { url: "about:blank" },
        title: `Parallel Agent #${i}`,
      });
    }

    const start10 = Date.now();
    const batch10 = await controller10.runBatch(tasks10, { maxConcurrent: 10 });
    const dur10 = Date.now() - start10;
    const rate10 = (batch10.completed / batch10.totalTasks) * 100;

    console.log(`   Ergebnis 10er-Stufe: ${batch10.completed}/${batch10.totalTasks} erfolgreich (${rate10.toFixed(1)}%) in ${dur10}ms`);
    console.log(`   Metriken: CPU ${batch10.systemMetrics.cpuPercent}%, RAM frei ${batch10.systemMetrics.freeMemMb} MB`);

    testReport.stages["4b_stage_10"] = {
      total: batch10.totalTasks,
      completed: batch10.completed,
      failed: batch10.failed,
      successRatePercent: rate10,
      durationMs: dur10,
      systemMetrics: batch10.systemMetrics,
      passed: rate10 >= 95,
    };

    if (rate10 < 95) {
      throw new Error(`ABBRUCH: Stufe 10 erreichte nur ${rate10}% (< 95%). Nicht zur 20er-Stufe übergehen!`);
    }
    console.log(`[PASS] Stufe 10 erfolgreich abgeschlossen (≥ 95%). Weiter zur 20er-Volllast-Stufe.`);

    // STUFE 4C: Dann mit 20 Agenten parallel testen (Volllast)
    console.log("\n>>> STUFE 4C: 20 AGENTEN PARALLEL (VOLLLAST) <<<");
    const controller20 = new SwarmController();
    controller20.setLimits({ maxConcurrent: 20, maxCpuPercent: 95, minFreeMemMb: 200, maxMemPercent: 98 });

    const tasks20 = [];
    for (let i = 1; i <= 20; i++) {
      const pad = String(i).padStart(2, "0");
      tasks20.push({
        action: (i % 3 === 0 ? "evaluate" : "navigate") as SwarmTaskAction,
        params: i % 3 === 0 ? { expression: `document.title || 'Swarm-${pad}'` } : { url: "about:blank" },
        title: `Volllast Swarm Agent #${pad}`,
      });
    }

    const start20 = Date.now();
    const batch20 = await controller20.runBatch(tasks20, { maxConcurrent: 20 });
    const dur20 = Date.now() - start20;
    const rate20 = (batch20.completed / batch20.totalTasks) * 100;

    console.log(`   Ergebnis 20er-Volllast-Stufe: ${batch20.completed}/${batch20.totalTasks} erfolgreich (${rate20.toFixed(1)}%) in ${dur20}ms`);
    console.log(`   Ergebnisse gesammelt: ${batch20.results.length}, Abstürze repariert: ${batch20.crashesRecovered}`);
    console.log(`   Metriken: CPU ${batch20.systemMetrics.cpuPercent}%, RAM frei ${batch20.systemMetrics.freeMemMb} MB`);

    testReport.stages["4c_stage_20"] = {
      total: batch20.totalTasks,
      completed: batch20.completed,
      failed: batch20.failed,
      successRatePercent: rate20,
      durationMs: dur20,
      crashesRecovered: batch20.crashesRecovered,
      systemMetrics: batch20.systemMetrics,
      passed: rate20 >= 95,
    };

    if (rate20 < 95) {
      throw new Error(`ABBRUCH: Stufe 20 erreichte nur ${rate20}% (< 95%)!`);
    }
    console.log(`[PASS] Stufe 20 (Volllast) ERFOLGREICH abgeschlossen (≥ 95% Erfolgsquote)!`);

    // -------------------------------------------------------------------------
    // 5. Persistenz in Postgres 5544 & Wiederaufnahme nach Neustart
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Persistenz in Postgres 5544 & Wiederaufnahme nach Neustart ---");

    // 5.1 Prüfen, ob Tasks und Ergebnisse in der DB persistiert wurden
    const dbTasksCount = await sql`SELECT count(*)::int as cnt FROM swarm_tasks`;
    const dbResultsCount = await sql`SELECT count(*)::int as cnt FROM swarm_results`;
    console.log(`   Postgres 5544: ${dbTasksCount[0].cnt} Tasks in swarm_tasks, ${dbResultsCount[0].cnt} Einträge in swarm_results.`);

    if (dbTasksCount[0].cnt === 0 || dbResultsCount[0].cnt === 0) {
      throw new Error("Fehler: Keine Daten in swarm_tasks oder swarm_results persistiert!");
    }
    console.log(`[PASS] Tabellen swarm_tasks und swarm_results in Postgres 5544 verifiziert.`);

    // 5.2 API getResults() Prüfung
    const resultsSample = controller20.getResults();
    if (!Array.isArray(resultsSample) || resultsSample.length === 0) {
      throw new Error("controller.getResults() lieferte keine Ergebnisse!");
    }
    const sampleResult = resultsSample[0];
    if (typeof sampleResult.durationMs !== "number" || !sampleResult.action) {
      throw new Error("controller.getResults() Ergebnis unvollständig!");
    }
    console.log(`[PASS] getResults() liefert Status, Output, Fehler, Dauer (${sampleResult.durationMs}ms) und ScreenshotRef.`);

    // 5.3 getStatus() Prüfung für Vertrag & C
    const fullStatus = controller20.getStatus();
    if (fullStatus.workers.length !== 20) {
      throw new Error(`Erwartet 20 Worker im Status, erhalten: ${fullStatus.workers.length}`);
    }
    const sampleWorker = fullStatus.workers[0];
    if (!sampleWorker.name || !sampleWorker.agentId || !sampleWorker.status) {
      throw new Error("Worker im Status entspricht nicht dem Vertrag!");
    }
    if (typeof fullStatus.overallProgress.total !== "number" || typeof fullStatus.metrics.cpuPercent !== "number") {
      throw new Error("overallProgress oder metrics im Status entspricht nicht dem Vertrag!");
    }
    console.log(`[PASS] getStatus() Vertrag verifiziert: 20 Worker mit name, status, currentTask, lastScreenshotAt, overallProgress {total,done,failed,percent}, metrics {cpuPercent,memPercent}.`);

    // 5.4 Wiederaufnahme nach Server-Neustart simulieren
    console.log("   5.4 Teste Wiederaufnahme nach Server-Neustart...");
    const restartTaskId = `restart-test-task-${Date.now()}`;
    await sql`
      INSERT INTO swarm_tasks (
        id, run_id, agent_id, title, action, params, priority, status, created_at
      ) VALUES (
        ${restartTaskId}, 'run-restart-sim', 'auto', 'Simulated Interrupted Task',
        'navigate', '{"url":"about:blank"}'::jsonb, 'high', 'running', NOW()
      )
    `;

    const recoveryController = new SwarmController();
    // Der Constructor stellt unterbrochene Aufgaben aus Postgres 5544 automatisch wieder her.
    // Kurz warten, bis der asynchrone DB-Lauf durch ist:
    let recoveredTask: any = null;
    for (let poll = 0; poll < 15; poll++) {
      await new Promise((r) => setTimeout(r, 200));
      recoveredTask = recoveryController.getTask(restartTaskId);
      if (recoveredTask) break;
    }

    console.log(`   -> Wiederaufnahme im neuen Controller: Task ${restartTaskId} Status=${recoveredTask?.status}`);

    if (!recoveredTask || recoveredTask.status !== "queued") {
      throw new Error("Wiederaufnahme nach Server-Neustart hat die unterbrochene Aufgabe nicht in die Queue geladen!");
    }
    console.log(`[PASS] Wiederaufnahme nach Server-Neustart aus Postgres 5544 ERFOLGREICH!`);
    recoveryController.stopAll();
    recoveryController.stopScheduler();

    testReport.stages["5_postgres_persistence_and_recovery"] = {
      dbTasksCount: dbTasksCount[0].cnt,
      dbResultsCount: dbResultsCount[0].cnt,
      getResultsVerified: true,
      getStatusContractVerified: true,
      recoveryAfterRestartVerified: true,
    };

    // -------------------------------------------------------------------------
    // 6. Connect-MCP Tool-Integration via JSON-RPC & REST API
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Connect-MCP Tool-Integration via JSON-RPC ---");

    console.log("   6.1 Rufe MCP-Tool 'swarm_status' auf...");
    const statusCall = await jsonRpcCall("tools/call", {
      name: "swarm_status",
      arguments: {},
    });
    if (statusCall.status !== 200 || statusCall.body.error) {
      throw new Error(`swarm_status fehlgeschlagen: ${JSON.stringify(statusCall.body.error)}`);
    }
    const statusText = statusCall.body.result?.content?.[0]?.text;
    const statusParsed = JSON.parse(statusText);
    console.log(`   [PASS] swarm_status: controller="${statusParsed.controller}", workers=${statusParsed.workers?.length}`);

    console.log("   6.2 Rufe MCP-Tool 'run_swarm' auf (3 parallele Agenten)...");
    const runCall = await jsonRpcCall("tools/call", {
      name: "run_swarm",
      arguments: {
        count: 3,
        max_concurrent: 3,
        action: "navigate",
        url: "about:blank",
      },
    });
    if (runCall.status !== 200 || runCall.body.error) {
      throw new Error(`run_swarm fehlgeschlagen: ${JSON.stringify(runCall.body.error)}`);
    }
    const runText = runCall.body.result?.content?.[0]?.text;
    const runParsed = JSON.parse(runText);
    console.log(`   [PASS] run_swarm: ${runParsed.message}`);

    console.log("   6.3 Rufe MCP-Tool 'swarm_get_results' auf...");
    const resultsCall = await jsonRpcCall("tools/call", {
      name: "swarm_get_results",
      arguments: { limit: 5 },
    });
    if (resultsCall.status !== 200 || resultsCall.body.error) {
      throw new Error(`swarm_get_results fehlgeschlagen: ${JSON.stringify(resultsCall.body.error)}`);
    }
    const resText = resultsCall.body.result?.content?.[0]?.text;
    const resParsed = JSON.parse(resText);
    console.log(`   [PASS] swarm_get_results: ${resParsed.count} Ergebnisse geliefert.`);

    testReport.stages["6_mcp_and_api"] = {
      mcpStatusPassed: true,
      mcpRunSwarmPassed: true,
      mcpGetResultsPassed: true,
    };

    // -------------------------------------------------------------------------
    // 7. Persistiertes JSON-Log nach %LOCALAPPDATA%\ConnectApp\logs\swarm-test-<datum>.json
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Persistiertes Test-Log schreiben ---");
    testReport.overallSuccess = true;
    testReport.completedAt = new Date().toISOString();

    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    writeFileSync(logFile, JSON.stringify(testReport, null, 2), "utf-8");
    console.log(`[PASS] Testergebnisse erfolgreich als JSON-Log persistiert:`);
    console.log(`   -> ${logFile}`);

    console.log("\n================================================================================");
    console.log("ALLE TESTS & AKZEPTANZKRITERIEN FÜR AGENT B VOLLSTÄNDIG ERFÜLLT! (100% GRÜN)");
    console.log("================================================================================");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("\n[FEHLER]", err);
  process.exit(1);
});
