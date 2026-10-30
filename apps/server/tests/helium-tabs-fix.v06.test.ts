import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createHeliumTabsRouter, getHeliumTabs } from "../src/pc-bridge/helium-tabs-fix";

describe("BUG-01: Helium Tabs Endpunkt (/api/pc-bridge/helium/tabs)", () => {
  it("getHeliumTabs liefert ein Array zurueck", () => {
    const tabs = getHeliumTabs();
    expect(Array.isArray(tabs)).toBe(true);
  });

  it("GET /api/pc-bridge/helium/tabs antwortet mit HTTP 200 und JSON-Array", async () => {
    const app = new Hono();
    const router = createHeliumTabsRouter();
    app.route("/api/pc-bridge/helium", router);

    const res = await app.request("/api/pc-bridge/helium/tabs");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/pc-bridge/helium/status liefert Status und Tabs zurueck", async () => {
    const app = new Hono();
    const router = createHeliumTabsRouter();
    app.route("/api/pc-bridge/helium", router);

    const res = await app.request("/api/pc-bridge/helium/status");
    expect(res.status).toBe(200);

    const data = (await res.json()) as { ok: boolean; tabCount: number; tabs: unknown[] };
    expect(data.ok).toBe(true);
    expect(typeof data.tabCount).toBe("number");
    expect(Array.isArray(data.tabs)).toBe(true);
  });
});
