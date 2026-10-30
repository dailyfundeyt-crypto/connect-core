import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { registerLane10Routes } from "../../lanes/lane-10";

describe("SEC-03: Lane-10 Authentication Guard (/api/mcp-grants & /api/email-agents)", () => {
  it("rejects unauthenticated requests to /api/mcp-grants with 401 (reproduces SEC-03 vulnerability)", async () => {
    const app = new Hono();
    registerLane10Routes(app);

    const res = await app.request("/api/mcp-grants");
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain("authentication required");
  });

  it("rejects unauthenticated requests to /api/email-agents/drafts with 401", async () => {
    const app = new Hono();
    registerLane10Routes(app);

    const res = await app.request("/api/email-agents/drafts");
    expect(res.status).toBe(401);
  });

  it("allows requests when an authenticated actor context is present", async () => {
    const app = new Hono<{ Variables: { actor: any } }>();
    app.use("*", async (c, next) => {
      c.set("actor", { id: "test-user", role: "admin" });
      await next();
    });
    registerLane10Routes(app);

    const res = await app.request("/api/mcp-grants");
    // Should pass auth guard (even if db query returns empty grants or 200)
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("allows requests when a valid Bearer or connect token is provided", async () => {
    const app = new Hono();
    registerLane10Routes(app);

    const token = process.env.CONNECT_DESKTOP_TOKEN || "connect-desktop-local-token";
    const res = await app.request("/api/mcp-grants", {
      headers: { "x-connect-token": token },
    });
    expect(res.status).toBe(200);
  });
});
