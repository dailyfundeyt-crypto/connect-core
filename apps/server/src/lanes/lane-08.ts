import { Hono } from "hono";
import type { Hono as HonoApp } from "hono";
import type { Database } from "../db/client";
import { createStoreRouter } from "../plugins/store/routes";
import { SwarmRunsManager } from "../swarm/adapters/swarm-runs-manager";
import type { SwarmJobType, LlmProvider } from "../contracts/swarm-v3";

export function createSwarmRunsRouter(database?: Database): Hono {
  const router = new Hono();
  const manager = SwarmRunsManager.getInstance(database);

  router.get("/", (c) => {
    return c.json({
      success: true,
      runs: manager.listRuns(),
    });
  });

  router.post("/", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const jobType: SwarmJobType = body.jobType || "generic";
      const name = body.name || `Swarm Run ${jobType}`;
      const payload = body.payload || {};
      const provider: LlmProvider = body.provider || "gemini-cli";

      const result = await manager.createRun({
        name,
        jobType,
        payload,
        provider,
      });

      return c.json({ success: true, ...result }, 201);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 400);
    }
  });

  router.get("/:runId", (c) => {
    const runId = c.req.param("runId");
    const run = manager.getRun(runId);
    if (!run) {
      return c.json({ success: false, error: "Run nicht gefunden" }, 404);
    }
    return c.json({ success: true, run });
  });

  router.get("/jobs/:jobId", (c) => {
    const jobId = c.req.param("jobId");
    const job = manager.getJob(jobId);
    if (!job) {
      return c.json({ success: false, error: "Job nicht gefunden" }, 404);
    }
    return c.json({ success: true, job });
  });

  return router;
}

/**
 * Lane 08: Plugin & Skill Store + Swarm-v3 Runs Manager (/api/swarm/runs/*)
 */
export function registerLane08Routes(app: HonoApp<any, any, any>, database?: Database): void {
  const storeRouter = createStoreRouter();
  app.route("/api/store", storeRouter);
  app.route("/api/swarm/runs", createSwarmRunsRouter(database));
}

export default registerLane08Routes;
