import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  createStoreCompatRouter,
  registerStoreCompatRoutes,
  toV06Listing,
} from "../src/routes/store-compat";

describe("BUG-06: Store-Kompatibilitäts-Alias (/api/store/items vs /api/v06/store/listings)", () => {
  it("toV06Listing wandelt StoreItems konform in StoreListing um", () => {
    const rawItem = {
      id: "item-mcp-1",
      slug: "mcp-browser",
      displayName: "Browser MCP",
      version: "2.1.0",
      author: "Stefan",
      category: "mcp",
      description: "Controls browser",
      priceCents: 500,
    };

    const listing = toV06Listing(rawItem);
    expect(listing.id).toBe("item-mcp-1");
    expect(listing.kind).toBe("mcp");
    expect(listing.slug).toBe("mcp-browser");
    expect(listing.name).toBe("Browser MCP");
    expect(listing.version).toBe("2.1.0");
    expect(listing.authorId).toBe("Stefan");
    expect(listing.priceCents).toBe(500);
    expect(listing.status).toBe("published");
  });

  it("GET /api/store/listings liefert Store-Listings (Alias-Route)", async () => {
    const app = new Hono();
    registerStoreCompatRoutes(app);

    const res = await app.request("/api/store/listings");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { ok: boolean; listings: any[] };
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.listings)).toBe(true);
    expect(data.listings.length).toBeGreaterThan(0);
  });

  it("GET /api/v06/store/listings antwortet konform mit StoreListing-Array", async () => {
    const app = new Hono();
    registerStoreCompatRoutes(app);

    const res = await app.request("/api/v06/store/listings");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0].id).toBeDefined();
      expect(data[0].kind).toBeDefined();
      expect(data[0].slug).toBeDefined();
      expect(data[0].name).toBeDefined();
    }
  });

  it("POST /api/v06/store/listings/upload antwortet mit 200 und iconUrl", async () => {
    const app = new Hono();
    registerStoreCompatRoutes(app);

    const res = await app.request("/api/v06/store/listings/upload", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; iconUrl: string };
    expect(data.ok).toBe(true);
    expect(data.iconUrl).toBeDefined();
  });
});
