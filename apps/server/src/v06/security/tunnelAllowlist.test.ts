import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  createTunnelAllowlistGuard,
  isTunnelRequest,
} from "./tunnelAllowlist";

describe("Security – tunnelAllowlist Guard", () => {
  function createTestApp() {
    const app = new Hono();
    app.use("*", createTunnelAllowlistGuard());

    app.get("/health", (c) => c.text("ok"));
    app.get("/api/webhooks/github", (c) => c.text("webhook-ok"));
    app.get("/api/desktop/sessions", (c) => c.text("desktop-secret"));
    app.get("/api/cli/execute", (c) => c.text("cli-secret"));
    return app;
  }

  it("detects tunnel headers accurately", () => {
    const app = new Hono();
    let detected = false;
    app.get("/check", (c) => {
      detected = isTunnelRequest(c);
      return c.text("ok");
    });

    app.request("/check", { headers: { "cf-ray": "12345678" } });
    expect(detected).toBe(true);

    detected = false;
    app.request("/check", { headers: { host: "abc.trycloudflare.com" } });
    expect(detected).toBe(true);

    detected = false;
    app.request("/check", { headers: { host: "127.0.0.1:3101" } });
    expect(detected).toBe(false);
  });

  it("allows all requests from local/direct calls without tunnel headers", async () => {
    const app = createTestApp();

    const resDesktop = await app.request("/api/desktop/sessions");
    expect(resDesktop.status).toBe(200);
    expect(await resDesktop.text()).toBe("desktop-secret");

    const resCli = await app.request("/api/cli/execute");
    expect(resCli.status).toBe(200);
  });

  it("allows allowlisted routes when accessed via tunnel", async () => {
    const app = createTestApp();

    const resHealth = await app.request("/health", {
      headers: { "cf-ray": "some-cf-ray" },
    });
    expect(resHealth.status).toBe(200);

    const resWebhook = await app.request("/api/webhooks/github", {
      headers: { "cf-connecting-ip": "1.2.3.4" },
    });
    expect(resWebhook.status).toBe(200);
    expect(await resWebhook.text()).toBe("webhook-ok");
  });

  it("strictly blocks sensitive routes (desktop, cli) when accessed via tunnel", async () => {
    const app = createTestApp();

    const resDesktop = await app.request("/api/desktop/sessions", {
      headers: { "cf-ray": "some-cf-ray" },
    });
    expect(resDesktop.status).toBe(403);
    const bodyDesktop = await resDesktop.json();
    expect(bodyDesktop.code).toBe("TUNNEL_ROUTE_PROHIBITED");

    const resCli = await app.request("/api/cli/execute", {
      headers: { "x-connect-tunnel": "true" },
    });
    expect(resCli.status).toBe(403);
  });
});
