import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createRateLimiter, resetRateLimits } from "./rateLimit";

describe("Security – rateLimit Middleware", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  afterEach(() => {
    resetRateLimits();
  });

  it("permits requests within the defined threshold and adds headers", async () => {
    const app = new Hono();
    app.use("*", createRateLimiter({ max: 3, windowMs: 10_000 }));
    app.get("/api/test", (c) => c.text("ok"));

    const res1 = await app.request("/api/test");
    expect(res1.status).toBe(200);
    expect(res1.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(res1.headers.get("X-RateLimit-Remaining")).toBe("2");

    const res2 = await app.request("/api/test");
    expect(res2.status).toBe(200);
    expect(res2.headers.get("X-RateLimit-Remaining")).toBe("1");

    const res3 = await app.request("/api/test");
    expect(res3.status).toBe(200);
    expect(res3.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("returns HTTP 429 when rate limit is exceeded", async () => {
    const app = new Hono();
    app.use("*", createRateLimiter({ max: 2, windowMs: 5000, message: "Limit hit" }));
    app.get("/api/data", (c) => c.text("ok"));

    await app.request("/api/data");
    await app.request("/api/data");

    const resOver = await app.request("/api/data");
    expect(resOver.status).toBe(429);
    expect(resOver.headers.get("Retry-After")).toBeDefined();

    const body = await resOver.json();
    expect(body.error).toBe("Limit hit");
    expect(body.status).toBe(429);
  });

  it("respects skip configuration for health endpoints", async () => {
    const app = new Hono();
    app.use(
      "*",
      createRateLimiter({
        max: 1,
        skip: (c) => c.req.path === "/health",
      }),
    );
    app.get("/health", (c) => c.text("healthy"));

    const res1 = await app.request("/health");
    const res2 = await app.request("/health");
    const res3 = await app.request("/health");

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);
  });
});
