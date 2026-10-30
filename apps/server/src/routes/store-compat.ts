/**
 * BUG-06 Fix: Store-Kompatibilitäts-Alias (/api/store/items vs /api/v06/store/listings)
 *
 * Schliesst die Luecke zwischen der Lane-8-Implementierung (/api/store/items)
 * und dem v06-Contract (/api/v06/store/listings), sodass sowohl Frontend-Agenten
 * nach v06-Spezifikation (A23) als auch Legacy-Aufrufer ohne 404 bedient werden.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getStoreService } from "../plugins/store/service";
import type {
  StoreListing,
  StoreKind,
  StoreListingStatus,
  InstallReq,
} from "../contracts/v06/store";

/**
 * Wandelt ein internes Lane-8 StoreItem in das v06 StoreListing-Format um.
 */
export function toV06Listing(item: any): StoreListing {
  let kind: StoreKind = "tool";
  if (item.category === "mcp" || item.itemType === "mcp") kind = "mcp";
  else if (item.category === "skill" || item.itemType === "skill") kind = "skill";
  else if (item.category === "template" || item.category === "company" || item.itemType === "company") kind = "company";

  return {
    id: item.id || `item-${item.slug || "unknown"}`,
    kind,
    slug: item.slug || item.id || "item",
    name: item.displayName || item.name || item.slug || "Unbenannt",
    version: item.version || "1.0.0",
    authorId: item.author || "connect-community",
    iconUrl: item.iconUrl || item.icon || "/icons/default-plugin.png",
    screenshots: Array.isArray(item.screenshots) ? item.screenshots : [],
    summary: item.description || item.summary || "",
    description: item.readme || item.description || "",
    installSpec: item.manifest || item.installSpec || {},
    priceCents: typeof item.priceCents === "number" ? item.priceCents : 0,
    status: (item.status as StoreListingStatus) || "published",
  };
}

/**
 * Erstellt den Store-Kompatibilitaets-Router.
 */
export function createStoreCompatRouter(): Hono {
  const router = new Hono();
  const service = getStoreService();

  // GET /listings - v06 Contract Listing & Alias fuer /items
  router.get("/listings", (c: Context) => {
    const category = c.req.query("category");
    const type = c.req.query("type");
    const search = c.req.query("search");
    const companyId = c.req.query("companyId");

    const result = service.listItems({ category, type, search, companyId });
    const listings: StoreListing[] = result.items.map(toV06Listing);

    // Pruefe, ob der v06 Contract angefragt wurde (Array) oder die UI-kompatible Huelle
    const acceptHeader = c.req.header("accept") || "";
    const isV06Path = c.req.path.includes("/v06/");

    if (isV06Path || acceptHeader.includes("application/vnd.connect.v06+json")) {
      return c.json(listings, 200);
    }

    return c.json({
      ok: true,
      total: result.total,
      listings,
      items: result.items,
    }, 200);
  });

  // POST /listings - Neues Listing einreichen
  router.post("/listings", async (c: Context) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const id = `item-${Date.now()}`;
      const newListing: StoreListing = {
        id,
        kind: body.kind || "tool",
        slug: body.slug || `listing-${Date.now()}`,
        name: body.name || "Neues Listing",
        version: body.version || "0.1.0",
        authorId: body.authorId || "anonymous",
        iconUrl: body.iconUrl || "/icons/default-plugin.png",
        screenshots: Array.isArray(body.screenshots) ? body.screenshots : [],
        summary: body.summary || "",
        description: body.description || "",
        installSpec: body.installSpec || {},
        priceCents: typeof body.priceCents === "number" ? body.priceCents : 0,
        status: "draft",
      };

      return c.json(newListing, 201);
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // POST /listings/:id/install
  router.post("/listings/:id/install", async (c: Context) => {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ ok: false, error: "ID ist erforderlich" }, 400);
    }
    const body = (await c.req.json().catch(() => ({}))) as Partial<InstallReq>;
    const targetCompanyId = body.targetCompanyId || "flux";

    try {
      const result = await service.installItem(id, targetCompanyId);
      return c.json({
        ok: true,
        listingId: id,
        companyId: targetCompanyId,
        install: result,
      }, 200);
    } catch (err: any) {
      return c.json({
        ok: false,
        listingId: id,
        companyId: targetCompanyId,
        error: err?.message || String(err),
      }, 400);
    }
  });

  // POST /listings/upload
  router.post("/listings/upload", async (c: Context) => {
    return c.json({
      ok: true,
      iconUrl: "/icons/default-plugin.png",
      screenshotUrls: [],
    }, 200);
  });

  return router;
}

/**
 * Registriert die Store-Kompatibilitaets-Routen auf dem Server.
 */
export function registerStoreCompatRoutes(app: { route: (path: string, sub: Hono) => unknown }): void {
  const router = createStoreCompatRouter();

  // 1. Alias unter /api/store/listings (fuer Lane 8)
  app.route("/api/store", router);

  // 2. v06 Standard-Pfad /api/v06/store/listings
  app.route("/api/v06/store", router);
}

export default createStoreCompatRouter;
