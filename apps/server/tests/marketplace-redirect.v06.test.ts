import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  createMarketplaceRedirectRouter,
  registerMarketplaceRedirectRoutes,
} from "../src/routes/marketplace-redirect";

describe("BUG-09: Marktplatz-Redirect & Konsolidierung (/market zu /store)", () => {
  it("GET /market leitet per 301 auf /store weiter", async () => {
    const app = new Hono();
    registerMarketplaceRedirectRoutes(app);

    const res = await app.request("/market");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/store");
  });

  it("GET /api/market/item-123 leitet auf /store/item-123 weiter", async () => {
    const app = new Hono();
    registerMarketplaceRedirectRoutes(app);

    const res = await app.request("/api/market/item-123");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/store/item-123");
  });

  it("GET /market/item-123 mit JSON-Accept liefert 301 und Zielpfad im Body", async () => {
    const app = new Hono();
    registerMarketplaceRedirectRoutes(app);

    const res = await app.request("/market/item-123", {
      headers: { Accept: "application/json" },
    });
    expect(res.status).toBe(301);
    const data = (await res.json()) as { ok: boolean; redirected: boolean; target: string };
    expect(data.ok).toBe(true);
    expect(data.redirected).toBe(true);
    expect(data.target).toBe("/store/item-123");
  });
});
