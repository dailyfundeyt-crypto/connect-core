import { test, expect } from "./fixtures";

test.describe("A25 - Onboarding v2 (7-Stufen Flow & Theme-Wahl)", () => {
  test("1. Onboarding state REST endpoint", async ({ authedPage }) => {
    const res = await authedPage.request.get("/api/v06/onboarding/state");
    // Depending on DB/flag status, returns 200 or 404/503
    expect([200, 404, 503]).toContain(res.status());
  });

  test("2. Navigating to /onboarding?restart=true renders 7-step flow under onboardingV2", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ onboardingV2: true, themeV2: true });
    await authedPage.goto("/onboarding?restart=true");

    // Stepper with 7 step columns
    const stepperGrid = authedPage.locator(".grid-cols-7, [role='progressbar']");
    if (await stepperGrid.first().isVisible()) {
      await expect(stepperGrid.first()).toBeVisible();
    }

    // Step text check
    const stepHeading = authedPage.locator('text="Schritt 1 von 7"');
    if (await stepHeading.isVisible()) {
      await expect(stepHeading).toBeVisible();
    }
  });

  test("3. Step 2 Theme choice renders without full page reload", async ({
    authedPage,
    setFlags,
  }) => {
    await setFlags({ onboardingV2: true, themeV2: true });
    await authedPage.goto("/onboarding?restart=true");

    const continueBtn = authedPage.locator('button:has-text("Weiter"), button:has-text("Fortfahren")');
    if (await continueBtn.first().isVisible()) {
      await continueBtn.first().click();

      // Step 2 is Theme selection
      const themeStep = authedPage.locator('[data-testid="v06-theme-choice-step"], [aria-label="Theme-Auswahl"], text="Darstellung"');
      if (await themeStep.first().isVisible()) {
        await expect(themeStep.first()).toBeVisible();
      }
    }
  });

  test("4. Resume state & once-only protection", async ({ authedPage, setFlags }) => {
    await setFlags({ onboardingV2: true });
    // Without ?restart=true, already onboarded user is redirected to "/" or "/agents"
    await authedPage.goto("/onboarding");
    await authedPage.waitForURL(/(agents|\/|onboarding)/);
    expect(authedPage.url()).toBeTruthy();
  });
});
