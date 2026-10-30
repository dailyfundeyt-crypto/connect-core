import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createCorsAndCsrfCheck } from "../../auth/security/csrf-cors";

describe("SEC-04: CSRF & CORS Guard", () => {
  function makeApp() {
    const app = new Hono();
    app.use("*", createCorsAndCsrfCheck());
    app.post("/api/action", (c) => c.json({ ok: true, executed: true }));
    app.get("/api/data", (c) => c.json({ ok: true, data: "read" }));
    return app;
  }

  it("blocks state-changing POST requests from an untrusted Origin with 403 Forbidden", async () => {
    const app = makeApp();
    const res = await app.request("/api/action", {
      method: "POST",
      headers: {
        Origin: "http://evil-attacker.com",
      },
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Forbidden");
  });

  it("blocks state-changing requests from untrusted third-party vercel domains (e.g. evil.vercel.app)", async () => {
    const app = makeApp();
    const res = await app.request("/api/action", {
      method: "POST",
      headers: {
        Origin: "https://evil.vercel.app",
      },
    });
    expect(res.status).toBe(403);
  });

  it("blocks state-changing requests when Sec-Fetch-Site is cross-site", async () => {
    const app = makeApp();
    const res = await app.request("/api/action", {
      method: "POST",
      headers: {
        "Sec-Fetch-Site": "cross-site",
      },
    });
    expect(res.status).toBe(403);
  });

  it("allows state-changing requests from trusted local origin (localhost:3101, 127.0.0.1:3101, 5173, 5231)", async () => {
    const app = makeApp();
    const res = await app.request("/api/action", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:3101",
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("allows trusted preview vercel origin (connect-kunc-preview.vercel.app)", async () => {
    const app = makeApp();
    const res = await app.request("/api/action", {
      method: "POST",
      headers: {
        Origin: "https://connect-kunc-preview.vercel.app",
      },
    });
    expect(res.status).toBe(200);
  });

  it("handles OPTIONS preflight requests with 204 No Content", async () => {
    const app = makeApp();
    const res = await app.request("/api/action", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3101",
      },
    });
    expect(res.status).toBe(204);
  });
});
