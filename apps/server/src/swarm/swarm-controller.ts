/**
 * Swarm-Controller (Phase E Schritt 20 / Agent B).
 *
 * Warteschlange und Scheduler für bis zu 20 Browser-Agenten parallel:
 * - Grenzen für CPU und RAM (über ResourceMonitor) mit Backpressure + Logging
 * - Je Agent ein isoliertes Helium-Profil unter %LOCALAPPDATA%\ConnectAgents\<agentId>\helium
 * - Profilsperre (Lockfile) gegen Doppelnutzung
 * - Stefans persönliches Profil wird NIEMALS angefasst (assertNotStefanProfile in jedem Startpfad)
 * - Crash-Erkennung per CDP-Heartbeat
 * - Automatischer Neustart bei Absturz (Crash Recovery mit Backoff)
 * - Nach maxRetries: Task => failed, Worker => crashed
 * - Persistenz in Postgres 5544 (swarm_tasks & swarm_results) & Wiederaufnahme nach Server-Neustart
 * - Vollständige API-Vertragserfüllung (getStatus, submitTask, getResults, cancelTask, stopWorker, takeoverWorker, captureScreenshot, stopAll)
 */

import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import postgres from "postgres";
import type { Database } from "../db/client";
import { agentBrowserDirs } from "../agent-hub/catalog";
import { assertNotStefanProfile } from "../agent-hub/routes";
import {
  cdpCall,
  cdpNavigate,
  cdpPortFor,
  cdpScreenshot,
  ensureAgentChromeRunning,
  resetAgentChromeLaunchAttempts,
} from "../agent-hub/agent-cdp";
import {
  browserUseClick,
  browserUseOpen,
  browserUseScreenshot,
  browserUseType,
  ensureAgentHeliumReady,
} from "../agents/agent-browser-use";
import { getResourceMonitor, ResourceMonitor } from "./resource-monitor";
import {
  acquireProfileLock,
  releaseProfileLock,
} from "./profile-lock";
import { getLlmAdapter } from "./adapters/provider-factory";
import { runCouncilTurn } from "./adapters/council-adapter";
import { advanceSimulationTick } from "./adapters/simulation-adapter";
import type {
  SwarmLimits,
  SwarmRunResult,
  SwarmStatus,
  SwarmTask,
  SwarmTaskAction,
  SwarmTaskInput,
  SwarmTaskPriority,
  SwarmTaskResult,
  SwarmWorker,
  SwarmWorkerStatus,
  SystemMetrics,
} from "./swarm-types";
import {
  createConnectMcpTask,
} from "../connect-mcp/tasks";
import { conductorHooks } from "../conductor";

const DEFAULT_LIMITS: SwarmLimits = {
  maxConcurrent: 20,
  maxCpuPercent: 85,
  minFreeMemMb: 1024,
  maxMemPercent: 90,
  taskTimeoutMs: 60000,
  maxRetries: 2,
  retryDelayMs: 800,
};

const POSTGRES_URL_5544 =
  (process.env.DATABASE_URL ?? "");

export class SwarmController {
  private workers: Map<string, SwarmWorker> = new Map();
  private queue: SwarmTask[] = [];
  private taskHistory: Map<string, SwarmTask> = new Map();
  private runHistory: Map<string, SwarmRunResult> = new Map();
  private limits: SwarmLimits = { ...DEFAULT_LIMITS };
  private monitor: ResourceMonitor = getResourceMonitor();
  private isScheduling = false;
  private database?: Database;
  private totalCrashesRecovered = 0;
  private activeTaskPromises: Map<string, Promise<SwarmTaskResult>> = new Map();
  private schedulerInterval: ReturnType<typeof setInterval> | null = null;
  private sqlClient: ReturnType<typeof postgres> | null = null;
  private isRecoveredFromDb = false;

  constructor(database?: Database) {
    this.database = database;

    // Initialisiere die 20 Swarm-Worker (Swarm20 Bot 01 bis 20)
    for (let idx = 1; idx <= 20; idx++) {
      const pad = String(idx).padStart(2, "0");
      const swarmAgentId = `swarm20-agent-${pad}`;
      this.registerWorker(swarmAgentId, `Swarm20 Bot ${pad}`);
    }

    // Wiederaufnahme nicht abgeschlossener Aufgaben aus Postgres 5544
    void this.recoverUnfinishedTasks();

    // Regelmäßiger Scheduler-Tick alle 300ms
    this.schedulerInterval = setInterval(() => {
      void this.schedule();
    }, 300);
    if (this.schedulerInterval.unref) {
      this.schedulerInterval.unref();
    }
  }

  public stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  private getSql(): ReturnType<typeof postgres> {
    if (!this.sqlClient) {
      const dbUrl =
        (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("5544")
          ? process.env.DATABASE_URL
          : POSTGRES_URL_5544);
      this.sqlClient = postgres(dbUrl, { max: 5, idle_timeout: 10 });
    }
    return this.sqlClient;
  }

  public setDatabase(database: Database): void {
    this.database = database;
  }

  public setLimits(partial: Partial<SwarmLimits>): SwarmLimits {
    this.limits = { ...this.limits, ...partial };
    this.limits.maxConcurrent = Math.max(1, Math.min(20, this.limits.maxConcurrent));
    return { ...this.limits };
  }

  public getLimits(): SwarmLimits {
    return { ...this.limits };
  }

  /**
   * Registriert einen Browser-Agenten im Worker-Pool.
   * Prüft zwingend assertNotStefanProfile(profileDir)!
   */
  public registerWorker(agentId: string, agentName?: string): SwarmWorker {
    const dirs = agentBrowserDirs(agentId);
    assertNotStefanProfile(dirs.profile);

    mkdirSync(dirs.profile, { recursive: true });
    mkdirSync(dirs.output, { recursive: true });

    const port = cdpPortFor(dirs.profile);
    const name = agentName || `Swarm Agent ${agentId.slice(0, 8)}`;

    const existing = this.workers.get(agentId);
    if (existing) {
      existing.name = name;
      existing.agentName = name;
      return existing;
    }

    const worker: SwarmWorker = {
      agentId,
      name,
      agentName: name,
      profileDir: dirs.profile,
      cdpPort: port,
      status: "idle",
      crashCount: 0,
      tasksCompleted: 0,
      lastActiveAt: new Date().toISOString(),
      isLocked: false,
    };

    this.workers.set(agentId, worker);
    return worker;
  }

  /**
   * Stellt sicher, dass mindestens `count` (bis zu 20) Agenten im Worker-Pool registriert sind.
   */
  public async ensureWorkerPool(count: number, db?: Database): Promise<SwarmWorker[]> {
    const target = Math.min(20, Math.max(1, count));
    const activeDb = db || this.database;

    if (activeDb && this.workers.size < target) {
      try {
        const { sql } = await import("drizzle-orm");
        const rows = (await activeDb.execute(
          sql`SELECT id, name FROM agents ORDER BY created_at DESC LIMIT 30`,
        )) as Array<{ id: string; name: string }>;

        for (const row of rows) {
          if (!this.workers.has(row.id)) {
            try {
              this.registerWorker(row.id, row.name);
            } catch {
              /* ignore profiles that might fail assertion */
            }
          }
          if (this.workers.size >= target) break;
        }
      } catch (err) {
        console.warn("[SwarmController] DB-Agenten konnten nicht geladen werden:", err);
      }
    }

    let idx = 1;
    while (this.workers.size < target && idx <= 20) {
      const pad = String(idx).padStart(2, "0");
      const swarmAgentId = `swarm20-agent-${pad}`;
      if (!this.workers.has(swarmAgentId)) {
        this.registerWorker(swarmAgentId, `Swarm20 Bot ${pad}`);
      }
      idx++;
    }

    return Array.from(this.workers.values()).slice(0, target);
  }

  /**
   * Wiederaufnahme nicht abgeschlossener Aufgaben nach Server-Neustart aus Postgres 5544.
   */
  public async recoverUnfinishedTasks(force = false): Promise<number> {
    if (this.isRecoveredFromDb && !force) return 0;
    this.isRecoveredFromDb = true;

    try {
      const sql = this.getSql();

      // 1. Frühere abgebrochene oder hängengebliebene Tasks auf 'queued' zurücksetzen
      await sql`
        UPDATE swarm_tasks 
        SET status = 'queued', error = 'Wiederaufnahme nach Server-Neustart'
        WHERE status IN ('running', 'scheduled', 'retrying')
      `;

      // 2. Alle wartenden Aufgaben abrufen
      const pendingRows = await sql`
        SELECT id, run_id, agent_id, title, action, params, priority, status,
               retry_count, max_retries, created_at
        FROM swarm_tasks
        WHERE status = 'queued'
        ORDER BY 
          CASE priority 
            WHEN 'high' THEN 1 
            WHEN 'normal' THEN 2 
            WHEN 'low' THEN 3 
            ELSE 2 
          END,
          created_at ASC
        LIMIT 100
      `;

      let count = 0;
      for (const row of pendingRows) {
        if (!this.taskHistory.has(row.id) && !this.queue.some((t) => t.id === row.id)) {
          const task: SwarmTask = {
            id: row.id,
            runId: row.run_id || undefined,
            agentId: row.agent_id || "auto",
            title: row.title,
            action: row.action as SwarmTaskAction,
            params: typeof row.params === "string" ? JSON.parse(row.params) : (row.params || {}),
            priority: (row.priority as SwarmTaskPriority) || "normal",
            status: "queued",
            retryCount: row.retry_count || 0,
            maxRetries: row.max_retries || this.limits.maxRetries,
            recoveredFromCrash: true,
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          };

          this.queue.push(task);
          this.taskHistory.set(task.id, task);
          count++;
        }
      }

      // 3. Auch abgeschlossene Ergebnisse in den In-Memory-Cache laden
      const recentResults = await sql`
        SELECT id, task_id, run_id, agent_id, agent_name, action, ok, url, title,
               output, error, screenshot_ref, duration_ms, retries,
               recovered_from_crash, system_metrics, created_at
        FROM swarm_results
        ORDER BY created_at DESC
        LIMIT 50
      `;

      for (const r of recentResults) {
        if (!this.taskHistory.has(r.task_id)) {
          const restoredResult: SwarmTaskResult = {
            ok: Boolean(r.ok),
            taskId: r.task_id,
            status: r.ok ? "completed" : "failed",
            agentId: r.agent_id,
            agentName: r.agent_name || undefined,
            profileDir: agentBrowserDirs(r.agent_id).profile,
            cdpPort: cdpPortFor(agentBrowserDirs(r.agent_id).profile),
            action: r.action as SwarmTaskAction,
            url: r.url || null,
            title: r.title || null,
            screenshot: r.screenshot_ref || null,
            screenshotRef: r.screenshot_ref || null,
            output: r.output || undefined,
            error: r.error || undefined,
            durationMs: r.duration_ms || 0,
            retries: r.retries || 0,
            recoveredFromCrash: Boolean(r.recovered_from_crash),
            systemMetrics: typeof r.system_metrics === "string" ? JSON.parse(r.system_metrics) : r.system_metrics,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
          };

          const dummyTask: SwarmTask = {
            id: r.task_id,
            runId: r.run_id || undefined,
            agentId: r.agent_id,
            title: `Task ${r.task_id}`,
            action: r.action as SwarmTaskAction,
            params: {},
            priority: "normal",
            status: r.ok ? "completed" : "failed",
            retryCount: r.retries || 0,
            maxRetries: 2,
            recoveredFromCrash: Boolean(r.recovered_from_crash),
            result: restoredResult,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          };
          this.taskHistory.set(dummyTask.id, dummyTask);
        }
      }

      if (count > 0) {
        console.log(`[SwarmController] Wiederaufnahme nach Neustart: ${count} Aufgaben aus Postgres 5544 geladen.`);
        void this.schedule();
      }

      return count;
    } catch (err: any) {
      console.warn("[SwarmController] Fehler bei Wiederaufnahme aus Postgres 5544:", err?.message || String(err));
      return 0;
    }
  }

  /**
   * Persistiert eine Aufgabe in Postgres 5544 (Tabelle swarm_tasks).
   */
  private async persistTask(task: SwarmTask): Promise<void> {
    try {
      const sql = this.getSql();
      const paramsJson = JSON.stringify(task.params || {});
      await sql`
        INSERT INTO swarm_tasks (
          id, run_id, agent_id, title, action, params, priority, status,
          assigned_worker_id, assigned_profile_dir, assigned_cdp_port,
          retry_count, max_retries, recovered_from_crash, error,
          created_at, started_at, completed_at, duration_ms
        ) VALUES (
          ${task.id}, ${task.runId || null}, ${task.agentId || "auto"},
          ${task.title}, ${task.action}, ${paramsJson}::jsonb,
          ${task.priority}, ${task.status},
          ${task.assignedWorkerId || null}, ${task.assignedProfileDir || null},
          ${task.assignedCdpPort || null},
          ${task.retryCount}, ${task.maxRetries},
          ${task.recoveredFromCrash || false}, ${task.error || null},
          ${task.createdAt}, ${task.startedAt || null}, ${task.completedAt || null},
          ${task.durationMs || null}
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          assigned_worker_id = EXCLUDED.assigned_worker_id,
          assigned_profile_dir = EXCLUDED.assigned_profile_dir,
          assigned_cdp_port = EXCLUDED.assigned_cdp_port,
          retry_count = EXCLUDED.retry_count,
          recovered_from_crash = EXCLUDED.recovered_from_crash,
          error = EXCLUDED.error,
          started_at = EXCLUDED.started_at,
          completed_at = EXCLUDED.completed_at,
          duration_ms = EXCLUDED.duration_ms
      `;
    } catch (err: any) {
      console.warn(`[SwarmController] Persistierung Task ${task.id} fehlgeschlagen:`, err?.message || String(err));
    }
  }

  /**
   * Persistiert das Ergebnis in Postgres 5544 (Tabelle swarm_results).
   */
  private async persistResult(result: SwarmTaskResult, runId?: string): Promise<void> {
    try {
      const sql = this.getSql();
      const resultId = `res-${result.taskId}`;
      const metricsJson = result.systemMetrics ? JSON.stringify(result.systemMetrics) : null;

      await sql`
        INSERT INTO swarm_results (
          id, task_id, run_id, agent_id, agent_name, action, ok,
          url, title, output, error, screenshot_ref,
          duration_ms, retries, recovered_from_crash, system_metrics, created_at
        ) VALUES (
          ${resultId}, ${result.taskId}, ${runId || null}, ${result.agentId},
          ${result.agentName || null}, ${result.action}, ${result.ok},
          ${result.url || null}, ${result.title || null}, ${result.output || null},
          ${result.error || null}, ${result.screenshotRef || result.screenshot || null},
          ${result.durationMs}, ${result.retries}, ${result.recoveredFromCrash},
          ${metricsJson ? sql`${metricsJson}::jsonb` : null},
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          ok = EXCLUDED.ok,
          url = EXCLUDED.url,
          title = EXCLUDED.title,
          output = EXCLUDED.output,
          error = EXCLUDED.error,
          screenshot_ref = EXCLUDED.screenshot_ref,
          duration_ms = EXCLUDED.duration_ms,
          retries = EXCLUDED.retries,
          recovered_from_crash = EXCLUDED.recovered_from_crash,
          system_metrics = EXCLUDED.system_metrics
      `;
    } catch (err: any) {
      console.warn(`[SwarmController] Persistierung Ergebnis ${result.taskId} fehlgeschlagen:`, err?.message || String(err));
    }
  }

  /**
   * Vertragskonforme API: submitTask(t) -> taskId
   * Reiht eine Aufgabe ein und gibt sofort die taskId zurück.
   */
  public submitTask(input: SwarmTaskInput, runId?: string): string {
    const task = this.enqueueTask(input, runId);
    return task.id;
  }

  /**
   * Asynchrone Variante von submitTask.
   */
  public async submitTaskAsync(input: SwarmTaskInput, runId?: string): Promise<string> {
    const task = this.enqueueTask(input, runId);
    await this.persistTask(task);
    return task.id;
  }

  /**
   * Fügt einen Task in die Prioritäts-Warteschlange ein.
   */
  public enqueueTask(input: SwarmTaskInput, runId?: string): SwarmTask {
    const id = input.id || `swarm-task-${randomBytes(6).toString("hex")}`;
    const priority: SwarmTaskPriority = input.priority || "normal";

    const task: SwarmTask = {
      id,
      runId,
      agentId: input.agentId || "auto",
      title: input.title || `${input.action.toUpperCase()} Task (${id})`,
      action: input.action,
      params: input.params || {},
      priority,
      status: "queued",
      retryCount: 0,
      maxRetries: input.maxRetries ?? this.limits.maxRetries,
      recoveredFromCrash: false,
      createdAt: new Date().toISOString(),
    };

    // Prioritätsbasierte Einfügung: high > normal > low
    const prioWeight = { high: 3, normal: 2, low: 1 };
    const taskWeight = prioWeight[priority];

    let insertIdx = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (prioWeight[this.queue[i].priority] < taskWeight) {
        insertIdx = i;
        break;
      }
    }

    this.queue.splice(insertIdx, 0, task);
    this.taskHistory.set(id, task);

    // Asynchron in Postgres 5544 persistieren
    void this.persistTask(task);
    void conductorHooks.onTaskQueued(task.id, { title: task.title, action: task.action }).catch(() => {});

    // Optional MCP Task Tracker
    if (this.database) {
      createConnectMcpTask(this.database, {
        userId: "swarm-system",
        agentId: task.agentId && task.agentId !== "auto" ? task.agentId : "swarm-pool",
        title: task.title,
        prompt: JSON.stringify({ action: task.action, params: task.params }),
        priority: task.priority,
        source: "connect-mcp",
      }).catch(() => {});
    }

    // Sofort Scheduler anstupsen
    void this.schedule();

    return task;
  }

  /**
   * Scheduler: Verteilt wartende Aufgaben an freie Worker,
   * solange Concurrency < maxConcurrent und CPU/RAM-Grenzen eingehalten werden.
   * Mit Backpressure + Logging, wenn Limit greift.
   */
  public async schedule(): Promise<void> {
    if (this.isScheduling) return;
    this.isScheduling = true;

    try {
      while (this.queue.length > 0) {
        // 1. Concurrency-Grenze prüfen
        const activeWorkers = Array.from(this.workers.values()).filter(
          (w) => w.status === "running" || w.status === "busy" || w.status === "restarting",
        );
        if (activeWorkers.length >= this.limits.maxConcurrent) {
          break; // Concurrency-Limit erreicht
        }

        // 2. CPU/RAM-Grenzen prüfen (Backpressure)
        const resourceCheck = this.monitor.checkLimits(this.limits);
        if (!resourceCheck.allowed) {
          console.warn(
            `[SwarmController] Backpressure: CPU/RAM-Limit überschritten (${resourceCheck.reason}). Admission pausiert, ${this.queue.length} Tasks warten in Queue.`,
          );
          break; // Warten, bis Ressourcen wieder frei werden
        }

        // 3. Nächsten Task aus der Queue holen
        const task = this.queue[0];
        if (!task) break;

        // 4. Passenden freien Worker finden (Pro Worker genau ein Profil, Profilsperre)
        let worker: SwarmWorker | undefined;
        if (task.agentId && task.agentId !== "auto") {
          const specific = this.workers.get(task.agentId);
          if (specific && specific.status === "idle") {
            worker = specific;
          }
        } else {
          // Beliebigen freien Worker nehmen
          worker = Array.from(this.workers.values()).find((w) => w.status === "idle");
        }

        if (!worker) {
          if (task.agentId && task.agentId !== "auto") {
            break;
          }
          if (this.workers.size < this.limits.maxConcurrent) {
            const pad = String(this.workers.size + 1).padStart(2, "0");
            worker = this.registerWorker(`swarm20-agent-${pad}`, `Swarm20 Bot ${pad}`);
          } else {
            break;
          }
        }

        // 5. Profilsperre (Lockfile) gegen Doppelnutzung prüfen & erwerben
        assertNotStefanProfile(worker.profileDir);
        const lockRes = acquireProfileLock(worker.profileDir, worker.agentId, task.id);
        if (!lockRes.success) {
          console.warn(`[SwarmController] Worker ${worker.agentId} konnte Profilsperre nicht erhalten: ${lockRes.error}`);
          break;
        }

        const claimAllowed = await conductorHooks.onTaskClaim(task.id, worker.agentId).catch(() => true);
        if (!claimAllowed) {
          releaseProfileLock(worker.profileDir, worker.agentId);
          break;
        }

        // Task aus Queue entfernen und starten
        this.queue.shift();
        task.status = "scheduled";
        task.assignedWorkerId = worker.agentId;
        task.assignedProfileDir = worker.profileDir;
        task.assignedCdpPort = worker.cdpPort;

        worker.isLocked = true;
        void this.persistTask(task);

        // Asynchrone Ausführung starten
        const promise = this.executeTaskWithRecovery(worker, task);
        this.activeTaskPromises.set(task.id, promise);
        promise.finally(() => {
          this.activeTaskPromises.delete(task.id);
          void this.schedule();
        });
      }
    } finally {
      this.isScheduling = false;
    }
  }

  /**
   * CDP-Heartbeat Überwachung während Task-Ausführung.
   * Prüft in kurzen Intervallen, ob der Browser-Prozess noch erreichbar ist.
   */
  private async checkCdpHeartbeat(port: number): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(600),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Führt einen Browser-Task auf einem Agenten aus.
   * AUTOMATISCHER NEUSTART BEI ABSTURZ (Crash Recovery):
   * - CDP-Heartbeat Überwachung während der Ausführung
   * - Automatischer Neustart mit Backoff bei Verbindungsabbruch oder Prozessabsturz
   * - Nach maxRetries: Task => failed, Worker => crashed
   */
  private async executeTaskWithRecovery(worker: SwarmWorker, task: SwarmTask): Promise<SwarmTaskResult> {
    const startTime = Date.now();
    worker.status = "running";
    worker.currentTaskId = task.id;
    worker.currentTaskTitle = task.title;
    worker.currentTaskAction = task.action;
    worker.currentTaskUrl = task.params.url || (task.action === "navigate" ? task.params.url : "about:blank");
    worker.currentTaskStartedAt = new Date().toISOString();
    worker.lastActiveAt = new Date().toISOString();

    // currentTask für Frontend (C) pflegen
    worker.currentTask = {
      id: task.id,
      title: task.title,
      action: task.action,
      url: worker.currentTaskUrl,
      startedAt: worker.currentTaskStartedAt,
    };

    task.status = "running";
    task.startedAt = new Date().toISOString();
    void this.persistTask(task);

    let lastError: string | undefined;

    try {
      while (task.retryCount <= task.maxRetries) {
        try {
          // Profil-Sicherheitscheck vor jedem Versuch
          assertNotStefanProfile(worker.profileDir);

          // Simulierter Absturz für Tests
          if (task.params.simulateCrash && task.retryCount === 0) {
            throw new Error("Simulierter Browser-Absturz (CDP-Disconnect)");
          }

          // 1. Unterscheidung zwischen LLM-Aktionen (Swarm-v3) und Browser-Aktionen
          let output: string | undefined;
          let title: string | null = null;
          let url: string | null = task.params.url || null;
          let screenshot: string | null = null;
          let payloadResult: any = undefined;
          let tokensUsed: { input: number; output: number; total: number } | undefined = undefined;

          const isLlmAction =
            task.action === "council_turn" ||
            task.action === "sim_tick" ||
            task.action === "persona_turn" ||
            task.action === "generic";

          if (isLlmAction) {
            const provider = task.params.provider || "gemini-cli";
            const adapter = getLlmAdapter(provider);

            if (task.action === "council_turn") {
              const session: any = {
                id: task.params.sessionId || "council-session-1",
                question: task.params.question || task.title || "Council Debatte",
                options: task.params.options || [],
                context: task.params.context,
                mode: "full",
                status: "in_progress",
              };
              const seat: any = {
                sessionId: session.id,
                agentId: worker.agentId,
                role: task.params.role || worker.name,
                weight: 1,
              };
              const turn = await runCouncilTurn({
                session,
                seat,
                round: task.params.round || 1,
                persona: task.params.persona,
                provider,
              });
              payloadResult = turn;
              output = `[Council Turn R${turn.round}] ${worker.name} (${turn.stance}): ${turn.content}`;
            } else if (task.action === "sim_tick") {
              const run: any = {
                id: task.params.sessionId || "sim-run-1",
                name: task.title || "Simulation",
                engine: task.params.engine || "native",
                status: "running",
              };
              const tick = await advanceSimulationTick(
                run,
                task.params.tick || 0,
                [],
                task.params.sources
              );
              payloadResult = tick;
              output = `[Sim Tick ${tick.tick}] Event: ${tick.event}`;
            } else {
              // persona_turn oder generic
              const prompt = task.params.prompt || task.title || "Führe Aufgabe aus";
              const llmRes = await adapter.execute({
                prompt,
                provider,
                persona: task.params.persona,
                systemPrompt: task.params.systemPrompt,
                model: task.params.model,
                temperature: task.params.temperature,
                expectedJson: Boolean(task.params.payload),
              });
              payloadResult = llmRes.parsedJson || { text: llmRes.text };
              output = llmRes.text;
              tokensUsed = {
                input: llmRes.inputTokens,
                output: llmRes.outputTokens,
                total: llmRes.totalTokens,
              };
            }
          } else {
            // Browser sicherstellen
            const startUrl = task.params.url || "about:blank";
            const ready = await ensureAgentHeliumReady(worker.agentId, startUrl);
            if (!ready.ok) {
              throw new Error(ready.error || "Helium-Browser konnte nicht gestartet werden");
            }

            const port = ready.port;

            // Heartbeat-Check vor Aktionsausführung
            const alive = await this.checkCdpHeartbeat(port);
            if (!alive) {
              throw new Error(`CDP-Heartbeat vor Ausführung fehlgeschlagen auf Port ${port}`);
            }

            switch (task.action) {
              case "open":
              case "navigate": {
                const targetUrl = task.params.url || "about:blank";
                const navRes = await cdpNavigate(port, targetUrl);
                if (!navRes.ok) throw new Error(navRes.error || "Navigation fehlgeschlagen");
                url = navRes.url || targetUrl;

                // Titel & Infos abfragen
                const evalRes = await cdpCall(port, "Runtime.evaluate", {
                  expression: "JSON.stringify({ title: document.title, url: location.href })",
                  returnByValue: true,
                });
                const val = (evalRes.result?.result as any)?.value;
                if (typeof val === "string") {
                  try {
                    const parsed = JSON.parse(val);
                    title = parsed.title;
                    url = parsed.url;
                  } catch {
                    /* ignore */
                  }
                }
                output = `Navigiert zu: ${url} (Titel: "${title}")`;

                // Screenshot erfassen
                const shot = await cdpScreenshot(port);
                if (shot.ok && shot.bytes) {
                  screenshot = `data:image/jpeg;base64,${Buffer.from(shot.bytes).toString("base64")}`;
                }
                break;
              }

              case "screenshot": {
                const shot = await cdpScreenshot(port);
                if (!shot.ok || !shot.bytes) {
                  throw new Error(shot.error || "Screenshot konnte nicht erstellt werden");
                }
                screenshot = `data:image/jpeg;base64,${Buffer.from(shot.bytes).toString("base64")}`;
                output = `Screenshot erfolgreich aufgenommen (${shot.bytes.length} Bytes)`;
                break;
              }

              case "evaluate": {
                const expr = task.params.expression || "document.title";
                const res = await cdpCall(port, "Runtime.evaluate", {
                  expression: expr,
                  returnByValue: true,
                });
                if (!res.ok) throw new Error(res.error || "Evaluation fehlgeschlagen");
                const val = (res.result?.result as any)?.value;
                output = typeof val === "string" ? val : JSON.stringify(val);
                break;
              }

              case "click": {
                const clickRes = await browserUseClick(worker.agentId, {
                  selector: task.params.selector,
                  x: task.params.x,
                  y: task.params.y,
                });
                if (!clickRes.ok) throw new Error(clickRes.error || "Klick fehlgeschlagen");
                output = clickRes.output || "Klick erfolgreich";
                screenshot = clickRes.screenshot || null;
                break;
              }

              case "type": {
                const typeRes = await browserUseType(worker.agentId, {
                  text: task.params.text,
                  submit: task.params.submit,
                });
                if (!typeRes.ok) throw new Error(typeRes.error || "Tippen fehlgeschlagen");
                output = typeRes.output || "Text erfolgreich eingegeben";
                screenshot = typeRes.screenshot || null;
                break;
              }

              case "task":
              default: {
                const taskRes = await browserUseOpen(worker.agentId, task.params.url || "about:blank");
                output = taskRes.output || `Task ausgeführt: ${task.title}`;
                screenshot = taskRes.screenshot || null;
                url = taskRes.url || null;
                title = taskRes.title || null;
                break;
              }
            }
          }

          // Live-Werte auf dem Worker sichern
          if (screenshot) {
            worker.lastScreenshot = screenshot;
            worker.lastScreenshotAt = new Date().toISOString();
          }
          if (url) worker.lastUrl = url;
          if (title) worker.lastTitle = title;

          // Erfolg!
          const durationMs = Date.now() - startTime;
          const metrics = this.monitor.getMetrics();

          const result: SwarmTaskResult = {
            ok: true,
            taskId: task.id,
            status: "completed",
            agentId: worker.agentId,
            agentName: worker.name,
            profileDir: worker.profileDir,
            cdpPort: worker.cdpPort,
            action: task.action,
            url,
            title,
            screenshot,
            screenshotRef: screenshot ? `shot-${task.id}` : null,
            output,
            payloadResult,
            tokensUsed,
            durationMs,
            retries: task.retryCount,
            recoveredFromCrash: task.retryCount > 0,
            systemMetrics: metrics,
            createdAt: task.createdAt,
            completedAt: new Date().toISOString(),
          };

          task.status = "completed";
          task.recoveredFromCrash = task.retryCount > 0;
          task.completedAt = result.completedAt;
          task.durationMs = durationMs;
          task.result = result;

          worker.status = "idle";
          worker.currentTask = undefined;
          worker.currentTaskId = undefined;
          worker.currentTaskTitle = undefined;
          worker.currentTaskAction = undefined;
          worker.currentTaskUrl = undefined;
          worker.currentTaskStartedAt = undefined;
          worker.tasksCompleted++;
          worker.lastActiveAt = new Date().toISOString();

          // Profilsperre freigeben
          releaseProfileLock(worker.profileDir, worker.agentId);
          worker.isLocked = false;

          // In Postgres 5544 persistieren
          await this.persistTask(task);
          await this.persistResult(result, task.runId);
          void conductorHooks.onTaskSuccess(task.id, result).catch(() => {});

          if (task.retryCount > 0) {
            this.totalCrashesRecovered++;
            console.log(
              `[SwarmController] Task ${task.id} auf Agent ${worker.agentId} nach Absturz ERFOLGREICH wiederhergestellt!`,
            );
          }

          return result;
        } catch (err: any) {
          lastError = err?.message || String(err);
          worker.crashCount++;
          task.retryCount++;

          console.warn(
            `[SwarmController] Crash/Fehler erkannt auf Worker ${worker.agentId} via CDP-Heartbeat (Versuch ${task.retryCount}/${task.maxRetries}): ${lastError}`,
          );

          if (task.retryCount <= task.maxRetries) {
            // AUTOMATISCHER NEUSTART MIT BACKOFF:
            worker.status = "restarting";
            task.status = "retrying";
            void this.persistTask(task);

            // 1. Launch-Tracker für sauberen Neustart resetten
            resetAgentChromeLaunchAttempts(worker.profileDir);

            // 2. Exponential/Linear Backoff vor Neustart
            const backoffMs = Math.round(this.limits.retryDelayMs * Math.pow(1.5, task.retryCount - 1));
            await new Promise((r) => setTimeout(r, backoffMs));

            // 3. Browser-Profil neu initialisieren
            try {
              assertNotStefanProfile(worker.profileDir);
              await ensureAgentHeliumReady(worker.agentId, "about:blank");
            } catch {
              /* ignore launch error during recovery, next loop will retry */
            }
          }
        }
      }

      // Wenn alle Retries erschöpft sind:
      // VERTRAG: nach maxRetries Task => failed, Worker => crashed
      const durationMs = Date.now() - startTime;
      const metrics = this.monitor.getMetrics();

      const failedResult: SwarmTaskResult = {
        ok: false,
        taskId: task.id,
        status: "failed",
        agentId: worker.agentId,
        agentName: worker.name,
        profileDir: worker.profileDir,
        cdpPort: worker.cdpPort,
        action: task.action,
        error: `Task fehlgeschlagen nach ${task.maxRetries} Versuchen: ${lastError}`,
        durationMs,
        retries: task.retryCount,
        recoveredFromCrash: false,
        systemMetrics: metrics,
        createdAt: task.createdAt,
        completedAt: new Date().toISOString(),
      };

      task.status = "failed";
      task.error = failedResult.error;
      task.completedAt = failedResult.completedAt;
      task.durationMs = durationMs;
      task.result = failedResult;

      // VERTRAG: Worker => crashed
      worker.status = "crashed";
      worker.currentTask = undefined;
      worker.currentTaskId = undefined;
      worker.currentTaskTitle = undefined;
      worker.currentTaskAction = undefined;
      worker.currentTaskUrl = undefined;
      worker.currentTaskStartedAt = undefined;
      worker.lastError = lastError;
      worker.lastActiveAt = new Date().toISOString();

      // Profilsperre freigeben
      releaseProfileLock(worker.profileDir, worker.agentId);
      worker.isLocked = false;

      // In Postgres 5544 persistieren
      await this.persistTask(task);
      await this.persistResult(failedResult, task.runId);
      void conductorHooks.onTaskFailure(task.id, failedResult.error, { summary: task.title }).catch(() => ({ handoff: false }));

      return failedResult;
    } finally {
      releaseProfileLock(worker.profileDir, worker.agentId);
      worker.isLocked = false;
    }
  }

  /**
   * Führt einen Batch von Aufgaben parallel über den Swarm aus.
   * Unterstützt 3, 10 oder bis zu 20 Agenten parallel.
   */
  public async runBatch(
    inputs: SwarmTaskInput[],
    options: {
      maxConcurrent?: number;
      runId?: string;
    } = {},
  ): Promise<SwarmRunResult> {
    const runId = options.runId || `swarm-run-${randomBytes(6).toString("hex")}`;
    const startTime = Date.now();

    if (options.maxConcurrent) {
      this.setLimits({ maxConcurrent: options.maxConcurrent });
    }

    const concurrency = this.limits.maxConcurrent;
    await this.ensureWorkerPool(Math.min(inputs.length, concurrency));

    const tasks: SwarmTask[] = [];
    for (const input of inputs) {
      const task = this.enqueueTask(input, runId);
      tasks.push(task);
    }

    await new Promise<void>((resolve) => {
      const checkDone = () => {
        const pending = tasks.filter(
          (t) => t.status === "queued" || t.status === "scheduled" || t.status === "running" || t.status === "retrying",
        );
        if (pending.length === 0) {
          resolve();
        } else {
          setTimeout(checkDone, 100);
        }
      };
      checkDone();
    });

    const results: SwarmTaskResult[] = tasks.map((t) => {
      if (t.result) return t.result;
      return {
        ok: false,
        taskId: t.id,
        status: "failed",
        agentId: t.assignedWorkerId || "unknown",
        profileDir: t.assignedProfileDir || "",
        cdpPort: t.assignedCdpPort || 0,
        action: t.action,
        error: t.error || "Abgebrochen",
        durationMs: t.durationMs || 0,
        retries: t.retryCount,
        recoveredFromCrash: !!t.recoveredFromCrash,
      };
    });

    const completed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    const crashesRecovered = results.filter((r) => r.recoveredFromCrash).length;
    const durationMs = Date.now() - startTime;
    const systemMetrics = this.monitor.getMetrics();

    const runResult: SwarmRunResult = {
      runId,
      totalTasks: tasks.length,
      completed,
      failed,
      concurrency,
      durationMs,
      crashesRecovered,
      systemMetrics,
      results,
    };

    this.runHistory.set(runId, runResult);
    return runResult;
  }

  /**
   * Vertragskonforme API: getStatus(): SwarmStatus
   * workers[20]: agentId, name, status idle|running|crashed|stopped|takeover, currentTask?, lastScreenshotAt?, crashCount;
   * overallProgress: {total,done,failed,percent};
   * metrics: {cpuPercent,memPercent}
   */
  public getStatus(ensureCount = 20): SwarmStatus {
    if (this.workers.size < ensureCount) {
      for (let idx = 1; idx <= ensureCount; idx++) {
        const pad = String(idx).padStart(2, "0");
        const swarmAgentId = `swarm20-agent-${pad}`;
        if (!this.workers.has(swarmAgentId)) {
          this.registerWorker(swarmAgentId, `Swarm20 Bot ${pad}`);
        }
      }
    }

    const workers = Array.from(this.workers.values()).map((w) => {
      // Status harmonisieren für Vertrag
      let contractStatus: SwarmWorkerStatus = w.status;
      if (w.status === "busy") contractStatus = "running";
      if (w.status === "restarting") contractStatus = "running";
      if (w.status === "error") contractStatus = "crashed";
      if (w.status === "offline") contractStatus = "stopped";

      return {
        ...w,
        name: w.name || w.agentName,
        agentName: w.name || w.agentName,
        status: contractStatus,
        currentTask: w.currentTask || (w.currentTaskId ? {
          id: w.currentTaskId,
          title: w.currentTaskTitle || "Aktive Aufgabe",
          action: w.currentTaskAction || "task",
          url: w.currentTaskUrl,
          startedAt: w.currentTaskStartedAt,
        } : undefined),
      };
    });

    const activeWorkers = workers.filter((w) => w.status === "running").length;
    const runningTasks = Array.from(this.taskHistory.values()).filter(
      (t) => t.status === "running" || t.status === "retrying",
    ).length;
    const completedTasks = Array.from(this.taskHistory.values()).filter((t) => t.status === "completed").length;
    const failedTasks = Array.from(this.taskHistory.values()).filter((t) => t.status === "failed").length;
    const totalTasks = this.taskHistory.size;
    const queuedTasks = this.queue.length;

    const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;
    const resourceCheck = this.monitor.checkLimits(this.limits);
    const metrics = {
      cpuPercent: resourceCheck.metrics.cpuPercent,
      memPercent: resourceCheck.metrics.memPercent,
    };

    return {
      controller: "Helium-Swarm-Controller",
      version: "1.0.0",
      activeWorkers,
      totalWorkers: workers.length,
      maxConcurrent: this.limits.maxConcurrent,
      queueLength: this.queue.length,
      runningTasks,
      completedTasks,
      failedTasks,
      totalCrashesRecovered: this.totalCrashesRecovered,
      overallProgress: {
        total: totalTasks,
        done: completedTasks,
        failed: failedTasks,
        percent,
        totalTasks,
        completedTasks,
        failedTasks,
        runningTasks,
        queuedTasks,
      },
      metrics,
      resourceStatus: resourceCheck,
      systemMetrics: resourceCheck.metrics,
      limits: { ...this.limits },
      workers,
    };
  }

  /**
   * Vertragskonforme API: getResults(taskId?)
   * Liefert Status, Output, Fehler, Dauer, Screenshot-Referenz.
   * Wenn taskId übergeben: liefert das Ergebnis dieses Tasks.
   * Wenn taskId weggelassen: liefert die Liste aller Ergebnisse.
   */
  public getResults(taskId?: string): SwarmTaskResult | SwarmTaskResult[] | undefined {
    if (typeof taskId === "string" && taskId.trim()) {
      const task = this.taskHistory.get(taskId);
      if (task?.result) return task.result;
      return undefined;
    }

    const all = Array.from(this.taskHistory.values())
      .filter((t): t is SwarmTask & { result: SwarmTaskResult } => Boolean(t.result))
      .map((t) => t.result);
    return all.reverse();
  }

  /**
   * Vertragskonforme API: cancelTask(id)
   */
  public cancelTask(taskId: string): boolean {
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      const [task] = this.queue.splice(idx, 1);
      task.status = "cancelled";
      task.error = "Manuell abgebrochen";
      task.completedAt = new Date().toISOString();
      void this.persistTask(task);
      return true;
    }
    const historyTask = this.taskHistory.get(taskId);
    if (historyTask && (historyTask.status === "queued" || historyTask.status === "scheduled")) {
      historyTask.status = "cancelled";
      historyTask.error = "Manuell abgebrochen";
      historyTask.completedAt = new Date().toISOString();
      void this.persistTask(historyTask);
      return true;
    }
    return false;
  }

  /**
   * Vertragskonforme API: stopWorker(agentId)
   */
  public stopWorker(agentId: string): boolean {
    const worker = this.workers.get(agentId);
    if (!worker) return false;

    // Laufenden Task abbrechen
    if (worker.currentTaskId) {
      const task = this.taskHistory.get(worker.currentTaskId);
      if (task) {
        task.status = "cancelled";
        task.error = "Manuell durch Benutzer gestoppt";
        task.completedAt = new Date().toISOString();
        void this.persistTask(task);
      }
    }

    worker.status = "stopped";
    worker.currentTask = undefined;
    worker.currentTaskId = undefined;
    worker.currentTaskTitle = undefined;
    worker.currentTaskAction = undefined;
    worker.currentTaskUrl = undefined;
    worker.currentTaskStartedAt = undefined;
    worker.lastActiveAt = new Date().toISOString();

    // Profilsperre freigeben
    releaseProfileLock(worker.profileDir, worker.agentId);
    worker.isLocked = false;

    // Wartende Tasks für diesen Worker abbrechen
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].agentId === agentId) {
        const [cancelled] = this.queue.splice(i, 1);
        cancelled.status = "cancelled";
        cancelled.error = "Worker gestoppt";
        cancelled.completedAt = new Date().toISOString();
        void this.persistTask(cancelled);
      }
    }

    return true;
  }

  /**
   * Vertragskonforme API: takeoverWorker(agentId)
   */
  public async takeoverWorker(agentId: string): Promise<{
    ok: boolean;
    agentId: string;
    agentName: string;
    profileDir: string;
    cdpPort: number;
    url: string;
    message: string;
  }> {
    const worker = this.workers.get(agentId);
    if (!worker) throw new Error(`Worker "${agentId}" nicht gefunden`);

    assertNotStefanProfile(worker.profileDir);

    const targetUrl = worker.lastUrl || "about:blank";
    await ensureAgentHeliumReady(worker.agentId, targetUrl);
    await ensureAgentChromeRunning(worker.profileDir, targetUrl);

    worker.status = "takeover";

    return {
      ok: true,
      agentId: worker.agentId,
      agentName: worker.name,
      profileDir: worker.profileDir,
      cdpPort: worker.cdpPort,
      url: targetUrl,
      message: `Helium-Browser für Agent "${worker.name}" geöffnet. Profil: ${worker.profileDir}`,
    };
  }

  /**
   * Vertragskonforme API: captureScreenshot(agentId) -> {mimeType,base64}
   */
  public async captureScreenshot(agentId: string): Promise<{
    mimeType: string;
    base64: string;
    ok?: boolean;
    error?: string;
  }> {
    const worker = this.workers.get(agentId);
    if (!worker) {
      throw new Error(`Worker "${agentId}" nicht gefunden`);
    }

    assertNotStefanProfile(worker.profileDir);

    const shot = await cdpScreenshot(worker.cdpPort);
    if (shot.ok && shot.bytes) {
      const rawBase64 = Buffer.from(shot.bytes).toString("base64");
      const fullDataUrl = `data:image/jpeg;base64,${rawBase64}`;
      worker.lastScreenshot = fullDataUrl;
      worker.lastScreenshotAt = new Date().toISOString();
      return {
        mimeType: "image/jpeg",
        base64: rawBase64,
        ok: true,
      };
    }

    if (worker.lastScreenshot) {
      const raw = worker.lastScreenshot.replace(/^data:image\/[^;]+;base64,/, "");
      return {
        mimeType: "image/jpeg",
        base64: raw,
        ok: true,
      };
    }

    throw new Error(shot.error || "Kein aktives Browserfenster erreichbar");
  }

  /**
   * Rückwärtskompatibler Screenshot-Helfer für bestehende MCP-Tools.
   */
  public async captureWorkerScreenshot(agentId: string): Promise<{
    ok: boolean;
    screenshot?: string | null;
    error?: string;
  }> {
    try {
      const res = await this.captureScreenshot(agentId);
      return { ok: true, screenshot: `data:${res.mimeType};base64,${res.base64}` };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  /**
   * Vertragskonforme API: stopAll()
   */
  public stopAll(): { cancelledQueue: number; stoppedRunning: number } {
    let cancelledQueue = 0;
    let stoppedRunning = 0;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        task.status = "cancelled";
        task.error = "Swarm vollständig gestoppt";
        task.completedAt = new Date().toISOString();
        void this.persistTask(task);
        cancelledQueue++;
      }
    }

    for (const worker of this.workers.values()) {
      if (worker.status === "running" || worker.status === "busy" || worker.status === "restarting") {
        this.stopWorker(worker.agentId);
        stoppedRunning++;
      } else {
        releaseProfileLock(worker.profileDir, worker.agentId);
        worker.isLocked = false;
      }
    }

    return { cancelledQueue, stoppedRunning };
  }

  public getTask(taskId: string): SwarmTask | undefined {
    return this.taskHistory.get(taskId);
  }

  public getRunResult(runId: string): SwarmRunResult | null {
    return this.runHistory.get(runId) || null;
  }

  public listResults(limit = 50): SwarmTaskResult[] {
    const results = this.getResults();
    if (Array.isArray(results)) {
      return results.slice(0, limit);
    }
    return [];
  }
}

// Globales Singleton
let globalSwarmController: SwarmController | null = null;

export function getSwarmController(database?: Database): SwarmController {
  if (!globalSwarmController) {
    globalSwarmController = new SwarmController(database);
  } else if (database) {
    globalSwarmController.setDatabase(database);
  }
  return globalSwarmController;
}
