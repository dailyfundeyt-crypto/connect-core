import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  createTokenAuth,
  createRequireAuth,
  safeTimingCompare,
} from "./requireAuth";

describe("Security – requireAuth Middleware & Guards", () => {
  describe("safeTimingCompare", () => {
    it("returns true for identical strings", () => {
      expect(safeTimingCompare("secret-token-123", "secret-token-123")).toBe(true);
    });

    it("returns false for different strings or different lengths", () => {
      expect(safeTimingCompare("secret-token-123", "secret-token-456")).toBe(false);
      expect(safeTimingCompare("secret-token", "secret-token-long")).toBe(false);
      expect(safeTimingCompare("", "token")).toBe(false);
    });
  });

  describe("createTokenAuth", () => {
    const SECRET = "connect-test-super-secret";
    function makeApp() {
      const app = new Hono();
      app.use("/protected/*", createTokenAuth(SECRET));
      app.get("/protected/data", (c) => c.json({ ok: true, data: "sensitive" }));
      return app;
    }

    it("rejects requests without any auth header with 401 (Fix for SEC-02)", async () => {
      const app = makeApp();
      const res = await app.request("/protected/data");
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain("Unauthorized");
    });

    it("rejects requests with an incorrect token with 401", async () => {
      const app = makeApp();
      const res = await app.request("/protected/data", {
        headers: { "x-desktop-token": "wrong-token" },
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Invalid authentication token");
    });

    it("accepts requests with valid X-Desktop-Token", async () => {
      const app = makeApp();
      const res = await app.request("/protected/data", {
        headers: { "x-desktop-token": SECRET },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("accepts requests with valid Authorization: Bearer token", async () => {
      const app = makeApp();
      const res = await app.request("/protected/data", {
        headers: { authorization: `Bearer ${SECRET}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });
  });

  describe("createRequireAuth (Session or Token)", () => {
    it("allows valid session or valid token, blocks unauthenticated", async () => {
      const app = new Hono();
      app.use(
        "/api/*",
        createRequireAuth({
          expectedTokens: ["valid-token"],
          verifySession: async (c) => {
            return c.req.header("cookie")?.includes("session=valid") ? { userId: "user-1" } : false;
          },
        }),
      );
      app.get("/api/user", (c) => c.json({ ok: true }));

      // Unauthenticated -> 401
      const res1 = await app.request("/api/user");
      expect(res1.status).toBe(401);

      // Bearer token -> 200
      const res2 = await app.request("/api/user", {
        headers: { authorization: "Bearer valid-token" },
      });
      expect(res2.status).toBe(200);

      // Cookie session -> 200
      const res3 = await app.request("/api/user", {
        headers: { cookie: "session=valid" },
      });
      expect(res3.status).toBe(200);
    });
  });
});
