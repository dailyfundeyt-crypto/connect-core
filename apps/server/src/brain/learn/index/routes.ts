/**
 * Spark-Learn Index HTTP Routes (Lane 1)
 *
 * Implements endpoints for status, re-indexing, search, and file watcher under /api/brain/learn/index/*
 */

import { Hono } from "hono";
import { type SparkIndexer, getSparkIndexer } from "./indexer";
import { type VaultWatcher, getVaultWatcher } from "./watcher";

export function createIndexRouter(indexer?: SparkIndexer, watcher?: VaultWatcher): Hono {
  const router = new Hono();
  const idx = indexer ?? getSparkIndexer();
  const wtch = watcher ?? getVaultWatcher({ indexer: idx });

  /**
   * GET /status
   * Full status of chunk index, embeddings, Ollama availability, and pgvector.
   */
  router.get("/status", async (c) => {
    try {
      const status = await idx.getStatus();
      return c.json({
        success: true,
        ...status,
        isWatching: wtch.isWatching(),
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: err?.message || String(err),
        },
        500,
      );
    }
  });

  /**
   * POST /reindex
   * Triggers an incremental or full re-indexing of the vault.
   */
  router.post("/reindex", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const forceFull = Boolean(body?.forceFull);

      // Start indexing asynchronously so the API request doesn't block
      const indexPromise = idx.indexVault({ forceFull });

      // If client requests synchronous execution (?wait=true or body.wait === true)
      if (c.req.query("wait") === "true" || body?.wait === true) {
        const result = await indexPromise;
        return c.json({
          success: true,
          message: "Indexing completed",
          ...result,
        });
      }

      // Otherwise acknowledge start
      return c.json({
        success: true,
        message: "Indexing initiated in background",
        forceFull,
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: err?.message || String(err),
        },
        400,
      );
    }
  });

  /**
   * POST /search
   * Semantic vector + keyword search over indexed vault chunks.
   */
  router.post("/search", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const query = typeof body?.query === "string" ? body.query.trim() : "";
      if (!query) {
        return c.json({ success: false, error: "Parameter 'query' is required." }, 400);
      }

      const limit = Number(body?.limit) || 10;
      const folderScope = typeof body?.folderScope === "string" ? body.folderScope : undefined;
      const notePath = typeof body?.notePath === "string" ? body.notePath : undefined;

      const hits = await idx.search(query, limit, { folderScope, notePath });

      return c.json({
        success: true,
        query,
        count: hits.length,
        hits,
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: err?.message || String(err),
        },
        500,
      );
    }
  });

  /**
   * POST /watcher/toggle
   * Starts or stops the vault file watcher.
   */
  router.post("/watcher/toggle", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const enable =
        typeof body?.enable === "boolean" ? body.enable : !wtch.isWatching();

      if (enable && !wtch.isWatching()) {
        await wtch.start();
      } else if (!enable && wtch.isWatching()) {
        wtch.stop();
      }

      return c.json({
        success: true,
        isWatching: wtch.isWatching(),
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: err?.message || String(err),
        },
        500,
      );
    }
  });

  return router;
}

/**
 * Convenience helper to register index routes directly onto a Hono application.
 */
export function registerIndexRoutes(app: Hono<any, any, any>): void {
  const router = createIndexRouter();
  app.route("/api/brain/learn/index", router);
}
