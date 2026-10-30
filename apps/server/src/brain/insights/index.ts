import type { Hono as HonoApp } from "hono";
import { brainRootFor, resolveBrainRoot } from "../store";
import { getCachedBrainStructure, invalidateBrainCache } from "./cache";
import { getAgentAccessDetails, listAllAgentsAccess } from "./agent-access";
import { getRecentBrainAccess, recordBrainAccess } from "./access-log";

export * from "./types";
export * from "./analyzer";
export * from "./cache";
export * from "./access-log";
export * from "./agent-access";

export function registerBrainInsightsRoutes(app: HonoApp<any, any, any>): void {
  const getRoot = async () => {
    const rootPath = brainRootFor(null);
    return await resolveBrainRoot(rootPath);
  };

  /**
   * GET /api/brain/structure?companyId=...
   * Fast, cached TF-IDF & thematic structure analysis
   */
  app.get("/api/brain/structure", async (c) => {
    const brain = await getRoot();
    if (!brain.available) {
      return c.json(
        {
          companyId: c.req.query("companyId") || "cnt-kunc",
          nodes: [],
          edges: [],
          lastUpdated: new Date().toISOString(),
          error: brain.reason,
        },
        200,
      );
    }

    const companyId = c.req.query("companyId") || "cnt-kunc";
    const forceRefresh = c.req.query("refresh") === "1" || c.req.query("refresh") === "true";

    try {
      const result = await getCachedBrainStructure(brain.root, companyId, forceRefresh);
      c.header("X-Brain-Cache", result.fromCache ? "HIT" : "MISS");
      c.header("X-Compute-Time-Ms", String(result.durationMs));
      return c.json(result.structure);
    } catch (err: any) {
      return c.json({ error: "Fehler bei der Strukturanalyse: " + (err?.message || String(err)) }, 500);
    }
  });

  /**
   * POST /api/brain/insights/refresh
   * Force cache invalidation & recalculation
   */
  app.post("/api/brain/insights/refresh", async (c) => {
    const brain = await getRoot();
    if (brain.available) {
      invalidateBrainCache(brain.root);
      const res = await getCachedBrainStructure(brain.root, "cnt-kunc", true);
      return c.json({ success: true, computeMs: res.durationMs });
    }
    invalidateBrainCache();
    return c.json({ success: true, message: "Cache geleert" });
  });

  /**
   * GET /api/brain/agent-access/:agentId
   * Permissions, accessible trees, and access logs for an agent
   */
  app.get("/api/brain/agent-access/:agentId", async (c) => {
    const brain = await getRoot();
    const agentId = c.req.param("agentId");

    if (!brain.available) {
      return c.json(
        {
          agentId,
          slug: agentId,
          name: agentId,
          areas: [],
          tree: [],
          recentAccess: [],
          stats: { totalReadable: 0, totalWritable: 0, totalFiles: 0 },
          error: brain.reason,
        },
        200,
      );
    }

    try {
      const details = await getAgentAccessDetails(brain.root, agentId);
      return c.json(details);
    } catch (err: any) {
      return c.json({ error: "Fehler beim Laden der Agentenrechte: " + (err?.message || String(err)) }, 500);
    }
  });

  /**
   * GET /api/brain/agent-access
   * List all agents and their Spark permission summaries
   */
  app.get("/api/brain/agent-access", async (c) => {
    const brain = await getRoot();
    const specificAgent = c.req.query("agentId");

    if (!brain.available) {
      return c.json({ available: false, reason: brain.reason, agents: [] });
    }

    if (specificAgent) {
      const details = await getAgentAccessDetails(brain.root, specificAgent);
      return c.json(details);
    }

    try {
      const list = await listAllAgentsAccess(brain.root);
      const recent = getRecentBrainAccess(undefined, 20);
      return c.json({
        available: true,
        agents: list,
        recentAccess: recent,
      });
    } catch (err: any) {
      return c.json({ error: "Fehler beim Abrufen der Agenten-Zugriffsliste: " + (err?.message || String(err)) }, 500);
    }
  });

  /**
   * POST /api/brain/agent-access/log
   * Record a file access event by an agent
   */
  app.post("/api/brain/agent-access/log", async (c) => {
    try {
      const body = await c.req.json();
      if (!body.agentId || !body.path || !body.action) {
        return c.json({ error: "agentId, path und action sind erforderlich" }, 400);
      }

      const logged = recordBrainAccess({
        agentId: body.agentId,
        action: body.action,
        path: body.path,
        allowed: body.allowed ?? true,
        durationMs: body.durationMs ?? 0,
      });

      return c.json({ success: true, log: logged });
    } catch (err: any) {
      return c.json({ error: "Ungültiger Request: " + (err?.message || String(err)) }, 400);
    }
  });
}

export default registerBrainInsightsRoutes;
