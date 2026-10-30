/**
 * Hono REST API Router for Spark-Learn Knowledge Graph (Lane 3)
 * Route Prefix: /api/brain/learn/graph
 *
 * Endpoints:
 * - GET  /api/brain/learn/graph/data       - Full multi-layer graph payload (concepts, notes, clusters, tours)
 * - GET  /api/brain/learn/graph/clusters   - Community clusters with top concepts and metrics
 * - GET  /api/brain/learn/graph/tours      - Guided didactic learning tours
 * - GET  /api/brain/learn/graph/tours/:id  - Specific tour with ordered steps
 * - POST /api/brain/learn/graph/tours      - Generate custom tour for cluster
 * - POST /api/brain/learn/graph/refresh    - Trigger concept extraction & Louvain re-clustering
 * - GET  /api/brain/learn/graph/stats      - High-level graph and modularity statistics
 */

import { Hono } from "hono";
import type { Database } from "../../../db/client";
import { getConceptGraphService } from "./service";

export function createConceptGraphRouter(database?: Database): Hono {
  const router = new Hono();
  const service = getConceptGraphService(database);

  /**
   * GET /api/brain/learn/graph/data
   * Query multi-layer concept & note graph with LOD filtering
   */
  router.get("/data", async (c) => {
    try {
      const layer = (c.req.query("layer") as any) || "concepts";
      const clusterId = c.req.query("cluster");
      const search = c.req.query("search");
      const minDegree = c.req.query("minDegree") ? Number(c.req.query("minDegree")) : 0;
      const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 1500;

      const payload = await service.getGraphPayload(undefined, {
        layer,
        clusterId,
        search,
        minDegree,
        limit,
      });

      return c.json({ success: true, ...payload }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * GET /api/brain/learn/graph/clusters
   * Returns list of detected Louvain community clusters
   */
  router.get("/clusters", async (c) => {
    try {
      const clusters = service.getClusters();
      return c.json({ success: true, clusters }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * GET /api/brain/learn/graph/tours
   * Returns list of guided learning tours
   */
  router.get("/tours", async (c) => {
    try {
      const tours = service.getTours();
      return c.json({ success: true, tours }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * GET /api/brain/learn/graph/tours/:id
   * Get single guided tour by id
   */
  router.get("/tours/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const tour = service.getTourById(id);
      if (!tour) {
        return c.json({ success: false, error: `Tour '${id}' nicht gefunden.` }, 404);
      }
      return c.json({ success: true, tour }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /api/brain/learn/graph/tours
   * Generates a tour for a specific cluster
   */
  router.post("/tours", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { clusterId?: string };
      if (!body.clusterId) {
        return c.json({ success: false, error: "clusterId ist erforderlich." }, 400);
      }
      const tour = service.generateTour(body.clusterId);
      if (!tour) {
        return c.json({ success: false, error: `Cluster '${body.clusterId}' existiert nicht.` }, 404);
      }
      return c.json({ success: true, tour }, 201);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /api/brain/learn/graph/refresh
   * Re-extracts concepts and computes Louvain clusters
   */
  router.post("/refresh", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { useLlm?: boolean };
      const stats = await service.refresh(undefined, { useLlm: body.useLlm });
      return c.json({ success: true, stats }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * GET /api/brain/learn/graph/stats
   * Returns current graph statistics
   */
  router.get("/stats", async (c) => {
    try {
      const stats = service.getStats();
      return c.json({ success: true, stats }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  return router;
}

export default createConceptGraphRouter;
