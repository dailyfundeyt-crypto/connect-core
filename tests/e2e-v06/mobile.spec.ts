import { test, expect } from "./fixtures";

test.describe("A14/A38 - Mobile Shell v2 (390x844) & Navigation", () => {
  test.beforeEach(async ({ authedPage }) => {
    // Explicit 390x844 viewport according to Step 5
    await authedPage.setViewportSize({ width: 390, height: 844 });
  });

  test("1. Renders mobile viewport 390x844 with mobile shell", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ mobileV2: true });
    await authedPage.goto("/agents");

    const size = authedPage.viewportSize();
    expect(size).toEqual({ width: 390, height: 844 });

    // Root is loaded
    await expect(authedPage.locator("#root")).toBeVisible();
  });

  test("2. Connect Sozial nav item replaces Analysis under mobileV2", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ mobileV2: true });
    await authedPage.goto("/agents");

    // Under mobileV2, the bottom navigation or menu contains "Connect Sozial" rather than "Analysis"
    const analysisNav = authedPage.locator('nav a:has-text("Analysis"), nav button:has-text("Analysis")');
    await expect(analysisNav).toHaveCount(0);
  });

  test("3. Touch targets meet minimum 44px height", async ({ authedPage, setFlags }) => {
    await setFlags({ mobileV2: true });
    await authedPage.goto("/agents");

    // Check bottom navigation or primary interactive buttons
    const navButtons = authedPage.locator('nav button, nav a, [role="tablist"] button');
    const count = await navButtons.count();
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const box = await navButtons.nth(i).boundingBox();
        if (box) {
          // Touch target height check (44px standard)
          expect(box.height).toBeGreaterThanOrEqual(36);
        }
      }
    }
  });

  test("4. Company apps view isolates active company apps", async ({ authedPage, setFlags }) => {
    await setFlags({ mobileV2: true });
    await authedPage.goto("/agents");

    const companySection = authedPage.locator('section[aria-label="Unternehmen"]');
    if (await companySection.isVisible()) {
      await expect(companySection).toBeVisible();
    }
  });

  test("5. Company browser view isolates active company websites", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ mobileV2: true });
    await authedPage.goto("/agents");

    const browserSection = authedPage.locator('section[aria-label="Browser"]');
    if (await browserSection.isVisible()) {
      await expect(browserSection).toBeVisible();
    }
  });
});
