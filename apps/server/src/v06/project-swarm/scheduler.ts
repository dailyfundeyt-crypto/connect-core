/**
 * Project-Swarm: Swarm Orchestrator & Task Scheduler (v06 / A27)
 *
 * Zentraler Scheduler:
 * 1. Verteilt Aufgaben an tausende Bots nach Rolle (Planer, Arbeiter, Prüfer, Berichterstatter)
 * 2. Prüft Spender-Kontingente vor jeder Zuweisung (quota.ts)
 * 3. Schützt vor Doppelarbeit durch atomare Leases (lease.ts)
 * 4. Schleust jedes Ergebnis zwingend durch das Prüfer-Gate (reviewerGate.ts)
 * 5. Veröffentlicht periodisch Meilenstein-Dokumente (progressReporter.ts)
 * 6. Sicherheits-Stopps:
 *    - Sofortiger Pause-Knopf
 *    - Max-Budget-Limit
 *    - Blockade externer Aktionen (Push/E-Mail/Posts nach außen) ohne Freigabe
 */

import { randomUUID } from "node:crypto";
import type { ProjectTask, ResearchProject } from "../../contracts/v06/social";
import { roleManager as defaultRoleManager, SwarmRoleManager, type SwarmRole } from "./roles";
import { quotaManager as defaultQuotaManager, QuotaManager } from "./quota";
import { leaseManager as defaultLeaseManager, TaskLeaseManager, type TaskLease } from "./lease";
import { reviewerGate as defaultReviewerGate, ReviewerGate, type TaskSubmission } from "./reviewerGate";
import { progressReporter as defaultProgressReporter, ProgressReporter, type ProgressReportData } from "./progressReporter";
import { goalDecomposer } from "./decomposer";

export interface SwarmRunConfig {
  maxParallelBots?: number;
  budgetTokens?: number;
  reportIntervalTasks?: number;
  allowExternalActions?: boolean; // Standard: false (Sicherheits-Stopp)
  leaseDurationMs?: number;
}

export type SwarmRunStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "budget_exceeded"
  | "stopped";

export interface SwarmRunState {
  id: string;
  projectId: string;
  status: SwarmRunStatus;
  budgetTokens: number;
  usedTokens: number;
  maxParallelBots: number;
  tasksCompleted: number;
  tasksFailed: number;
  allowExternalActions: boolean;
  startedAt: string;
  pausedAt?: string;
  completedAt?: string;
}

export interface SwarmSchedulerDependencies {
  roleManager?: SwarmRoleManager;
  quotaManager?: QuotaManager;
  leaseManager?: TaskLeaseManager;
  reviewerGate?: ReviewerGate;
  progressReporter?: ProgressReporter;
}

export class ExternalActionBlockedError extends Error {
  constructor(actionName: string) {
    super(
      `Sicherheits-Stopp: Externe Aktion '${actionName}' (Push/E-Mail/externer Post) ist im Projekt-Schwarm ohne explizite Freigabe blockiert.`,
    );
    this.name = "ExternalActionBlockedError";
  }
}

export type TaskExecutorHandler = (
  task: ProjectTask,
  botId: string,
) => Promise<{ output: string; tokensUsed?: number }>;

export class SwarmScheduler {
  private runs = new Map<string, SwarmRunState>(); // Key: projectId -> SwarmRunState
  private taskStore = new Map<string, ProjectTask>(); // Key: taskId -> ProjectTask
  private projectTasks = new Map<string, Set<string>>(); // Key: projectId -> Set<taskId>
  private projects = new Map<string, ResearchProject>(); // Key: projectId -> ResearchProject

  // Registrierte Bot-Pools
  private registeredBots = new Set<string>();

  // Abhaengigkeiten
  public roleMgr: SwarmRoleManager;
  public quotaMgr: QuotaManager;
  public leaseMgr: TaskLeaseManager;
  public revGate: ReviewerGate;
  public progReporter: ProgressReporter;

  constructor(deps: SwarmSchedulerDependencies = {}) {
    this.roleMgr = deps.roleManager ?? defaultRoleManager;
    this.quotaMgr = deps.quotaManager ?? defaultQuotaManager;
    this.leaseMgr = deps.leaseManager ?? defaultLeaseManager;
    this.revGate = deps.reviewerGate ?? defaultReviewerGate;
    this.progReporter = deps.progressReporter ?? defaultProgressReporter;
  }

  /**
   * Registriert ein Projekt im Scheduler
   */
  public registerProject(project: ResearchProject): void {
    this.projects.set(project.id, { ...project });
    if (!this.projectTasks.has(project.id)) {
      this.projectTasks.set(project.id, new Set());
    }
  }

  /**
   * Lädt Aufgaben in den Scheduler (z. B. nach Dekomposition)
   */
  public loadTasks(tasks: ProjectTask[]): void {
    for (const t of tasks) {
      this.taskStore.set(t.id, { ...t });
      let set = this.projectTasks.get(t.projectId);
      if (!set) {
        set = new Set();
        this.projectTasks.set(t.projectId, set);
      }
      set.add(t.id);
    }
  }

  /**
   * Registriert Bots im Schwarm
   */
  public registerBots(botIds: string[], defaultRole: SwarmRole = "worker"): void {
    for (const botId of botIds) {
      this.registeredBots.add(botId);
      if (!this.roleMgr.getRoles(botId).length) {
        this.roleMgr.assignRoles(botId, [defaultRole]);
      }
    }
  }

  /**
   * Startet oder setzt einen Schwarm-Lauf fort
   */
  public async startSwarmRun(
    projectId: string,
    config: SwarmRunConfig = {},
  ): Promise<SwarmRunState> {
    const existing = this.runs.get(projectId);
    const nowIso = new Date().toISOString();

    if (existing && existing.status === "paused") {
      // Reaktivieren
      existing.status = "running";
      existing.pausedAt = undefined;
      return { ...existing };
    }

    const budgetTokens = config.budgetTokens ?? 10_000_000;
    this.quotaMgr.setProjectBudget(projectId, budgetTokens);

    const runId = `run_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const newState: SwarmRunState = {
      id: runId,
      projectId,
      status: "running",
      budgetTokens,
      usedTokens: 0,
      maxParallelBots: config.maxParallelBots ?? 50,
      tasksCompleted: 0,
      tasksFailed: 0,
      allowExternalActions: config.allowExternalActions ?? false,
      startedAt: nowIso,
    };

    this.runs.set(projectId, newState);
    return { ...newState };
  }

  /**
   * Sofortiger Pause-Knopf: Stoppt den Lauf augenblicklich
   */
  public async pauseSwarmRun(projectId: string): Promise<SwarmRunState> {
    const state = this.runs.get(projectId);
    if (!state) {
      throw new Error(`Kein aktiver Swarm-Lauf für Projekt '${projectId}' gefunden.`);
    }

    state.status = "paused";
    state.pausedAt = new Date().toISOString();
    return { ...state };
  }

  /**
   * Beendet den Lauf
   */
  public async stopSwarmRun(projectId: string): Promise<SwarmRunState> {
    const state = this.runs.get(projectId);
    if (!state) {
      throw new Error(`Kein aktiver Swarm-Lauf für Projekt '${projectId}' gefunden.`);
    }

    state.status = "stopped";
    state.completedAt = new Date().toISOString();
    return { ...state };
  }

  public getSwarmRunState(projectId: string): SwarmRunState | undefined {
    const state = this.runs.get(projectId);
    return state ? { ...state } : undefined;
  }

  public getTasks(projectId: string): ProjectTask[] {
    const taskIds = this.projectTasks.get(projectId);
    if (!taskIds) return [];
    const list: ProjectTask[] = [];
    for (const id of taskIds) {
      const t = this.taskStore.get(id);
      if (t) list.push({ ...t });
    }
    return list;
  }

  /**
   * Prüft DAG-Abhängigkeiten: Eine Aufgabe ist ausführbar, wenn sie den Status 'todo' hat
   * und eine eventuelle übergeordnete Aufgabe (parentId) bereits 'done' ist.
   * Verbesserungsaufgaben sind sofort ausführbar.
   */
  public isTaskExecutable(task: ProjectTask): boolean {
    if (task.status !== "todo") return false;
    if (!task.parentId) return true;

    // Verbesserungsaufgaben können sofort bearbeitet werden
    if (task.title.startsWith("Verbessern")) {
      return true;
    }

    const parent = this.taskStore.get(task.parentId);
    if (!parent) return true; // Wenn Parent nicht bekannt, behandeln wie Root
    if (parent.status === "done") return true;

    // Wenn Parent blocked war, aber eine erfolgreiche Verbesserungsaufgabe für ihn vorliegt
    if (parent.status === "blocked") {
      const allTasks = Array.from(this.taskStore.values());
      const hasDoneImprovement = allTasks.some(
        (t) => t.parentId === parent.id && t.title.startsWith("Verbessern") && t.status === "done",
      );
      if (hasDoneImprovement) return true;
    }

    return false;
  }

  /**
   * Sicherheits-Wächter: Blockiert externe Aktionen, falls nicht autorisiert
   */
  public assertExternalActionAllowed(projectId: string, actionName: string): void {
    const state = this.runs.get(projectId);
    if (!state || !state.allowExternalActions) {
      throw new ExternalActionBlockedError(actionName);
    }
  }

  /**
   * Führt einen Scheduling-Tick aus:
   * 1. Bereinigt abgelaufene Leases
   * 2. Findet ausführbare Aufgaben
   * 3. Wählt geeignete Bots (Rolle + Quota)
   * 4. Erteilt atomare Leases
   * 5. Führt Aufgaben aus (Worker)
   * 6. Validiert über das Prüfer-Gate (Reviewer)
   * 7. Erstellt Meilenstein-Berichte (Reporter)
   */
  public async tick(
    projectId: string,
    options: {
      executor?: TaskExecutorHandler;
      reportIntervalTasks?: number;
    } = {},
  ): Promise<{
    processedTasks: number;
    completedTasks: number;
    failedTasks: number;
    activeLeases: number;
    runStatus: SwarmRunStatus;
  }> {
    const runState = this.runs.get(projectId);
    if (!runState || runState.status !== "running") {
      return {
        processedTasks: 0,
        completedTasks: runState?.tasksCompleted ?? 0,
        failedTasks: runState?.tasksFailed ?? 0,
        activeLeases: this.leaseMgr.listActiveLeases(projectId).length,
        runStatus: runState?.status ?? "idle",
      };
    }

    // 1. Budget-Schutz prüfen
    if (this.quotaMgr.isProjectBudgetExceeded(projectId)) {
      runState.status = "budget_exceeded";
      return {
        processedTasks: 0,
        completedTasks: runState.tasksCompleted,
        failedTasks: runState.tasksFailed,
        activeLeases: this.leaseMgr.listActiveLeases(projectId).length,
        runStatus: runState.status,
      };
    }

    // 2. Abgelaufene Leases freigeben
    const expiredTaskIds = await this.leaseMgr.releaseExpiredLeases(projectId);
    for (const taskId of expiredTaskIds) {
      const task = this.taskStore.get(taskId);
      if (task && task.status === "claimed") {
        task.status = "todo";
        task.assigneeBotId = undefined;
        this.taskStore.set(taskId, { ...task });
      }
    }

    // 3. Ausführbare Aufgaben sammeln
    const allTasks = this.getTasks(projectId);
    const executableTasks = allTasks.filter((t) => this.isTaskExecutable(t));

    // Prüfen ob alle Aufgaben fertig oder blockiert sind -> Lauf abgeschlossen
    const pendingTasks = allTasks.filter((t) => t.status === "todo" || t.status === "claimed");
    if (allTasks.length > 0 && pendingTasks.length === 0) {
      runState.status = "completed";
      runState.completedAt = new Date().toISOString();

      // Abschlussbericht erzeugen
      const project = this.projects.get(projectId);
      if (project) {
        const donorCerts = this.quotaMgr.generateDonorCertificates(projectId);
        this.progReporter.createReport({
          project,
          allTasks: this.getTasks(projectId),
          activeBots: Array.from(this.registeredBots),
          tokensUsed: runState.usedTokens,
          donorCertificates: donorCerts,
        });
      }

      return {
        processedTasks: 0,
        completedTasks: runState.tasksCompleted,
        failedTasks: runState.tasksFailed,
        activeLeases: 0,
        runStatus: runState.status,
      };
    }

    // 4. Verfügbare Worker-Bots ermitteln
    const activeLeases = this.leaseMgr.listActiveLeases(projectId);
    const busyBots = new Set(activeLeases.map((l) => l.botId));

    const availableWorkers: string[] = [];
    for (const botId of this.registeredBots) {
      if (busyBots.has(botId)) continue;
      if (!this.roleMgr.hasRole(botId, "worker")) continue;

      const quotaCheck = this.quotaMgr.canBotExecute(projectId, botId);
      if (quotaCheck.allowed) {
        availableWorkers.push(botId);
      }
    }

    // 5. Aufgaben zuweisen und ausführen
    let processedThisTick = 0;
    const defaultExecutor: TaskExecutorHandler = async (t, b) => ({
      output: `Erfolgreich ausgeführt von Bot '${b}' gemäß Akzeptanzkriterien: ${t.acceptance}`,
      tokensUsed: 1500,
    });

    const executor = options.executor ?? defaultExecutor;
    const maxToProcess = Math.min(executableTasks.length, availableWorkers.length, runState.maxParallelBots);

    for (let i = 0; i < maxToProcess; i++) {
      // Pause-Check zwischendurch (Sofort-Stopp).
      // Der Status kann zwischen den await-Punkten von einem anderen Request
      // geändert werden; die breite lokale Kopie verhindert, dass TypeScript
      // die Prüfung als toten Code auf "running" verengt.
      const statusNow: string = runState.status;
      if (statusNow === "paused" || statusNow === "stopped") {
        break;
      }

      const task = executableTasks[i];
      const botId = availableWorkers[i];

      let lease: TaskLease;
      try {
        // Atomar claimen -> Verhindert Doppelarbeit!
        lease = await this.leaseMgr.claimTask(task.id, botId, projectId, { role: "worker" });
      } catch {
        // Task wurde bereits parallel geclaimt -> überspringen
        continue;
      }

      // Task im lokalen Speicher als claimed markieren
      task.status = "claimed";
      task.assigneeBotId = botId;
      this.taskStore.set(task.id, { ...task });

      // Ausführung durch Worker
      let executionResult: { output: string; tokensUsed?: number };
      try {
        executionResult = await executor(task, botId);
      } catch (err: any) {
        // Worker fehlgeschlagen -> Lease freigeben, Task wieder auf todo
        await this.leaseMgr.releaseLease(lease.id, botId, err.message);
        task.status = "todo";
        task.assigneeBotId = undefined;
        this.taskStore.set(task.id, { ...task });
        runState.tasksFailed += 1;
        continue;
      }

      const tokensSpent = executionResult.tokensUsed ?? 1000;
      this.quotaMgr.recordTaskExecution(projectId, botId, tokensSpent);
      runState.usedTokens += tokensSpent;

      // 6. Reviewer-Gate: Zwingende Prüfung vor 'done'
      // Prüfer suchen (darf nicht der ausführende Worker sein!)
      const candidateReviewers = Array.from(this.registeredBots).filter(
        (b) => b !== botId && this.roleMgr.hasRole(b, "reviewer"),
      );

      const isCritical = this.revGate.isCriticalTask(task);
      const submission: TaskSubmission = {
        taskId: task.id,
        workerBotId: botId,
        output: executionResult.output,
        tokensUsed: tokensSpent,
        submittedAt: new Date().toISOString(),
      };

      let reviewOutcome;

      // Wenn sicherheitskritisch / Onkologie und mind. 2 Reviewer verfügbar sind -> Dual-Reviewer-Konsens!
      if (isCritical && candidateReviewers.length >= 2) {
        reviewOutcome = await this.revGate.evaluateConsensusSubmission(
          task,
          submission,
          [candidateReviewers[0], candidateReviewers[1]],
          { minScore: 85, requiredApprovals: 2 },
        );
      } else {
        const reviewerBotId =
          candidateReviewers.length > 0
            ? candidateReviewers[0]
            : `reviewer_guard_${botId}`;

        reviewOutcome = await this.revGate.evaluateSubmission(
          task,
          submission,
          reviewerBotId,
          { minScore: isCritical ? 85 : 70 },
        );
      }

      if (reviewOutcome.approved) {
        // Abnahme bestanden -> 'done'
        task.status = "done";
        this.taskStore.set(task.id, { ...task });
        await this.leaseMgr.completeLease(lease.id, botId, tokensSpent);
        runState.tasksCompleted += 1;
      } else {
        // Abnahme verfehlt -> Lease abschließen, Folgeaufgabe oder 'blocked'
        await this.leaseMgr.completeLease(lease.id, botId, tokensSpent);
        task.status = reviewOutcome.task.status;
        this.taskStore.set(task.id, { ...task });

        if (reviewOutcome.followUpTask) {
          // Verbesserungsaufgabe in den Plan aufnehmen
          this.loadTasks([reviewOutcome.followUpTask]);
        }
        if (task.status === "blocked") {
          runState.tasksFailed += 1;
        }
      }

      processedThisTick += 1;

      // 7. Meilenstein-Berichterstattung
      const reportInterval = options.reportIntervalTasks ?? 5;
      if (this.progReporter.shouldReport(projectId, runState.tasksCompleted, reportInterval)) {
        const project = this.projects.get(projectId);
        if (project) {
          const donorCerts = this.quotaMgr.generateDonorCertificates(projectId);
          this.progReporter.createReport({
            project,
            allTasks: this.getTasks(projectId),
            activeBots: Array.from(this.registeredBots),
            tokensUsed: runState.usedTokens,
            donorCertificates: donorCerts,
          });
        }
      }
    }

    // 8. Abschlussprüfung nach Tick-Ausführung
    const updatedTasks = this.getTasks(projectId);
    const stillPending = updatedTasks.filter((t) => t.status === "todo" || t.status === "claimed");
    if (updatedTasks.length > 0 && stillPending.length === 0) {
      runState.status = "completed";
      runState.completedAt = new Date().toISOString();

      const project = this.projects.get(projectId);
      if (project) {
        const donorCerts = this.quotaMgr.generateDonorCertificates(projectId);
        this.progReporter.createReport({
          project,
          allTasks: updatedTasks,
          activeBots: Array.from(this.registeredBots),
          tokensUsed: runState.usedTokens,
          donorCertificates: donorCerts,
        });
      }
    }

    return {
      processedTasks: processedThisTick,
      completedTasks: runState.tasksCompleted,
      failedTasks: runState.tasksFailed,
      activeLeases: this.leaseMgr.listActiveLeases(projectId).length,
      runStatus: runState.status,
    };
  }

  public clear(): void {
    this.runs.clear();
    this.taskStore.clear();
    this.projectTasks.clear();
    this.projects.clear();
    this.registeredBots.clear();
  }
}

export const swarmScheduler = new SwarmScheduler();
