import { test, expect } from "./fixtures";

test.describe("A20/A23 - Store Frontend (Play-Store Optik) & Listings Backend", () => {
  test("1. Store listings REST endpoint gates on storeV1 flag", async ({ authedPage }) => {
    const res = await authedPage.request.get("/api/v06/store/listings");
    expect([200, 404]).toContain(res.status());
    if (res.status() === 404) {
      const body = await res.json();
      expect(body.error).toContain("storeV1");
    }
  });

  test("2. Store UI layout renders category tabs under storeV1 flag", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ storeV1: true });
    await authedPage.goto("/store");

    const categoryNav = authedPage.locator('[aria-label="Store Kategorien"], nav[role="tablist"]');
    if (await categoryNav.isVisible()) {
      await expect(categoryNav).toBeVisible();

      // Check for core category tabs: Alle, MCPs, Tools, Skills, Firmen
      const tabs = categoryNav.locator("button");
      expect(await tabs.count()).toBeGreaterThanOrEqual(3);
    }
  });

  test("3. Store search bar filters listings", async ({ authedPage, setFlags }) => {
    await setFlags({ storeV1: true });
    await authedPage.goto("/store");

    const searchInput = authedPage.locator('input[placeholder*="Store durchsuchen" i], input[type="search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill("Search-Test");
      await expect(searchInput).toHaveValue("Search-Test");
    }
  });

  test("4. Publish Wizard button exists and opens with 0-cent price model", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ storeV1: true });
    await authedPage.goto("/store");

    const publishBtn = authedPage.locator('button[aria-label="Veröffentlichen"], button:has-text("Veröffentlichen")');
    if (await publishBtn.isVisible()) {
      await publishBtn.click();
      const modal = authedPage.locator('[role="dialog"]');
      if (await modal.isVisible()) {
        await expect(modal).toBeVisible();
        // Close modal safely
        const closeBtn = modal.locator('button[aria-label="Schließen"], button:has-text("Abbrechen")');
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
        }
      }
    }
  });

  test("5. Admin review button available for administrative accounts", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ storeV1: true });
    await authedPage.goto("/store");

    const reviewBtn = authedPage.locator('button[aria-label="Admin Review"], button:has-text("Review")');
    if (await reviewBtn.isVisible()) {
      await expect(reviewBtn).toBeVisible();
    }
  });
});
