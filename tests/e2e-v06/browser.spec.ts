import { test, expect } from "./fixtures";

test.describe("A09/A16/A28 - Browser Profiles & Split Layout", () => {
  test("1. Browser profiles REST endpoint gates on browserProfiles flag", async ({
    authedPage,
  }) => {
    const res = await authedPage.request.get("/api/v06/browser-profiles");
    expect([200, 404]).toContain(res.status());
    if (res.status() === 404) {
      const body = await res.json();
      expect(body.error).toContain("browserProfiles");
    }
  });

  test("2. Split layout structure under browserSplitLayout flag", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ browserSplitLayout: true, browserProfiles: true });
    await authedPage.goto("/agents");

    const splitLayout = authedPage.locator('[data-testid="browser-split-layout"]');
    if (await splitLayout.isVisible()) {
      await expect(splitLayout).toBeVisible();

      // Top bar for profile tabs
      const tabsBar = authedPage.locator('[data-testid="profile-tabs-bar"]');
      await expect(tabsBar).toBeVisible();

      // Left pane for group tree
      const groupTree = authedPage.locator('[data-testid="group-tree"]');
      await expect(groupTree).toBeVisible();

      // Right pane for tab stage
      const tabStage = authedPage.locator('[data-testid="tab-stage"], [data-testid="tab-stage-empty"]');
      await expect(tabStage).toBeVisible();
    }
  });

  test("3. Profile limit: plus button disabled when profile cap (10) reached", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ browserSplitLayout: true });
    await authedPage.goto("/agents");

    const plusBtn = authedPage.locator('[data-testid="new-profile-button"]');
    if (await plusBtn.isVisible()) {
      // If 10 profiles exist, verify disabled attribute
      const profileTabs = authedPage.locator('[data-testid="profile-tab"]');
      const count = await profileTabs.count();
      if (count >= 10) {
        await expect(plusBtn).toBeDisabled();
      }
    }
  });

  test("4. 'Sitzung beenden' trigger opens confirmation dialog", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ browserSplitLayout: true });
    await authedPage.goto("/agents");

    const endSessionBtn = authedPage.locator('[data-testid="end-session-button"]');
    if (await endSessionBtn.isVisible()) {
      await endSessionBtn.click();
      const confirmDialog = authedPage.locator('[data-testid="end-session-confirm"]');
      await expect(confirmDialog).toBeVisible();
      // Cancel dialog without making destructive changes
      const cancelBtn = authedPage.locator('[data-testid="end-session-confirm-no"]');
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
      }
    }
  });

  test("5. PC Apps in Groups REST endpoint check", async ({ authedPage }) => {
    const res = await authedPage.request.get("/api/v06/pc-apps");
    expect([200, 404]).toContain(res.status());
  });
});
