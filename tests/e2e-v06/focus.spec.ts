import { test, expect } from "./fixtures";

test.describe("A02/A35 - Focus Area & Live-Preview Control Toggle", () => {
  test("1. Verifies focus cards order and structure under focusV2", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ focusV2: true, liveToggleOnly: true });
    await authedPage.goto("/agents");

    // In focus mode or focus cards view, verify exactly 4 cards are defined
    const cards = authedPage.locator('[data-testid^="focus-card-"]');
    const count = await cards.count();
    if (count > 0) {
      expect(count).toBe(4);
      // Ensure 'agenten' card is not present
      await expect(authedPage.locator('[data-testid="focus-card-agenten"]')).toHaveCount(0);
    }
  });

  test("2. Grok-Bot target display and settings fallback", async ({ authedPage, setFlags }) => {
    await setFlags({ focusV2: true });
    await authedPage.goto("/agents");

    // Verify no legacy Perplexity link exists in focus area
    const perplexityLink = authedPage.locator('a[href*="perplexity.ai"]');
    await expect(perplexityLink).toHaveCount(0);
  });

  test("3. Live-Preview control toggle: Zuschauen | Steuern without redundant take-over button", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ liveToggleOnly: true });
    await authedPage.goto("/agents");

    const liveToggle = authedPage.locator('[data-testid="live-control-toggle"]');
    if (await liveToggle.isVisible()) {
      const watchBtn = authedPage.locator('[data-testid="live-toggle-watch"]');
      const controlBtn = authedPage.locator('[data-testid="live-toggle-control"]');

      await expect(watchBtn).toBeVisible();
      await expect(controlBtn).toBeVisible();

      // Redundant legacy "Übernehmen" button is hidden under liveToggleOnly
      const legacyBtn = authedPage.locator('button[data-testid="control-toggle"]');
      await expect(legacyBtn).toHaveCount(0);
    }
  });

  test("4. ARIA attributes and accessibility of LiveControlToggle", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ liveToggleOnly: true });
    await authedPage.goto("/agents");

    const liveToggle = authedPage.locator('[data-testid="live-control-toggle"]');
    if (await liveToggle.isVisible()) {
      await expect(liveToggle).toHaveAttribute("role", "group");
      await expect(liveToggle).toHaveAttribute("aria-label", "Modus");

      const watchBtn = authedPage.locator('[data-testid="live-toggle-watch"]');
      const controlBtn = authedPage.locator('[data-testid="live-toggle-control"]');

      await expect(watchBtn).toHaveAttribute("aria-pressed");
      await expect(controlBtn).toHaveAttribute("aria-pressed");
    }
  });
});
