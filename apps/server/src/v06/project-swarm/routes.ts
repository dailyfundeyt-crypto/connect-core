/**
 * Project-Swarm: REST Endpoints (v06 / A27)
 *
 * Stellt die REST-Schnittstellen für die Schwarm-Steuerung bereit:
 * - POST /api/v06/project-swarm/:projectId/start  (Starten oder Fortsetzen)
 * - POST /api/v06/project-swarm/:projectId/pause  (Sofortiger Pause-Knopf)
 * - GET  /api/v06/project-swarm/:projectId/status (Aktueller Status, Leases & Metriken)
 *
 * Alle Routen geschützt über FLAGS_V06.projectSwarm.
 */

import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { getFlag } from "../../contracts/v06/flags";
import { swarmScheduler, type SwarmRunConfig } from "./scheduler";
import { leaseManager } from "./lease";
import { quotaManager } from "./quota";
import { progressReporter } from "./progressReporter";
import { getProjectById } from "../social/projects";
import { goalDecomposer } from "./decomposer";
import { cliModelAggregator } from "./cliModelAggregator";

export interface ProjectSwarmRouteOptions {
  requireUser?: MiddlewareHandler<any>;
}

export function createProjectSwarmRouter(options: ProjectSwarmRouteOptions = {}): Hono {
  const router = new Hono();

  // Feature-Flag Guard
  router.use("*", async (c, next) => {
    if (!getFlag("projectSwarm")) {
      return c.json({ error: "Feature 'projectSwarm' is currently disabled." }, 404);
    }
    return next();
  });

  // Optional: User-Authentifizierung
  if (options.requireUser) {
    router.use("/project-swarm/*", options.requireUser);
  }

  /* ======================================================================== */
  /* 1. POST /api/v06/project-swarm/:projectId/start                          */
  /* ======================================================================== */
  router.post("/project-swarm/:projectId/start", async (c) => {
    try {
      const projectId = c.req.param("projectId");
      if (!projectId) {
        return c.json({ error: "projectId fehlt im URL-Pfad." }, 400);
      }

      let body: any = {};
      try {
        body = await c.req.json();
      } catch {
        // Leerer Body ist erlaubt
      }

      // Prüfen, ob Projekt existiert (oder in Memory registriert ist)
      const project = await getProjectById(projectId).catch(() => null);
      if (project) {
        swarmScheduler.registerProject(project);

        // Falls noch keine Tasks vorhanden sind und goal vorhanden ist: automatisch dekomponieren
        const existingTasks = swarmScheduler.getTasks(projectId);
        if (existingTasks.length === 0 && project.goal) {
          const generatedTasks = await goalDecomposer.decomposeGoal(projectId, project.goal);
          swarmScheduler.loadTasks(generatedTasks);
        }
      }

      const config: SwarmRunConfig = {
        maxParallelBots: body.maxParallelBots ? Number(body.maxParallelBots) : undefined,
        budgetTokens: body.budgetTokens ? Number(body.budgetTokens) : undefined,
        reportIntervalTasks: body.reportIntervalTasks ? Number(body.reportIntervalTasks) : undefined,
        allowExternalActions: Boolean(body.allowExternalActions),
      };

      const run = await swarmScheduler.startSwarmRun(projectId, config);

      return c.json({
        ok: true,
        run,
      });
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Starten des Schwarms." }, 500);
    }
  });

  /* ======================================================================== */
  /* 2. POST /api/v06/project-swarm/:projectId/pause                          */
  /* ======================================================================== */
  router.post("/project-swarm/:projectId/pause", async (c) => {
    try {
      const projectId = c.req.param("projectId");
      if (!projectId) {
        return c.json({ error: "projectId fehlt im URL-Pfad." }, 400);
      }

      const run = await swarmScheduler.pauseSwarmRun(projectId);

      return c.json({
        ok: true,
        run,
      });
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Pausieren des Schwarms." }, 500);
    }
  });

  /* ======================================================================== */
  /* 3. GET /api/v06/project-swarm/:projectId/status                          */
  /* ======================================================================== */
  router.get("/project-swarm/:projectId/status", async (c) => {
    try {
      const projectId = c.req.param("projectId");
      if (!projectId) {
        return c.json({ error: "projectId fehlt im URL-Pfad." }, 400);
      }

      const run = swarmScheduler.getSwarmRunState(projectId) || null;
      const activeLeases = leaseManager.listActiveLeases(projectId);
      const allTasks = swarmScheduler.getTasks(projectId);

      const taskStats = {
        total: allTasks.length,
        todo: allTasks.filter((t) => t.status === "todo").length,
        claimed: allTasks.filter((t) => t.status === "claimed").length,
        done: allTasks.filter((t) => t.status === "done").length,
        blocked: allTasks.filter((t) => t.status === "blocked").length,
      };

      const budget = quotaManager.getProjectBudget(projectId);
      const latestReport = progressReporter.getLatestReport(projectId) || null;

      return c.json({
        ok: true,
        run,
        activeLeases,
        tasks: taskStats,
        budget: {
          budgetTokens: budget.budgetTokens,
          usedTokens: budget.usedTokens,
          exceeded: quotaManager.isProjectBudgetExceeded(projectId),
        },
        latestReport,
      });
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Abrufen des Schwarm-Status." }, 500);
    }
  });

  /* ======================================================================== */
  /* 4. GET /api/v06/project-swarm/cli-usage/summary (Einstellungen-Übersicht)*/
  /* ======================================================================== */
  router.get("/project-swarm/cli-usage/summary", async (c) => {
    try {
      const summary = cliModelAggregator.getAggregatedUsage();
      return c.json({
        ok: true,
        summary,
      });
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Abrufen der CLI-Nutzung." }, 500);
    }
  });

  /* ======================================================================== */
  /* 5. GET /api/v06/project-swarm/companies/:companyId/cli-profile           */
  /* ======================================================================== */
  router.get("/project-swarm/companies/:companyId/cli-profile", async (c) => {
    try {
      const companyId = c.req.param("companyId");
      if (!companyId) {
        return c.json({ error: "companyId ist erforderlich." }, 400);
      }
      const profile = cliModelAggregator.getAggregatedUsage(companyId);
      const badgeText = cliModelAggregator.formatCompanyProfileBadge(profile, `Firma (${companyId})`);

      return c.json({
        ok: true,
        companyId,
        profile,
        badgeText,
      });
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Abrufen des Firmen-CLI-Profils." }, 500);
    }
  });

  return router;
}

/**
 * Registriert die Project-Swarm Routen auf einer bestehenden Hono-Applikation
 */
export function registerProjectSwarmRoutes(app: Hono<any>, options: ProjectSwarmRouteOptions = {}): void {
  const router = createProjectSwarmRouter(options);
  app.route("/api/v06", router);
}
