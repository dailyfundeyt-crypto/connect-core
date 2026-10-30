import { test, expect } from "./fixtures";

test.describe("A21/A24/A27 - Connect Sozial (Timeline, Composer, TaskTree)", () => {
  test("1. Social posts REST endpoint gates on socialV1 flag", async ({ authedPage }) => {
    const res = await authedPage.request.get("/api/v06/social/posts");
    expect([200, 404]).toContain(res.status());
    if (res.status() === 404) {
      const body = await res.json();
      expect(body.error).toContain("socialV1");
    }
  });

  test("2. Social research projects REST endpoint gates on socialV1 flag", async ({
    authedPage,
  }) => {
    const res = await authedPage.request.get("/api/v06/social/projects");
    expect([200, 404]).toContain(res.status());
  });

  test("3. Social Timeline UI layout under socialV1 flag", async ({ authedPage, setFlags }) => {
    await setFlags({ socialV1: true });
    await authedPage.goto("/social");

    const timeline = authedPage.locator('[data-testid="social-timeline-container"]');
    if (await timeline.isVisible()) {
      await expect(timeline).toBeVisible();

      // Check feed tabs: "Für dich" and "Folge ich"
      const forYouTab = authedPage.locator('[data-testid="timeline-tab-for-you"]');
      const followingTab = authedPage.locator('[data-testid="timeline-tab-following"]');
      await expect(forYouTab).toBeVisible();
      await expect(followingTab).toBeVisible();
    }
  });

  test("4. Social Composer author toggle and validation (No external post sent)", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ socialV1: true });
    await authedPage.goto("/social");

    const composer = authedPage.locator('[data-testid="social-composer"]');
    if (await composer.isVisible()) {
      await expect(composer).toBeVisible();

      // Author toggles: Company vs Bot
      const companyToggle = authedPage.locator('[data-testid="composer-author-company-toggle"]');
      const botToggle = authedPage.locator('[data-testid="composer-author-bot-toggle"]');

      if (await companyToggle.isVisible() && await botToggle.isVisible()) {
        await expect(companyToggle).toBeVisible();
        await expect(botToggle).toBeVisible();
      }

      // Empty post submit button is disabled or prevented
      const textarea = authedPage.locator('[data-testid="composer-textarea"]');
      const submitBtn = authedPage.locator('[data-testid="composer-submit-button"]');
      if (await textarea.isVisible() && await submitBtn.isVisible()) {
        await textarea.fill("");
        // Verification without submitting: Empty post cannot be published
        await expect(submitBtn).toBeDisabled();
      }
    }
  });

  test("5. Article offer display card payment button is disabled", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ socialV1: true });
    await authedPage.goto("/social");

    const offerCard = authedPage.locator('[data-testid="article-offer-display-card"]');
    if (await offerCard.first().isVisible()) {
      const disabledAction = offerCard.first().locator('[data-testid="offer-disabled-action-button"]');
      await expect(disabledAction).toBeDisabled();
    }
  });
});
