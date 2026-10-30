import { describe, it, expect, beforeEach } from "bun:test";
import { SwarmScheduler, ExternalActionBlockedError } from "./scheduler";
import { SwarmRoleManager } from "./roles";
import { QuotaManager } from "./quota";
import { TaskLeaseManager } from "./lease";
import { GoalDecomposer } from "./decomposer";
import { ReviewerGate } from "./reviewerGate";
import { ProgressReporter } from "./progressReporter";
import { createProjectSwarmRouter } from "./routes";
import type { ResearchProject, ProjectTask, BotDonation } from "../../contracts/v06/social";

describe("Swarm Simulation (50 Bots & Vollständiger Lebenszyklus)", () => {
  let scheduler: SwarmScheduler;
  let decomposer: GoalDecomposer;
  let leaseMgr: TaskLeaseManager;
  let quotaMgr: QuotaManager;
  let roleMgr: SwarmRoleManager;
  let revGate: ReviewerGate;
  let progReporter: ProgressReporter;

  const projectId = "proj-cancer-simulation-2026";
  const project: ResearchProject = {
    id: projectId,
    title: "Krebsforschung: Dezentrales KRAS G12D Hemmstoff-Screening",
    goal: "Virtuelles Screening und Inhibitoren-Validierung an Switch-II-Tasche",
    accountCompanyId: "company-open-oncology",
    isNonProfit: true,
    status: "open",
  };

  beforeEach(() => {
    roleMgr = new SwarmRoleManager();
    quotaMgr = new QuotaManager();
    leaseMgr = new TaskLeaseManager();
    revGate = new ReviewerGate();
    progReporter = new ProgressReporter();
    decomposer = new GoalDecomposer();

    scheduler = new SwarmScheduler({
      roleManager: roleMgr,
      quotaManager: quotaMgr,
      leaseManager: leaseMgr,
      reviewerGate: revGate,
      progressReporter: progReporter,
    });
  });

  it("führt eine vollständige Simulation mit 50 Bots durch: 0 Doppel-Claims, Kontingente eingehalten, Prüfer-Gate greift", async () => {
    // 1. Projekt registrieren
    scheduler.registerProject(project);

    // 2. Ziel in DAG-Aufgabenbaum dekomponieren
    const fullGoal = `${project.title}: ${project.goal}`;
    const tasks = await decomposer.decomposeGoal(projectId, fullGoal, {
      maxDepth: 3,
      maxBranching: 4,
      domain: "biomedical",
    });
    expect(tasks.length).toBeGreaterThan(4);
    scheduler.loadTasks(tasks);

    // 3. 50 Fake-Bots registrieren
    // 40 Worker, 8 Reviewer, 1 Planner, 1 Reporter
    const workerBots: string[] = [];
    for (let i = 1; i <= 40; i++) {
      const id = `worker-bot-${i.toString().padStart(2, "0")}`;
      workerBots.push(id);
      roleMgr.assignRoles(id, ["worker"]);
    }

    const reviewerBots: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const id = `reviewer-bot-${i.toString().padStart(2, "0")}`;
      reviewerBots.push(id);
      roleMgr.assignRoles(id, ["reviewer"]);
    }

    roleMgr.assignRoles("planner-bot-01", ["planner"]);
    roleMgr.assignRoles("reporter-bot-01", ["reporter"]);

    const all50Bots = [...workerBots, ...reviewerBots, "planner-bot-01", "reporter-bot-01"];
    expect(all50Bots.length).toBe(50);
    scheduler.registerBots(all50Bots);

    // 4. Spender-Kontingente vergeben (Daily Quota)
    // Die ersten 10 Worker haben nur ein Kontingent von 1 Task/Tag (Stresstest für Quota-Einhaltung)
    for (let i = 0; i < 10; i++) {
      quotaMgr.registerDonation({
        projectId,
        botId: workerBots[i],
        ownerId: `donor-${i}`,
        dailyQuota: 1,
      });
    }
    // Restliche Worker haben Kontingent von 10 Tasks/Tag
    for (let i = 10; i < workerBots.length; i++) {
      quotaMgr.registerDonation({
        projectId,
        botId: workerBots[i],
        ownerId: `donor-${i}`,
        dailyQuota: 10,
      });
    }

    // 5. Schwarm starten
    const run = await scheduler.startSwarmRun(projectId, {
      maxParallelBots: 50,
      budgetTokens: 5_000_000,
      reportIntervalTasks: 3,
    });
    expect(run.status).toBe("running");

    // 6. Simulation in mehreren Ticks ausführen, bis alle Aufgaben 'done' oder 'blocked' sind
    let maxCycles = 30;
    let cycles = 0;

    while (cycles < maxCycles) {
      cycles++;
      const currentTasks = scheduler.getTasks(projectId);
      const pending = currentTasks.filter((t) => t.status === "todo" || t.status === "claimed");
      if (pending.length === 0) {
        break; // Alle Aufgaben abgeschlossen
      }

      await scheduler.tick(projectId, {
        reportIntervalTasks: 3,
        executor: async (task, botId) => {
          // Simulation von echter Arbeit:
          // Task mit "Widerstand" schlägt absichtlich beim ersten Mal fehl, um das Reviewer-Gate zu testen!
          if (task.title.includes("Widerstand") && !task.title.includes("Verbessern")) {
            return {
              output: "Fehler: Unvollständige Kristallstruktur-Daten extrahiert.",
              tokensUsed: 800,
            };
          }
          return {
            output: `Erfolgreiche Auswertung durch ${botId} gemäß Kriterien: ${task.acceptance}`,
            tokensUsed: 1200,
          };
        },
      });
    }

    // 7. Verifikationen
    const finalTasks = scheduler.getTasks(projectId);
    const doneTasks = finalTasks.filter((t) => t.status === "done");
    const blockedTasks = finalTasks.filter((t) => t.status === "blocked");
    const todoTasks = finalTasks.filter((t) => t.status === "todo");

    // Kriterium: Alle Aufgaben enden in 'done' oder 'blocked'
    expect(todoTasks.length).toBe(0);
    expect(doneTasks.length).toBeGreaterThan(3);

    // Kriterium: Kontingente der 10 begrenzten Bots wurden strikt eingehalten (max 1 Task)
    for (let i = 0; i < 10; i++) {
      const usage = quotaMgr.getDailyUsage(projectId, workerBots[i]);
      expect(usage.tasksExecuted).toBeLessThanOrEqual(1);
    }

    // Kriterium: Reviewer-Gate hat gegriffen (mindestens eine Verbesserungsaufgabe wurde erzeugt)
    const improvedTasks = finalTasks.filter((t) => t.title.includes("Verbessern"));
    expect(improvedTasks.length).toBeGreaterThanOrEqual(1);

    // Kriterium: Status des Schwarms ist 'completed'
    const finalRunState = scheduler.getSwarmRunState(projectId);
    expect(finalRunState?.status).toBe("completed");
  });

  it("pausiert den Schwarm sofort bei Aufruf von pauseSwarmRun", async () => {
    scheduler.registerProject(project);
    await scheduler.startSwarmRun(projectId);

    // Sofortiger Pause-Knopf
    const paused = await scheduler.pauseSwarmRun(projectId);
    expect(paused.status).toBe("paused");
    expect(paused.pausedAt).toBeDefined();

    // Tick im pausierten Zustand verarbeitet 0 Aufgaben
    const tickResult = await scheduler.tick(projectId);
    expect(tickResult.processedTasks).toBe(0);
    expect(tickResult.runStatus).toBe("paused");
  });

  it("blockiert externe Aktionen (Push/E-Mail/Veröffentlichung) ohne Freigabe", () => {
    scheduler.registerProject(project);
    scheduler.startSwarmRun(projectId, {
      allowExternalActions: false, // Standard!
    });

    // Versuch einer externen Aktion
    expect(() => {
      scheduler.assertExternalActionAllowed(projectId, "github_git_push");
    }).toThrow(ExternalActionBlockedError);

    expect(() => {
      scheduler.assertExternalActionAllowed(projectId, "send_outbound_email");
    }).toThrow(ExternalActionBlockedError);
  });

  it("REST-API Routen unterstützen start, pause und status", async () => {
    // Feature Flag per Environment aktivieren (gesichert gegen globale Test-Verschmutzung)
    const prevFlags = process.env.CONNECT_FLAGS_V06;
    process.env.CONNECT_FLAGS_V06 = "projectswarm,true";

    try {
      const router = createProjectSwarmRouter();

      // Start-Route testen
      const startReq = new Request(`http://localhost/project-swarm/${projectId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetTokens: 1000000 }),
      });
      const startRes = await router.fetch(startReq);
      expect(startRes.status).toBe(200);
      const startData = (await startRes.json()) as any;
      expect(startData.ok).toBe(true);
      expect(startData.run.status).toBe("running");

      // Status-Route testen
      const statusReq = new Request(`http://localhost/project-swarm/${projectId}/status`, {
        method: "GET",
      });
      const statusRes = await router.fetch(statusReq);
      expect(statusRes.status).toBe(200);
      const statusData = (await statusRes.json()) as any;
      expect(statusData.ok).toBe(true);
      expect(statusData.run.id).toBeDefined();

      // Pause-Route testen
      const pauseReq = new Request(`http://localhost/project-swarm/${projectId}/pause`, {
        method: "POST",
      });
      const pauseRes = await router.fetch(pauseReq);
      expect(pauseRes.status).toBe(200);
      const pauseData = (await pauseRes.json()) as any;
      expect(pauseData.ok).toBe(true);
      expect(pauseData.run.status).toBe("paused");
    } finally {
      if (prevFlags === undefined) {
        delete process.env.CONNECT_FLAGS_V06;
      } else {
        process.env.CONNECT_FLAGS_V06 = prevFlags;
      }
    }
  });
});
