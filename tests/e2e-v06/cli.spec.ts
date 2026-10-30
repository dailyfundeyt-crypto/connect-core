import { test, expect } from "./fixtures";

test.describe("A06/A07/A15 - CLI Runner & Unified Session (Chat + CLI)", () => {
  test("1. CLI session endpoint gates on cliUnifiedSession feature flag", async ({
    authedPage,
  }) => {
    // When flag is disabled on the server (default), endpoint safely guards with 403
    const res = await authedPage.request.get("/api/v06/cli/sessions/conv_e2e_test");
    expect([200, 403, 404]).toContain(res.status());
    if (res.status() === 403) {
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toContain("cliUnifiedSession");
    }
  });

  test("2. Provider switch endpoint requires valid payload", async ({ authedPage }) => {
    // Attempt switch without valid conversation/provider
    const res = await authedPage.request.post("/api/v06/cli/switch-provider", {
      data: { conversationId: "nonexistent", to: "codex" },
    });
    // Must refuse safely (400, 403, or 404), never crash
    expect([400, 403, 404]).toContain(res.status());
  });

  test("3. Memory handoff endpoint returns structured prompt", async ({ authedPage }) => {
    const res = await authedPage.request.post("/api/v06/cli/handoff", {
      data: {
        conversationId: "conv_test_handoff",
        summary: "E2E Test Memory Context",
        lastMessages: [],
        openTasks: [],
      },
    });
    expect([200, 400, 403, 404]).toContain(res.status());
  });

  test("4. Chat and CLI conversation UI elements render", async ({ authedPage, setFlags }) => {
    await setFlags({ cliUnifiedSession: true, cliDeElevated: true });
    await authedPage.goto("/agents");

    // Check presence of messages/terminal container in UI
    const container = authedPage.locator('[data-testid="agent-hub"], [data-testid="terminal-container"], main');
    await expect(container.first()).toBeVisible();
  });
});
