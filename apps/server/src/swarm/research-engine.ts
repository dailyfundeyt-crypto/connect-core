/**
 * Research Swarm Task-Graph-Engine (Lane 6)
 *
 * Verwaltet Forschungsprojekte, rekursive DAG-Aufgabenbäume,
 * atomares Lease-Claiming (Concurrency Guard), Peer-Review,
 * Selbstaufträge (proposeTask) mit Tiefen-/Budgetlimit,
 * Bot-Spenden und Fortschrittsberichte.
 */

import { randomUUID } from "node:crypto";
import type {
  CreateDonationInput,
  CreateProjectInput,
  CreateTaskInput,
  Project,
  ProjectDonation,
  ProjectReport,
  ResearchTask,
  TaskClaim,
  TaskProposal,
  TaskResult,
} from "./research-types";

export class ResearchSwarmEngine {
  private projects = new Map<string, Project>();
  private tasks = new Map<string, ResearchTask>();
  private claims = new Map<string, TaskClaim>();
  private results = new Map<string, TaskResult>();
  private donations = new Map<string, ProjectDonation>();
  private reports = new Map<string, ProjectReport>();

  // Mutex-Lock zur Verhinderung von Race Conditions bei gleichzeitigem Claiming
  private claimLock = Promise.resolve();

  constructor() {
    this.seedDefaultProject();
  }

  private async withClaimLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const prevLock = this.claimLock;
    let releaseLock: () => void = () => {};
    this.claimLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    try {
      await prevLock;
      return await fn();
    } finally {
      releaseLock();
    }
  }

  private seedDefaultProject(): void {
    const defaultProjectId = "project-cancer-kras-2026";
    const defaultProject: Project = {
      id: defaultProjectId,
      title: "Krebsforschung: Dezentrales KRAS G12D Hemmstoff-Screening",
      description:
        "Offenes Forschungsprojekt zur Identifikation neuartiger allosterischer Inhibitoren der KRAS G12D Onkoprotein-Mutation durch kooperatives Bot-Screening.",
      goal: "Analyse von 10.000 Molekülverbindungen, Validierung von Bindungstaschen und Synthese von 5 aussichtsreichen Kandidaten für Open-Source-Laborprüfungen.",
      ownerId: "user-stefan-kunc",
      companyId: "company-open-science-foundation",
      status: "active",
      botCount: 24,
      tasksCount: 12,
      githubRepoUrl: "https://github.com/openbot-research/kras-g12d-screening",
      nonProfit: true,
      maxDepth: 4,
      budgetTokens: 50_000_000,
      usedTokens: 1_450_000,
      tags: ["oncology", "kras-g12d", "drug-discovery", "open-science"],
      category: "Biomedizin",
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(defaultProjectId, defaultProject);

    // Initialen Aufgabenbaum (DAG) erzeugen
    const rootTask: ResearchTask = {
      id: "task-kras-root",
      projectId: defaultProjectId,
      title: "KRAS G12D Switch-II Pocket Literature Review",
      description:
        "Strukturierte Extraktion veröffentlichter Bindungsaffinitäten aus 50 PubMed-Publikationen.",
      status: "approved",
      depth: 0,
      assignedTo: "bot-scholar-01",
      resultSummary:
        "50 Publikationen analysiert. 14 allosterische Bindungsmuster für Switch-II identifiziert.",
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    };
    this.tasks.set(rootTask.id, rootTask);

    const subTask1: ResearchTask = {
      id: "task-kras-docking-01",
      projectId: defaultProjectId,
      title: "Virtuelles Screening: Piperazin-Derivate an Tasche P1",
      description:
        "Molekulare Docking-Simulation von 500 Piperazin-basierten Molekülen gegen KRAS PDB 6OIM.",
      status: "open",
      parentTaskId: rootTask.id,
      depth: 1,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(subTask1.id, subTask1);

    const subTask2: ResearchTask = {
      id: "task-kras-resistance-02",
      projectId: defaultProjectId,
      title: "Resistenz-Mutations-Modellierung (Y96D & G12D)",
      description:
        "Plausibilitätsanalyse bekannter Resistenzmechanismen gegen MRTX1133-Analoga.",
      status: "open",
      parentTaskId: rootTask.id,
      depth: 1,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(subTask2.id, subTask2);
  }

  /* ======================================================================== */
  /* 1. Projekt-Verwaltung                                                    */
  /* ======================================================================== */

  public async createProject(input: CreateProjectInput): Promise<Project> {
    const id = input.id || `project-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const project: Project = {
      id,
      title: input.title,
      description: input.description,
      goal: input.goal,
      ownerId: input.ownerId,
      companyId: input.companyId,
      status: "active",
      botCount: 0,
      tasksCount: 0,
      githubRepoUrl: input.githubRepoUrl,
      nonProfit: input.nonProfit ?? true,
      maxDepth: input.maxDepth ?? 4,
      budgetTokens: input.budgetTokens ?? 10_000_000,
      usedTokens: 0,
      tags: input.tags ?? ["open-science"],
      category: input.category ?? "Research",
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);

    // Ziel automatisch in erste Tasks dekomponieren
    if (project.goal) {
      await this.decomposeProjectGoal(id, project.goal);
    }

    return project;
  }

  public async getProject(id: string): Promise<Project | null> {
    return this.projects.get(id) || null;
  }

  public async listProjects(filter?: {
    status?: string;
    companyId?: string;
    ownerId?: string;
  }): Promise<Project[]> {
    let list = Array.from(this.projects.values());
    if (filter?.status) {
      list = list.filter((p) => p.status === filter.status);
    }
    if (filter?.companyId) {
      list = list.filter((p) => p.companyId === filter.companyId);
    }
    if (filter?.ownerId) {
      list = list.filter((p) => p.ownerId === filter.ownerId);
    }
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  public async updateProject(
    id: string,
    updates: Partial<Project>,
  ): Promise<Project | null> {
    const project = this.projects.get(id);
    if (!project) return null;
    const updated = {
      ...project,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(id, updated);
    return updated;
  }

  /* ======================================================================== */
  /* 2. Rekursive DAG-Dekomposition                                           */
  /* ======================================================================== */

  public async decomposeProjectGoal(
    projectId: string,
    goal: string,
    options?: { maxTasks?: number },
  ): Promise<ResearchTask[]> {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const now = new Date().toISOString();
    const createdTasks: ResearchTask[] = [];

    // Root-Task
    const rootTask: ResearchTask = {
      id: `task-${randomUUID().slice(0, 8)}`,
      projectId,
      title: `Übersicht & Planung: ${goal.slice(0, 60)}...`,
      description: `Gesamtkoordination und Strukturierung des Ziels: ${goal}`,
      status: "open",
      depth: 0,
      priority: "high",
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(rootTask.id, rootTask);
    createdTasks.push(rootTask);

    // Atomare Unteraufgaben generieren
    const templates = [
      {
        title: "Literaturrecherche & State-of-the-Art Datenerhebung",
        desc: "Durchsuchung wissenschaftlicher Datenbanken und Dokumentation relevanter Basisergebnisse.",
        depth: 1,
      },
      {
        title: "Hypothesenbildung & Testparameter-Definition",
        desc: "Definition quantitativer Metriken und Validierungsschwellen für das Projektziel.",
        depth: 1,
      },
      {
        title: "Batch-Auswertung & Virtuelle Simulation",
        desc: "Durchführung verteilter Berechnungen und Datenverarbeitungsschritte durch den Schwarm.",
        depth: 2,
      },
      {
        title: "Peer-Review & Ergebnis-Synthese",
        desc: "Zusammenführung der validierten Teilergebnisse in einen wissenschaftlichen Gesamtreport.",
        depth: 2,
      },
    ];

    const count = Math.min(templates.length, options?.maxTasks ?? 4);
    for (let i = 0; i < count; i++) {
      const tmpl = templates[i];
      const task: ResearchTask = {
        id: `task-${randomUUID().slice(0, 8)}`,
        projectId,
        title: tmpl.title,
        description: tmpl.desc,
        status: "open",
        parentTaskId: rootTask.id,
        depth: tmpl.depth,
        createdAt: now,
        updatedAt: now,
      };
      this.tasks.set(task.id, task);
      createdTasks.push(task);
    }

    project.tasksCount = this.getTasksForProject(projectId).length;
    project.updatedAt = now;

    return createdTasks;
  }

  public getTasksForProject(projectId: string): ResearchTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.projectId === projectId,
    );
  }

  public async createTask(input: CreateTaskInput): Promise<ResearchTask> {
    const project = this.projects.get(input.projectId);
    if (!project) throw new Error(`Project ${input.projectId} not found`);

    let depth = input.depth ?? 0;
    if (input.parentTaskId) {
      const parent = this.tasks.get(input.parentTaskId);
      if (parent) {
        depth = parent.depth + 1;
      }
    }

    if (depth > project.maxDepth) {
      throw new Error(
        `Max depth limit of ${project.maxDepth} exceeded (requested depth: ${depth})`,
      );
    }

    const id = input.id || `task-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const task: ResearchTask = {
      id,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      parentTaskId: input.parentTaskId || null,
      depth,
      priority: input.priority || "normal",
      status: input.status || "open",
      budgetTokens: input.budgetTokens || 10_000,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(id, task);
    project.tasksCount = this.getTasksForProject(input.projectId).length;
    project.updatedAt = now;

    return task;
  }

  /* ======================================================================== */
  /* 3. Atomares Claiming mit Lease (Concurrency Guard)                       */
  /* ======================================================================== */

  public async claimTask(
    botId: string,
    projectId?: string,
    options?: { leaseDurationMs?: number; specificTaskId?: string },
  ): Promise<{ task: ResearchTask; claim: TaskClaim } | null> {
    const leaseDurationMs = options?.leaseDurationMs ?? 10 * 60 * 1000; // 10 Minuten Default

    return await this.withClaimLock(async () => {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      // Zuerst abgelaufene Leases freigeben
      this.releaseExpiredLeasesInternal(nowMs);

      // Passenden Task suchen
      let candidate: ResearchTask | undefined;

      if (options?.specificTaskId) {
        const specific = this.tasks.get(options.specificTaskId);
        if (
          specific &&
          (specific.status === "open" ||
            (specific.status === "claimed" &&
              specific.leaseExpiresAt &&
              new Date(specific.leaseExpiresAt).getTime() < nowMs))
        ) {
          candidate = specific;
        }
      } else {
        // Freien Task finden (Priorität auf offene Tasks mit geringer Tiefe / hoher Prio)
        const allTasks = Array.from(this.tasks.values());
        const openTasks = allTasks.filter((t) => {
          if (projectId && t.projectId !== projectId) return false;
          if (t.status === "open") return true;
          // Claimed aber Lease abgelaufen
          if (
            t.status === "claimed" &&
            t.leaseExpiresAt &&
            new Date(t.leaseExpiresAt).getTime() < nowMs
          ) {
            return true;
          }
          return false;
        });

        // Wähle den besten Task
        candidate = openTasks[0];
      }

      if (!candidate) {
        return null;
      }

      // Budget-Check für Projekt
      const project = this.projects.get(candidate.projectId);
      if (project && project.usedTokens >= project.budgetTokens) {
        throw new Error(
          `Project budget exhausted (${project.usedTokens}/${project.budgetTokens} tokens)`,
        );
      }

      // Atomar claimen
      const leaseExpiresAt = new Date(nowMs + leaseDurationMs).toISOString();
      candidate.status = "claimed";
      candidate.assignedTo = botId;
      candidate.leaseExpiresAt = leaseExpiresAt;
      candidate.updatedAt = nowIso;

      const claimId = `claim-${randomUUID().slice(0, 8)}`;
      const claim: TaskClaim = {
        id: claimId,
        taskId: candidate.id,
        botId,
        claimedAt: nowIso,
        leaseExpiresAt,
        status: "active",
        heartbeatAt: nowIso,
      };

      this.claims.set(claimId, claim);

      return {
        task: { ...candidate },
        claim: { ...claim },
      };
    });
  }

  public async heartbeatClaim(
    claimId: string,
    botId: string,
    extensionMs = 10 * 60 * 1000,
  ): Promise<boolean> {
    return await this.withClaimLock(() => {
      const claim = this.claims.get(claimId);
      if (!claim || claim.botId !== botId || claim.status !== "active") {
        return false;
      }
      const nowMs = Date.now();
      const newExpiry = new Date(nowMs + extensionMs).toISOString();
      claim.heartbeatAt = new Date(nowMs).toISOString();
      claim.leaseExpiresAt = newExpiry;

      const task = this.tasks.get(claim.taskId);
      if (task && task.assignedTo === botId) {
        task.leaseExpiresAt = newExpiry;
        task.updatedAt = claim.heartbeatAt;
      }

      return true;
    });
  }

  private releaseExpiredLeasesInternal(nowMs: number): number {
    let count = 0;
    for (const claim of this.claims.values()) {
      if (
        claim.status === "active" &&
        new Date(claim.leaseExpiresAt).getTime() < nowMs
      ) {
        claim.status = "expired";
        const task = this.tasks.get(claim.taskId);
        if (task && task.status === "claimed") {
          task.status = "open";
          task.assignedTo = undefined;
          task.leaseExpiresAt = undefined;
          task.updatedAt = new Date(nowMs).toISOString();
          count++;
        }
      }
    }
    return count;
  }

  public async releaseExpiredLeases(): Promise<number> {
    return await this.withClaimLock(() => {
      return this.releaseExpiredLeasesInternal(Date.now());
    });
  }

  /* ======================================================================== */
  /* 4. Result Submission & Peer Review                                       */
  /* ======================================================================== */

  public async submitTaskResult(
    taskId: string,
    botId: string,
    data: {
      resultSummary: string;
      resultUrl?: string;
      outputData?: Record<string, unknown>;
      tokensUsed?: number;
    },
  ): Promise<TaskResult> {
    return await this.withClaimLock(async () => {
      const task = this.tasks.get(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      if (task.assignedTo && task.assignedTo !== botId) {
        throw new Error(
          `Task ${taskId} is assigned to ${task.assignedTo}, not ${botId}`,
        );
      }

      const now = new Date().toISOString();
      task.status = "submitted";
      task.resultSummary = data.resultSummary;
      task.resultUrl = data.resultUrl;
      task.updatedAt = now;

      const resultId = `result-${randomUUID().slice(0, 8)}`;
      const result: TaskResult = {
        id: resultId,
        taskId,
        botId,
        resultSummary: data.resultSummary,
        resultUrl: data.resultUrl,
        outputData: data.outputData,
        status: "submitted",
        submittedAt: now,
      };
      this.results.set(resultId, result);

      // Verbrauchte Tokens verbuchen
      const project = this.projects.get(task.projectId);
      if (project && data.tokensUsed) {
        project.usedTokens += data.tokensUsed;
        project.updatedAt = now;
      }

      // Aktive Claims abschließen
      for (const claim of this.claims.values()) {
        if (claim.taskId === taskId && claim.status === "active") {
          claim.status = "completed";
        }
      }

      return result;
    });
  }

  public async reviewTaskResult(
    taskId: string,
    reviewerId: string,
    review: {
      approved: boolean;
      comment: string;
      score?: number;
    },
  ): Promise<ResearchTask> {
    return await this.withClaimLock(async () => {
      const task = this.tasks.get(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      const now = new Date().toISOString();
      task.reviewerId = reviewerId;
      task.reviewComment = review.comment;
      task.updatedAt = now;

      // Result-Record aktualisieren
      for (const res of this.results.values()) {
        if (res.taskId === taskId) {
          res.status = review.approved ? "approved" : "rejected";
          res.reviewerId = reviewerId;
          res.reviewComment = review.comment;
          res.reviewScore = review.score ?? (review.approved ? 95 : 40);
          res.reviewedAt = now;
        }
      }

      if (review.approved) {
        task.status = "approved";
      } else {
        const retries = (task.retryCount ?? 0) + 1;
        task.retryCount = retries;
        if (retries >= (task.maxRetries ?? 3)) {
          task.status = "rejected";
        } else {
          // Re-queue zur erneuten Bearbeitung
          task.status = "open";
          task.assignedTo = undefined;
          task.leaseExpiresAt = undefined;
        }
      }

      return { ...task };
    });
  }

  /* ======================================================================== */
  /* 5. Selbstaufträge (proposeTask)                                          */
  /* ======================================================================== */

  public async proposeFollowUpTask(
    proposal: TaskProposal,
  ): Promise<ResearchTask> {
    return await this.withClaimLock(async () => {
      const project = this.projects.get(proposal.projectId);
      if (!project) throw new Error(`Project ${proposal.projectId} not found`);

      const parent = this.tasks.get(proposal.parentTaskId);
      if (!parent) {
        throw new Error(`Parent task ${proposal.parentTaskId} not found`);
      }

      const nextDepth = parent.depth + 1;
      if (nextDepth > project.maxDepth) {
        throw new Error(
          `Depth limit exceeded: maximum depth is ${project.maxDepth}, proposed is ${nextDepth}`,
        );
      }

      const estTokens = proposal.estimatedTokens ?? 25_000;
      if (project.usedTokens + estTokens > project.budgetTokens) {
        throw new Error(
          `Project token budget exceeded (${project.usedTokens + estTokens} > ${project.budgetTokens})`,
        );
      }

      const id = `task-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const task: ResearchTask = {
        id,
        projectId: proposal.projectId,
        title: proposal.title,
        description: `[Selbstauftrag von ${proposal.proposedByBotId}] ${proposal.description}`,
        parentTaskId: proposal.parentTaskId,
        depth: nextDepth,
        status: "open",
        budgetTokens: estTokens,
        createdAt: now,
        updatedAt: now,
      };

      this.tasks.set(id, task);
      project.tasksCount = this.getTasksForProject(proposal.projectId).length;
      project.updatedAt = now;

      return task;
    });
  }

  /* ======================================================================== */
  /* 6. Bot-Spenden (Lane 6.3)                                                */
  /* ======================================================================== */

  public async donateBot(input: CreateDonationInput): Promise<ProjectDonation> {
    const project = this.projects.get(input.projectId);
    if (!project) throw new Error(`Project ${input.projectId} not found`);

    const id = `donation-${randomUUID().slice(0, 8)}`;
    const now = new Date();
    const durationDays = input.durationDays ?? 30;
    const expiresAt = new Date(
      now.getTime() + durationDays * 86400000,
    ).toISOString();

    const donation: ProjectDonation = {
      id,
      projectId: input.projectId,
      donorUserId: input.donorUserId,
      botId: input.botId,
      botName: input.botName,
      budgetCredits: input.budgetCredits ?? 500,
      maxTasksPerDay: input.maxTasksPerDay ?? 50,
      tasksCompleted: 0,
      status: "active",
      donatedAt: now.toISOString(),
      expiresAt,
    };

    this.donations.set(id, donation);

    // Bot-Count im Projekt hochzählen
    const activeDonations = Array.from(this.donations.values()).filter(
      (d) => d.projectId === input.projectId && d.status === "active",
    );
    project.botCount = activeDonations.length;
    project.updatedAt = now.toISOString();

    return donation;
  }

  public listProjectDonations(projectId: string): ProjectDonation[] {
    return Array.from(this.donations.values()).filter(
      (d) => d.projectId === projectId,
    );
  }

  /* ======================================================================== */
  /* 7. Reporter-Job & Fortschrittsdokumente (Lane 6.4)                       */
  /* ======================================================================== */

  public async generateProjectReport(
    projectId: string,
  ): Promise<ProjectReport> {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const tasks = this.getTasksForProject(projectId);
    const approvedTasks = tasks.filter((t) => t.status === "approved");
    const activeDonations = this.listProjectDonations(projectId);

    const findings = approvedTasks.map(
      (t) => `• ${t.title}: ${t.resultSummary || "Erfolgreich abgeschlossen"}`,
    );

    const nextTasks = tasks
      .filter((t) => t.status === "open" || t.status === "claimed")
      .slice(0, 5)
      .map((t) => `• ${t.title} (Status: ${t.status})`);

    const reportId = `report-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const report: ProjectReport = {
      id: reportId,
      projectId,
      projectTitle: project.title,
      period: `Berichtsstand ${new Date().toLocaleDateString("de-DE")}`,
      summary: `Das Projekt "${project.title}" hat ${approvedTasks.length} von ${tasks.length} Teilaufgaben mit ${project.botCount || activeDonations.length || 1} aktiven Bots erfolgreich absolviert. Verbrauchte Forschungstokens: ${project.usedTokens.toLocaleString()} / ${project.budgetTokens.toLocaleString()}.`,
      completedTasksCount: approvedTasks.length,
      activeBotsCount: project.botCount || activeDonations.length || 1,
      keyFindings: findings.length > 0 ? findings : ["Initiale Datensammlung läuft."],
      nextSteps: nextTasks.length > 0 ? nextTasks : ["Weitere Teilaufgaben werden dekomponiert."],
      publishedAt: now,
    };

    this.reports.set(reportId, report);
    return report;
  }

  public listProjectReports(projectId: string): ProjectReport[] {
    return Array.from(this.reports.values()).filter(
      (r) => r.projectId === projectId,
    );
  }

  /* ======================================================================== */
  /* 8. Simulation: 100 Bots bearbeiten 500 Tasks ohne Doppel-Claims         */
  /* ======================================================================== */

  public async runSimulation(params: {
    botCount: number;
    taskCount: number;
  }): Promise<{
    success: boolean;
    totalTasks: number;
    completedTasks: number;
    duplicateClaimsDetected: number;
    durationMs: number;
    claimsCount: number;
  }> {
    const start = Date.now();
    const simProjectId = `sim-${randomUUID().slice(0, 6)}`;

    // Simulations-Projekt anlegen (ohne auto-decompose goal)
    await this.createProject({
      id: simProjectId,
      title: "Stress-Test Simulation",
      description: "Simulation mit 100 Bots und 500 Tasks",
      ownerId: "sim-runner",
      budgetTokens: 100_000_000,
      maxDepth: 10,
    });

    // 500 Tasks anlegen
    for (let i = 0; i < params.taskCount; i++) {
      const taskId = `sim-task-${simProjectId}-${i}`;
      this.tasks.set(taskId, {
        id: taskId,
        projectId: simProjectId,
        title: `Simulierte Arbeitseinheit #${i + 1}`,
        description: `Deterministische Testaufgabe #${i + 1}`,
        status: "open",
        depth: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Tracker für Claims, um Doppel-Claims absolut sicher zu prüfen
    const claimedByTask = new Map<string, string[]>();
    let duplicateClaims = 0;

    // 100 Bots parallel arbeiten lassen
    const botWorkers = Array.from({ length: params.botCount }, (_, i) => `bot-${i + 1}`);

    const runBotWorker = async (botId: string) => {
      while (true) {
        const claimResult = await this.claimTask(botId, simProjectId, {
          leaseDurationMs: 60000,
        });
        if (!claimResult) {
          // Keine Tasks mehr frei
          break;
        }

        const { task } = claimResult;
        const currentClaims = claimedByTask.get(task.id) || [];
        currentClaims.push(botId);
        claimedByTask.set(task.id, currentClaims);

        if (currentClaims.length > 1) {
          duplicateClaims++;
        }

        // Kurz simulieren
        await new Promise((r) => setTimeout(r, 2));

        // Submit
        await this.submitTaskResult(task.id, botId, {
          resultSummary: `Simuliertes Ergebnis für ${task.id} durch ${botId}`,
          tokensUsed: 100,
        });

        // Review
        await this.reviewTaskResult(task.id, "sim-reviewer-bot", {
          approved: true,
          comment: "Auto-approved simulation result",
          score: 100,
        });
      }
    };

    // Alle Bots parallel starten
    await Promise.all(botWorkers.map((botId) => runBotWorker(botId)));

    const durationMs = Date.now() - start;
    const projectTasks = this.getTasksForProject(simProjectId);
    const completedTasks = projectTasks.filter((t) => t.status === "approved").length;

    return {
      success: duplicateClaims === 0 && completedTasks === params.taskCount,
      totalTasks: params.taskCount,
      completedTasks,
      duplicateClaimsDetected: duplicateClaims,
      durationMs,
      claimsCount: claimedByTask.size,
    };
  }
}

// Globales Singleton für Lane 6
let globalResearchEngine: ResearchSwarmEngine | null = null;

export function getResearchSwarmEngine(): ResearchSwarmEngine {
  if (!globalResearchEngine) {
    globalResearchEngine = new ResearchSwarmEngine();
  }
  return globalResearchEngine;
}
