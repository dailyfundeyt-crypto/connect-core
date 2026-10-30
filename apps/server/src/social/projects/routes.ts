/**
 * Social Research Projects & Swarm Tasks Routes (Lane 6)
 *
 * Stellt die Endpunkte für /api/projects/* und /api/swarm/tasks/* bereit.
 */

import { Hono } from "hono";
import { getResearchSwarmEngine } from "../../swarm/research-engine";
import { getProjectAccountService } from "./project-account-service";

export const projectsApi = new Hono();
export const swarmTasksApi = new Hono();

/* ========================================================================== */
/* Projects Endpunkte: /api/projects                                          */
/* ========================================================================== */

// GET /api/projects - Alle Projekte auflisten
projectsApi.get("/", async (c) => {
  const engine = getResearchSwarmEngine();
  const status = c.req.query("status");
  const companyId = c.req.query("companyId");
  const ownerId = c.req.query("ownerId");

  const projects = await engine.listProjects({ status, companyId, ownerId });
  return c.json({ ok: true, projects });
});

// POST /api/projects - Neues Projekt erstellen
projectsApi.post("/", async (c) => {
  try {
    const engine = getResearchSwarmEngine();
    const accountService = getProjectAccountService();
    const body = await c.req.json();

    if (!body.title || !body.description) {
      return c.json(
        { ok: false, error: "Titel und Beschreibung sind erforderlich" },
        400,
      );
    }

    const project = await engine.createProject({
      title: body.title,
      description: body.description,
      goal: body.goal,
      companyId: body.companyId,
      ownerId: body.ownerId || "current-user",
      githubRepoUrl: body.githubRepoUrl,
      nonProfit: body.nonProfit ?? true,
      maxDepth: body.maxDepth ?? 4,
      budgetTokens: body.budgetTokens ?? 10_000_000,
      tags: body.tags,
      category: body.category,
    });

    // Projekt-Sozial-Account anlegen (Prompt 6.4)
    const account = accountService.ensureProjectAccount(project);

    return c.json({ ok: true, project, account }, 201);
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500);
  }
});

// GET /api/projects/:id - Einzelnes Projekt
projectsApi.get("/:id", async (c) => {
  const engine = getResearchSwarmEngine();
  const accountService = getProjectAccountService();
  const id = c.req.param("id");
  const project = await engine.getProject(id);
  if (!project) {
    return c.json({ ok: false, error: "Projekt nicht gefunden" }, 404);
  }
  const account = accountService.getProjectAccount(id);
  return c.json({ ok: true, project, account });
});

// GET /api/projects/:id/tasks - Tasks des Projekts (DAG)
projectsApi.get("/:id/tasks", async (c) => {
  const engine = getResearchSwarmEngine();
  const id = c.req.param("id");
  const project = await engine.getProject(id);
  if (!project) {
    return c.json({ ok: false, error: "Projekt nicht gefunden" }, 404);
  }
  const tasks = engine.getTasksForProject(id);
  return c.json({ ok: true, projectId: id, tasks });
});

// POST /api/projects/:id/decompose - Rekursive Zerlegung des Ziels
projectsApi.post("/:id/decompose", async (c) => {
  try {
    const engine = getResearchSwarmEngine();
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const project = await engine.getProject(id);
    if (!project) {
      return c.json({ ok: false, error: "Projekt nicht gefunden" }, 404);
    }
    const goal = body.goal || project.goal || project.description;
    const tasks = await engine.decomposeProjectGoal(id, goal, {
      maxTasks: body.maxTasks,
    });
    return c.json({ ok: true, count: tasks.length, tasks });
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500);
  }
});

// POST /api/projects/:id/donations - Bot spenden (Prompt 6.3)
projectsApi.post("/:id/donations", async (c) => {
  try {
    const engine = getResearchSwarmEngine();
    const id = c.req.param("id");
    const body = await c.req.json();

    if (!body.botId || !body.botName) {
      return c.json(
        { ok: false, error: "botId und botName sind erforderlich" },
        400,
      );
    }

    const donation = await engine.donateBot({
      projectId: id,
      donorUserId: body.donorUserId || "current-user",
      botId: body.botId,
      botName: body.botName,
      budgetCredits: body.budgetCredits,
      maxTasksPerDay: body.maxTasksPerDay,
      durationDays: body.durationDays,
    });

    return c.json({ ok: true, donation }, 201);
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500);
  }
});

// GET /api/projects/:id/donations - Gespendete Bots abrufen
projectsApi.get("/:id/donations", async (c) => {
  const engine = getResearchSwarmEngine();
  const id = c.req.param("id");
  const donations = engine.listProjectDonations(id);
  return c.json({ ok: true, projectId: id, donations });
});

// POST /api/projects/:id/report - Reporter-Job: Fortschrittsbericht erstellen & auf Timeline posten (Prompt 6.4)
projectsApi.post("/:id/report", async (c) => {
  try {
    const accountService = getProjectAccountService();
    const id = c.req.param("id");
    const result = await accountService.runReporterJob(id);
    return c.json({ ok: true, report: result.report, socialPost: result.socialPost });
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500);
  }
});

// GET /api/projects/:id/reports - Bisherige Berichte
projectsApi.get("/:id/reports", async (c) => {
  const engine = getResearchSwarmEngine();
  const id = c.req.param("id");
  const reports = engine.listProjectReports(id);
  return c.json({ ok: true, projectId: id, reports });
});

// GET /api/projects/:id/posts - Social-Posts des Projekts
projectsApi.get("/:id/posts", async (c) => {
  const accountService = getProjectAccountService();
  const id = c.req.param("id");
  const posts = accountService.getPublishedPosts(id);
  return c.json({ ok: true, projectId: id, posts });
});

// POST /api/projects/:id/github/sync - GitHub Issues importieren (Prompt 6.4)
projectsApi.post("/:id/github/sync", async (c) => {
  try {
    const accountService = getProjectAccountService();
    const engine = getResearchSwarmEngine();
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));

    const project = await engine.getProject(id);
    if (!project) {
      return c.json({ ok: false, error: "Projekt nicht gefunden" }, 404);
    }

    const repoUrl = body.repoUrl || project.githubRepoUrl;
    if (!repoUrl) {
      return c.json(
        { ok: false, error: "Keine GitHub-Repository-URL konfiguriert" },
        400,
      );
    }

    const result = await accountService.syncGithubIssues(id, repoUrl);
    return c.json({ ok: true, ...result });
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500);
  }
});

/* ========================================================================== */
/* Swarm Tasks Endpunkte: /api/swarm/tasks                                    */
/* ========================================================================== */

// GET /api/swarm/tasks - Alle Tasks auflisten (Integration 2026-10-22), Filter: projectId, status
swarmTasksApi.get("/", async (c) => {
  const engine = getResearchSwarmEngine();
  const projectId = c.req.query("projectId");
  const status = c.req.query("status");
  const projects = projectId
    ? [{ id: projectId }]
    : await engine.listProjects({});
  let tasks = projects.flatMap((p: { id: string }) => engine.getTasksForProject(p.id));
  if (status) tasks = tasks.filter((t: any) => t.status === status);
  return c.json({ ok: true, tasks, total: tasks.length });
});
// POST /api/swarm/tasks/claim - Task atomar mit Lease claimen
swarmTasksApi.post("/claim", async (c) => {
  try {
    const engine = getResearchSwarmEngine();
    const body = await c.req.json();
    const botId = body.botId || `bot-worker-${Date.now()}`;
    const projectId = body.projectId;
    const leaseDurationMs = body.leaseDurationMs;
    const specificTaskId = body.taskId;

    const result = await engine.claimTask(botId, projectId, {
      leaseDurationMs,
      specificTaskId,
    });

    if (!result) {
      return c.json(
        { ok: false, message: "Keine verfügbaren Tasks für diesen Bot" },
        200,
      );
    }

    return c.json({ ok: true, ...result });
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500);
  }
});

// POST /api/swarm/tasks/heartbeat - Lease verlängern
swarmTasksApi.post("/heartbeat", async (c) => {
  try {
    const engine = getResearchSwarmEngine();
    const body = await c.req.json();
    if (!body.claimId || !body.botId) {
      return c.json(
        { ok: false, error: "claimId und botId sind erforderlich" },
        400,
      );
    }
    const success = await engine.heartbeatClaim(
      body.claimId,
      body.botId,
      body.extensionMs,
    );
    return c.json({ ok: success });
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500);
  }
});

// POST /api/swarm/tasks/submit - Ergebnis einreichen
swarmTasksApi.post("/submit", async (c) => {
  try {
    const engine = getResearchSwarmEngine();
    const body = await c.req.json();
    if (!body.taskId || !body.botId || !body.resultSummary) {
      return c.json(
        {
          ok: false,
          error: "taskId, botId und resultSummary sind erforderlich",
        },
        400,
      );
    }

    const result = await engine.submitTaskResult(body.taskId, body.botId, {
      resultSummary: body.resultSummary,
      resultUrl: body.resultUrl,
      outputData: body.outputData,
      tokensUsed: body.tokensUsed,
    });

    return c.json({ ok: true, result });
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500);
  }
});

// POST /api/swarm/tasks/review - Peer-Review durchführen
swarmTasksApi.post("/review", async (c) => {
  try {
    const engine = getResearchSwarmEngine();
    const body = await c.req.json();
    if (!body.taskId || !body.reviewerId || body.approved === undefined) {
      return c.json(
        {
          ok: false,
          error: "taskId, reviewerId und approved sind erforderlich",
        },
        400,
      );
    }

    const task = await engine.reviewTaskResult(body.taskId, body.reviewerId, {
      approved: Boolean(body.approved),
      comment: body.comment || (body.approved ? "Approved" : "Needs revision"),
      score: body.score,
    });

    return c.json({ ok: true, task });
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500);
  }
});

// POST /api/swarm/tasks/propose - Selbstauftrag (Folge-Task vorschlagen)
swarmTasksApi.post("/propose", async (c) => {
  try {
    const engine = getResearchSwarmEngine();
    const body = await c.req.json();
    if (
      !body.projectId ||
      !body.parentTaskId ||
      !body.title ||
      !body.proposedByBotId
    ) {
      return c.json(
        {
          ok: false,
          error:
            "projectId, parentTaskId, title und proposedByBotId sind erforderlich",
        },
        400,
      );
    }

    const task = await engine.proposeFollowUpTask({
      projectId: body.projectId,
      parentTaskId: body.parentTaskId,
      title: body.title,
      description: body.description || "",
      proposedByBotId: body.proposedByBotId,
      estimatedTokens: body.estimatedTokens,
    });

    return c.json({ ok: true, task }, 201);
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 400);
  }
});

// POST /api/swarm/tasks/simulate - 100 Bots 500 Tasks Stress-Test (Akzeptanzkriterium Prompt 6.2)
swarmTasksApi.post("/simulate", async (c) => {
  try {
    const engine = getResearchSwarmEngine();
    const body = await c.req.json().catch(() => ({}));
    const botCount = body.botCount ?? 100;
    const taskCount = body.taskCount ?? 500;

    const report = await engine.runSimulation({ botCount, taskCount });
    return c.json({ ok: true, simulation: report });
  } catch (error: any) {
    return c.json({ ok: false, error: error.message }, 500);
  }
});
