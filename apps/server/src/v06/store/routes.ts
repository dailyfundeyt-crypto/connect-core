/**
 * Connect Store REST Routes (v06)
 * Endpunkte fuer Listings, Paket-Upload, Admin-Review und Installation in Firmen.
 */

import type { Hono as HonoApp, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import { getFlag } from "../../contracts/v06/flags";
import type { StoreKind, StoreListingStatus } from "../../contracts/v06/store";
import { listStoreListings, getStoreListingById } from "./listings";
import { uploadPackage } from "./upload";
import { approveListing, rejectListing } from "./review";
import { installPackage, listCompanyInstalls } from "./install";

export interface StoreRouteOptions {
  requireUser?: MiddlewareHandler<any>;
  requireAdmin?: MiddlewareHandler<any>;
  dbOverride?: any;
}

/**
 * Prueft Administrator-Berechtigung (oder Localhost/Single-User Modus).
 */
export function checkAdminAccess(c: any): boolean {
  if (
    process.env.CONNECT_SINGLE_USER === "true" ||
    process.env.CONNECT_SINGLE_USER === "1" ||
    process.env.NODE_ENV !== "production"
  ) {
    return true;
  }

  const actor = c.var?.actor;
  if (actor?.isAdmin || actor?.role === "admin") {
    return true;
  }

  const host = c.req.header("host") || "";
  if (host.startsWith("localhost:") || host.startsWith("127.0.0.1:") || host === "localhost") {
    return true;
  }

  return false;
}

/**
 * Erstellt einen eigenständigen Hono-Router für den Store.
 */
export function createStoreRouter(options: StoreRouteOptions = {}): Hono {
  const router = new Hono();

  // 1. GET /api/v06/store/listings (Katalog, Suche, Filter nach kind)
  router.get("/listings", async (c) => {
    if (!getFlag("storeV1")) {
      return c.json({ error: "Feature 'storeV1' is currently disabled." }, 404);
    }

    const q = c.req.query("q") || undefined;
    const kind = (c.req.query("kind") as StoreKind) || undefined;
    const status = (c.req.query("status") as StoreListingStatus) || undefined;
    const authorId = c.req.query("authorId") || undefined;

    try {
      const items = await listStoreListings(
        { q, kind, status, authorId },
        options.dbOverride,
      );
      return c.json(items, 200);
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to list store packages." }, 500);
    }
  });

  // 2. GET /api/v06/store/listings/:id (Details zu einem Listing)
  router.get("/listings/:id", async (c) => {
    if (!getFlag("storeV1")) {
      return c.json({ error: "Feature 'storeV1' is currently disabled." }, 404);
    }

    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Listing ID is required." }, 400);
    }

    try {
      const item = await getStoreListingById(id, options.dbOverride);
      if (!item) {
        return c.json({ error: `Store listing '${id}' not found.` }, 404);
      }
      return c.json(item, 200);
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to get store listing." }, 500);
    }
  });

  // 3. POST /api/v06/store/listings (Manifest einreichen / Listing anlegen)
  router.post("/listings", async (c) => {
    if (!getFlag("storeV1")) {
      return c.json({ error: "Feature 'storeV1' is currently disabled." }, 404);
    }

    try {
      const body = await c.req.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return c.json({ error: "Invalid JSON body for store listing." }, 400);
      }

      const actor = (c.var as any)?.actor;
      const authorId = actor?.id || body.authorId || (typeof body.author === "string" ? body.author : body.author?.name) || "user";

      const uploadRes = await uploadPackage({
        manifestRaw: body,
        authorId,
        dbOverride: options.dbOverride,
      });

      if (!uploadRes.ok) {
        return c.json({ error: "Validation failed", details: uploadRes.errors }, 400);
      }

      return c.json({ ok: true, listing: uploadRes.listing, version: uploadRes.version }, 201);
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to create store listing." }, 500);
    }
  });

  // 4. POST /api/v06/store/listings/upload (Paket-Upload: ZIP oder JSON Multipart/Body)
  router.post("/listings/upload", async (c) => {
    if (!getFlag("storeV1")) {
      return c.json({ error: "Feature 'storeV1' is currently disabled." }, 404);
    }

    try {
      const contentType = c.req.header("content-type") || "";
      let manifestRaw: any = null;
      let archiveBuffer: Buffer | undefined = undefined;

      if (contentType.includes("multipart/form-data")) {
        const formData = await c.req.formData().catch(() => null);
        if (!formData) {
          return c.json({ error: "Failed to parse multipart form data." }, 400);
        }

        const manifestEntry = formData.get("manifest");
        if (manifestEntry) {
          if (typeof manifestEntry === "string") {
            try {
              manifestRaw = JSON.parse(manifestEntry);
            } catch {
              return c.json({ error: "Manifest form field is not valid JSON." }, 400);
            }
          }
        }

        const packageFile = formData.get("package") || formData.get("file");
        if (packageFile && typeof packageFile === "object" && "arrayBuffer" in packageFile) {
          const ab = await (packageFile as Blob).arrayBuffer();
          archiveBuffer = Buffer.from(ab);
        }
      } else {
        // Direkter JSON-Body
        manifestRaw = await c.req.json().catch(() => null);
      }

      if (!manifestRaw && !archiveBuffer) {
        return c.json({ error: "Neither manifest nor package file provided." }, 400);
      }

      const actor = (c.var as any)?.actor;
      const authorId = actor?.id || (manifestRaw?.author?.name || manifestRaw?.author) || "user";

      const result = await uploadPackage({
        manifestRaw,
        archiveBuffer,
        authorId,
        dbOverride: options.dbOverride,
      });

      if (!result.ok) {
        return c.json({ error: "Upload validation rejected", details: result.errors }, 400);
      }

      return c.json(
        {
          ok: true,
          listing: result.listing,
          version: result.version,
          packageHash: result.packageHash,
          packagePath: result.packagePath,
        },
        201,
      );
    } catch (err: any) {
      return c.json({ error: err?.message || "Package upload failed." }, 500);
    }
  });

  // 5. POST /api/v06/store/listings/:id/install (Installation in eine Firma)
  router.post("/listings/:id/install", async (c) => {
    if (!getFlag("storeV1")) {
      return c.json({ error: "Feature 'storeV1' is currently disabled." }, 404);
    }

    const listingId = c.req.param("id");
    if (!listingId) {
      return c.json({ error: "Listing ID is required." }, 400);
    }

    try {
      const body = await c.req.json().catch(() => ({}));
      const targetCompanyId = body.targetCompanyId || body.companyId;

      if (!targetCompanyId || typeof targetCompanyId !== "string") {
        return c.json({ error: "Field 'targetCompanyId' (or 'companyId') is required." }, 400);
      }

      const actor = (c.var as any)?.actor;
      const userId = actor?.id || body.userId || "user";

      const installRes = await installPackage({
        listingId,
        targetCompanyId,
        userId,
        confirmPermissions: Boolean(body.confirmPermissions),
        acceptedPermissions: Array.isArray(body.acceptedPermissions) ? body.acceptedPermissions : undefined,
        dbOverride: options.dbOverride,
      });

      if (!installRes.ok) {
        if (installRes.requireConfirmation) {
          return c.json(installRes, 200);
        }
        return c.json({ error: installRes.error || "Installation failed." }, 400);
      }

      return c.json(installRes, 200);
    } catch (err: any) {
      return c.json({ error: err?.message || "Installation error." }, 500);
    }
  });

  // 6. POST /api/v06/store/listings/:id/review (Stefan lokale Admin-Freigabe)
  router.post("/listings/:id/review", async (c) => {
    if (!getFlag("storeV1")) {
      return c.json({ error: "Feature 'storeV1' is currently disabled." }, 404);
    }

    if (!checkAdminAccess(c)) {
      return c.json({ error: "Unauthorized: Admin access required for reviews." }, 403);
    }

    const listingId = c.req.param("id");
    if (!listingId) {
      return c.json({ error: "Listing ID is required." }, 400);
    }

    try {
      const body = await c.req.json().catch(() => ({}));
      const action = body.action || "approve";
      const reason = body.reason || "";
      const reviewer = (c.var as any)?.actor?.id || "stefan";

      if (action === "approve") {
        const res = await approveListing(listingId, reviewer, options.dbOverride);
        if (!res.ok) return c.json({ error: res.error }, 400);
        return c.json({ ok: true, listing: res.listing }, 200);
      } else if (action === "reject") {
        const res = await rejectListing(listingId, reason, reviewer, options.dbOverride);
        if (!res.ok) return c.json({ error: res.error }, 400);
        return c.json({ ok: true, listing: res.listing }, 200);
      } else {
        return c.json({ error: "Invalid action. Must be 'approve' or 'reject'." }, 400);
      }
    } catch (err: any) {
      return c.json({ error: err?.message || "Review processing failed." }, 500);
    }
  });

  // 7. GET /api/v06/store/installs (Installierte Pakete einer Firma abrufen)
  router.get("/installs", async (c) => {
    if (!getFlag("storeV1")) {
      return c.json({ error: "Feature 'storeV1' is currently disabled." }, 404);
    }

    const companyId = c.req.query("companyId");
    if (!companyId) {
      return c.json({ error: "Query parameter 'companyId' is required." }, 400);
    }

    try {
      const installs = await listCompanyInstalls(companyId, options.dbOverride);
      return c.json(installs, 200);
    } catch (err: any) {
      return c.json({ error: err?.message || "Failed to list installs." }, 500);
    }
  });

  return router;
}

/**
 * Registriert alle Store-Routen auf der Haupt-App.
 * Exportiert fuer A22 (Integrator): registerStoreRoutes(app)
 */
export function registerStoreRoutes(
  app: HonoApp<any, any, any>,
  options: StoreRouteOptions = {},
): void {
  const storeRouter = createStoreRouter(options);
  app.route("/api/v06/store", storeRouter);
}

export default registerStoreRoutes;
