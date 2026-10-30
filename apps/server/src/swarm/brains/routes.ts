import { Hono } from "hono";
import { brainStore } from "./brain-builder";
import { search100MChunks, isPrivateSourceDisabled } from "./sources/book-retrieval";
import { ingest100MBook, loadBookChunks } from "./sources/book-ingest";
import { verifyQuotes } from "./quote-check";
import { auditLogger, defaultBudgetGuard } from "./security";
import { SeatBrainSchema } from "./types";

/**
 * Creates the Swarm-v3 Brains Router (/api/brains/*)
 */
export function createBrainsRouter(): Hono {
  const router = new Hono();

  // 1. List all seat brains
  router.get("/", (c) => {
    const brains = brainStore.list();
    return c.json({
      success: true,
      brains,
    });
  });

  // 2. Private 100M Knowledge Chunk Search
  // Requirements: localhost/Owner-Session, brains:private:read grant, 404 in serverless/vercel
  router.get("/sources/100m/search", (c) => {
    if (isPrivateSourceDisabled()) {
      return c.json(
        {
          success: false,
          error: "private source unavailable",
          message: "100M Money Models private source is disabled in serverless/public cloud environments.",
        },
        404
      );
    }

    // Localhost / Scope check
    const clientHost = c.req.header("host") || "";
    const authHeader = c.req.header("authorization") || "";
    const mcpGrant = c.req.header("x-mcp-grant") || "";

    const isLocalhost =
      clientHost.includes("localhost") ||
      clientHost.includes("127.0.0.1") ||
      clientHost.includes("::1");

    // Enforce grant / local restriction
    const hasGrant =
      mcpGrant.includes("brains:private:read") ||
      authHeader.includes("brains:private:read") ||
      isLocalhost;

    if (!hasGrant) {
      auditLogger.log("privacy_check", {
        path: "/api/brains/sources/100m/search",
        reason: "missing_grant",
        clientHost,
      });
      return c.json(
        {
          success: false,
          error: "Forbidden",
          message: "Missing required grant scope: brains:private:read",
        },
        403
      );
    }

    const q = c.req.query("q") || "";
    const k = Number(c.req.query("k")) || 5;
    const section = c.req.query("section") || undefined;

    if (!q.trim()) {
      return c.json({ success: true, count: 0, results: [] });
    }

    try {
      const results = search100MChunks(q, k, section);
      return c.json({
        success: true,
        count: results.length,
        query: q,
        results,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  // 3. Trigger / Refresh 100M Book Ingest
  router.post("/ingest/100m", async (c) => {
    if (isPrivateSourceDisabled()) {
      return c.json({ success: false, error: "private source unavailable" }, 404);
    }
    try {
      const body = await c.req.json().catch(() => ({}));
      const stats = await ingest100MBook(body?.customPath);
      return c.json({
        success: true,
        message: "100M Money Models book successfully ingested and indexed.",
        stats,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  // 4. Quote Verification Endpoint (Roast-Room Concept)
  router.post("/verify-quotes", async (c) => {
    try {
      const body = await c.req.json();
      const text = String(body.text || "");
      if (!text.trim()) {
        return c.json({ success: false, error: "text parameter is required" }, 400);
      }

      const res = verifyQuotes(text);
      if (!res.valid) {
        auditLogger.log("quote_fail", {
          totalQuotes: res.totalQuotes,
          unverified: res.unverifiedCount,
          missingCitations: res.missingCitations,
        });
      }

      return c.json({
        success: true,
        verification: res,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  // 5. Audit Log abrufen
  router.get("/audit", (c) => {
    const limit = Number(c.req.query("limit")) || 50;
    const logs = auditLogger.getLogs(limit);
    const budgetStats = defaultBudgetGuard.getStats();
    return c.json({
      success: true,
      count: logs.length,
      auditLogs: logs,
      budgetStats,
    });
  });

  // 6. Get Brain by ID
  router.get("/:id", (c) => {
    const id = c.req.param("id");
    const brain = brainStore.get(id);
    if (!brain) {
      return c.json({ success: false, error: `SeatBrain ${id} not found` }, 404);
    }
    return c.json({
      success: true,
      brain,
    });
  });

  // 7. Create Brain
  router.post("/", async (c) => {
    try {
      const body = await c.req.json();
      const created = brainStore.create(body);
      return c.json(
        {
          success: true,
          brain: created,
        },
        201
      );
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 400);
    }
  });

  // 8. Update Brain
  router.put("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json();
      const updated = brainStore.update(id, body);
      return c.json({
        success: true,
        brain: updated,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 400);
    }
  });

  // 9. Delete Brain
  router.delete("/:id", (c) => {
    const id = c.req.param("id");
    const ok = brainStore.delete(id);
    if (!ok) {
      return c.json({ success: false, error: `SeatBrain ${id} not found` }, 404);
    }
    return c.json({
      success: true,
      message: `SeatBrain ${id} deleted`,
    });
  });

  return router;
}

export default createBrainsRouter;
