import { Hono } from "hono";
import type { Database } from "../../db/client";
import { SimulationService } from "./service";
import {
  StartSimulationRequestSchema,
  InjectSimEventRequestSchema,
} from "../../contracts/swarm-v3/api";

export function createSimulationRouter(db?: Database): Hono {
  const router = new Hono();
  const service = new SimulationService(db);

  // GET /api/simulation/health or /status - engine health and adapter state
  router.get("/health", async (c) => {
    const status = await service.getEngineStatus();
    return c.json({
      status: "ok",
      service: "simulation-engine",
      ...status,
    });
  });

  router.get("/status", async (c) => {
    const status = await service.getEngineStatus();
    return c.json({
      success: true,
      ...status,
    });
  });

  // GET /api/simulation/scenarios - list preset scenarios from $100M Money Models
  router.get("/scenarios", (c) => {
    const scenarios = service.listPresetScenarios();
    return c.json({
      success: true,
      count: scenarios.length,
      scenarios,
    });
  });

  // POST /api/simulation/extract-seed - preview extracted entities/relations from Spark plans
  router.post("/extract-seed", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const filePaths = Array.isArray(body.filePaths) ? body.filePaths : undefined;
      const preview = service.extractSeedPreview(filePaths);
      return c.json({
        success: true,
        preview,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 400);
    }
  });

  // GET /api/simulation - list simulation runs
  router.get("/", async (c) => {
    const runs = await service.listRuns();
    return c.json({
      success: true,
      count: runs.length,
      runs,
    });
  });

  // POST /api/simulation - start new simulation run
  router.post("/", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = StartSimulationRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            success: false,
            error: "Invalid simulation start request",
            issues: parsed.error.issues,
          },
          400
        );
      }

      const result = await service.startRun({
        name: parsed.data.name,
        seed: parsed.data.seed,
        engine: parsed.data.engine,
        planDocIds: parsed.data.planDocIds,
        planFilePaths: (body as any).planFilePaths,
      });

      return c.json({
        success: true,
        run: result.run,
        initialGraph: result.initialGraph,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  // GET /api/simulation/:id - get run status
  router.get("/:id", async (c) => {
    const runId = c.req.param("id");
    const run = await service.getRun(runId);
    if (!run) {
      return c.json({ success: false, error: `Simulation run '${runId}' not found` }, 404);
    }
    return c.json({
      success: true,
      run,
    });
  });

  // GET /api/simulation/:id/graph - get entities and relations
  router.get("/:id/graph", async (c) => {
    const runId = c.req.param("id");
    const graph = await service.getGraph(runId);
    return c.json({
      success: true,
      runId,
      ...graph,
    });
  });

  // POST /api/simulation/inject or POST /api/simulation/:id/inject - god's-eye variable injection
  router.post("/inject", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = InjectSimEventRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          {
            success: false,
            error: "Invalid injection request",
            issues: parsed.error.issues,
          },
          400
        );
      }

      const injection = await service.injectEvent({
        runId: parsed.data.runId,
        tick: parsed.data.tick,
        type: parsed.data.type,
        payload: parsed.data.payload,
      });

      return c.json({
        success: true,
        injection,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  router.post("/:id/inject", async (c) => {
    try {
      const runId = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      const injection = await service.injectEvent({
        runId,
        tick: body.tick,
        type: body.type || "gods_eye_variable",
        payload: body.payload || {},
      });

      return c.json({
        success: true,
        injection,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  // POST /api/simulation/:id/step - execute simulation tick(s)
  router.post("/:id/step", async (c) => {
    try {
      const runId = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      const count = typeof body.count === "number" ? body.count : 1;
      const ticks = await service.stepRun(runId, count);

      return c.json({
        success: true,
        runId,
        ticksExecuted: ticks.length,
        ticks,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  // GET /api/simulation/:id/report - get or generate simulation report
  router.get("/:id/report", async (c) => {
    try {
      const runId = c.req.param("id");
      const report = await service.getReport(runId);
      return c.json({
        success: true,
        report,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message }, 500);
    }
  });

  return router;
}
