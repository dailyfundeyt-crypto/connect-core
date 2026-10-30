/**
 * Store API Routes (Lane 8)
 * Endpoints under /api/store/*
 */

import { Hono } from "hono";
import { getStoreService } from "./service";

export function createStoreRouter(): Hono {
  const router = new Hono();
  const service = getStoreService();

  // GET /api/store - Alias fuer /api/store/items (Integration 2026-10-22)
  router.get("/", (c) => {
    const category = c.req.query("category");
    const type = c.req.query("type");
    const search = c.req.query("search");
    const companyId = c.req.query("companyId");
    const result = service.listItems({ category, type, search, companyId });
    return c.json({ ok: true, ...result });
  });
  // GET /api/store/items - List store items
  router.get("/items", (c) => {
    const category = c.req.query("category");
    const type = c.req.query("type");
    const search = c.req.query("search");
    const companyId = c.req.query("companyId");

    const result = service.listItems({ category, type, search, companyId });
    return c.json({ ok: true, ...result });
  });

  // GET /api/store/categories - List category definitions with counts
  router.get("/categories", (c) => {
    const categories = service.getCategories();
    return c.json({ ok: true, categories });
  });

  // GET /api/store/stats - Store summary metrics
  router.get("/stats", (c) => {
    const { items, total } = service.listItems({});
    const totalDownloads = items.reduce((sum, i) => sum + i.downloadsCount, 0);
    const avgRating =
      total > 0
        ? Math.round((items.reduce((sum, i) => sum + (i.rating || 5), 0) / total) * 10) / 10
        : 5.0;

    return c.json({
      ok: true,
      stats: {
        totalItems: total,
        totalDownloads,
        averageRating: avgRating,
      },
    });
  });

  // GET /api/store/items/:id - Item details with reviews and versions
  router.get("/items/:id", (c) => {
    const id = c.req.param("id");
    const companyId = c.req.query("companyId");
    const item = service.getItem(id, companyId);

    if (!item) {
      return c.json({ ok: false, error: `Store item "${id}" not found` }, 404);
    }

    return c.json({ ok: true, item });
  });

  // POST /api/store/items - Publish or update store item
  router.post("/items", async (c) => {
    try {
      const body = await c.req.json();
      const manifest = body.manifest || body;
      const changelog = body.changelog || "Aktualisiertes Paket";
      const author = body.author || manifest.author || "Stefan Kunc";

      const res = await service.publishItem(manifest, changelog, author);
      if (!res.success) {
        return c.json({ ok: false, error: res.error }, 400);
      }

      return c.json({ ok: true, item: res.item }, 201);
    } catch (err: any) {
      return c.json(
        { ok: false, error: `Publishing failed: ${err?.message || "Invalid payload"}` },
        400,
      );
    }
  });

  // POST /api/store/items/:id/install - Install into company
  router.post("/items/:id/install", async (c) => {
    const id = c.req.param("id");
    try {
      const body = await c.req.json().catch(() => ({}));
      const companyId = body.companyId || "flux";
      const installedBy = body.installedBy || "Stefan Kunc";
      const permissions = body.permissions;

      const res = await service.installItem(id, companyId, installedBy, permissions);
      if (!res.success) {
        return c.json({ ok: false, error: res.error }, 400);
      }

      return c.json({ ok: true, install: res.install });
    } catch (err: any) {
      return c.json(
        { ok: false, error: `Installation failed: ${err?.message || "Unknown error"}` },
        500,
      );
    }
  });

  // POST /api/store/items/:id/uninstall - Uninstall from company
  router.post("/items/:id/uninstall", async (c) => {
    const id = c.req.param("id");
    try {
      const body = await c.req.json().catch(() => ({}));
      const companyId = body.companyId || "flux";

      const res = await service.uninstallItem(id, companyId);
      if (!res.success) {
        return c.json({ ok: false, error: res.error }, 400);
      }

      return c.json({ ok: true, uninstalled: true });
    } catch (err: any) {
      return c.json(
        { ok: false, error: `Uninstall failed: ${err?.message || "Unknown error"}` },
        500,
      );
    }
  });

  // POST /api/store/items/:id/auto-start - Toggle auto start
  router.post("/items/:id/auto-start", async (c) => {
    const id = c.req.param("id");
    try {
      const body = await c.req.json();
      const companyId = body.companyId || "flux";
      const autoStart = Boolean(body.autoStart);

      const res = await service.toggleAutoStart(id, companyId, autoStart);
      return c.json({ ok: true, autoStart: res.autoStart });
    } catch (err: any) {
      return c.json(
        { ok: false, error: `Auto-start update failed: ${err?.message || "Unknown error"}` },
        500,
      );
    }
  });

  // GET /api/store/items/:id/reviews - List reviews
  router.get("/items/:id/reviews", (c) => {
    const id = c.req.param("id");
    const item = service.getItem(id);
    if (!item) {
      return c.json({ ok: false, error: `Item "${id}" not found` }, 404);
    }
    return c.json({ ok: true, reviews: item.reviews || [] });
  });

  // POST /api/store/items/:id/reviews - Submit review
  router.post("/items/:id/reviews", async (c) => {
    const id = c.req.param("id");
    try {
      const body = await c.req.json();
      const rating = Number(body.rating) || 5;
      const comment = String(body.comment || "").trim();
      const userId = String(body.userId || "user-stefan");
      const userName = String(body.userName || "Stefan Kunc");

      if (comment.length === 0) {
        return c.json({ ok: false, error: "Bewertungskommentar darf nicht leer sein" }, 400);
      }

      const res = await service.addReview(id, { userId, userName, rating, comment });
      if (!res.success) {
        return c.json({ ok: false, error: res.error }, 400);
      }

      return c.json({ ok: true, review: res.review });
    } catch (err: any) {
      return c.json(
        { ok: false, error: `Review submission failed: ${err?.message || "Unknown error"}` },
        500,
      );
    }
  });

  return router;
}

export default createStoreRouter;
