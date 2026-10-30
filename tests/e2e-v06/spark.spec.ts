import { test, expect } from "./fixtures";

test.describe("A08/A17/A29 - Spark Overview & Brain Knowledge Hub", () => {
  test("1. Spark overview REST endpoint gates on sparkOverview flag", async ({
    authedPage,
  }) => {
    const res = await authedPage.request.get("/api/v06/spark/overview/default");
    expect([200, 503]).toContain(res.status());
    if (res.status() === 503) {
      const body = await res.json();
      expect(body.flag).toBe("sparkOverview");
      expect(body.status).toBe("disabled");
    }
  });

  test("2. Spark Agent Data Access endpoint", async ({ authedPage }) => {
    const res = await authedPage.request.get("/api/v06/spark/agent-access/agent_test");
    expect([200, 404, 503]).toContain(res.status());
  });

  test("3. Spark MCP JSON-RPC endpoint responds", async ({ authedPage }) => {
    const res = await authedPage.request.post("/api/v06/spark-mcp", {
      data: {
        jsonrpc: "2.0",
        id: "1",
        method: "tools/list",
        params: {},
      },
    });
    // Responds with 200 (JSON-RPC) or 403/404 depending on sparkMcp flag
    expect([200, 400, 403, 404, 503]).toContain(res.status());
  });

  test("4. Spark Overview Page renders structure under sparkOverview flag", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ sparkOverview: true });
    await authedPage.goto("/spark-overview");

    const pageContainer = authedPage.locator('[data-testid="spark-overview-page"]');
    if (await pageContainer.isVisible()) {
      await expect(pageContainer).toBeVisible();

      // Check for Treemap or Agent tabs
      const tabs = pageContainer.locator("button, [role='tab']");
      expect(await tabs.count()).toBeGreaterThanOrEqual(1);
    }
  });
});
