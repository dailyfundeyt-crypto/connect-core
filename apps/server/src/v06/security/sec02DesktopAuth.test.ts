import { describe, expect, it } from "bun:test";
import { createDesktopRouter } from "../../desktop/routes";

describe("SEC-02: Desktop Routes Authentication Guard", () => {
  const TEST_TOKEN = "desktop-secret-token-12345";

  it("strictly rejects unauthenticated requests with HTTP 401 (reproduces SEC-02 vulnerability)", async () => {
    const router = createDesktopRouter({ authToken: TEST_TOKEN });

    // Request WITHOUT any auth header
    const resNoToken = await router.request("/sessions");
    expect(resNoToken.status).toBe(401);
    const body = await resNoToken.json();
    expect(body.error).toContain("token");
  });

  it("rejects invalid token with HTTP 401", async () => {
    const router = createDesktopRouter({ authToken: TEST_TOKEN });

    const resWrongToken = await router.request("/sessions", {
      headers: { "x-desktop-token": "wrong-token" },
    });
    expect(resWrongToken.status).toBe(401);
  });

  it("accepts valid token via X-Desktop-Token header", async () => {
    const router = createDesktopRouter({ authToken: TEST_TOKEN });

    const resValid = await router.request("/sessions", {
      headers: { "x-desktop-token": TEST_TOKEN },
    });
    expect(resValid.status).toBe(200);
  });

  it("accepts valid token via Authorization: Bearer header", async () => {
    const router = createDesktopRouter({ authToken: TEST_TOKEN });

    const resValidBearer = await router.request("/sessions", {
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(resValidBearer.status).toBe(200);
  });
});
